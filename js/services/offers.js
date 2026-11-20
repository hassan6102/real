// خدمة عروض السماسرة: properties/{pid}/offers/{oid} (عام: السعر والحالة) + .../private/data (الهاتف والعمولة والملاحظات).
// الخاص يتبع صلاحية canViewOwnerData كبقية بيانات المالك. تعديل عرض لا يمس عروضًا أخرى، وحذفه لا يمس العقار.
import { db, doc, collection, getDoc, getDocs, onSnapshot, writeBatch, updateDoc, serverTimestamp } from '../firebase-config.js';
import { validateOffer, buildOffer, summarize } from '../offers-model.js';
import { displayCode } from '../property-model.js';

export const offersCol = pid => collection(db, 'properties', pid, 'offers');
export const offerRef = (pid, oid) => doc(db, 'properties', pid, 'offers', oid);
export const offerPrivRef = (pid, oid) => doc(db, 'properties', pid, 'offers', oid, 'private', 'data');
const propRef = pid => doc(db, 'properties', pid);

const stamp = u => ({ updatedBy: u.uid, updatedByName: u.name || '', updatedAt: serverTimestamp() });
const ms = t => t?.toMillis?.() || 0;
const sortOffers = list => list.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
export function validationError(errors) { const e = new Error(Object.values(errors)[0]); e.code = 'VALIDATION_ERROR'; e.errors = errors; return e; }

function log(batch, user, action, prop, extra = {}) {
  batch.set(doc(collection(db, 'activityLogs')), { userId: user.uid, userName: user.name || '', action, entityType: 'property', entityId: prop.id, entityLabel: displayCode(prop), ...extra, createdAt: serverTimestamp() });
}

/** مراقبة لحظية للعروض العامة (يقرؤها كل الفريق). */
export const watchOffers = (pid, cb, onError) => onSnapshot(offersCol(pid), s => cb(sortOffers(s.docs.map(d => ({ id: d.id, ...d.data() })))), e => { console.error(e); onError?.(e); });

/** يضيف البيانات الخاصة لكل عرض. من لا يملك الصلاحية يحصل على null بدل خطأ. */
export const withPrivate = offers => Promise.all(offers.map(async o => ({ ...o, _priv: (await getDoc(offerPrivRef(o.propertyId, o.id)).catch(() => null))?.data?.() || null })));

export async function listOffers(pid, priv = false) {
  const list = sortOffers((await getDocs(offersCol(pid))).docs.map(d => ({ id: d.id, ...d.data(), propertyId: pid })));
  return priv ? withPrivate(list) : list;
}

/**
 * يعيد حساب ملخص العروض (أقل سعر نشط وعددها) من القراءة الحديثة ويكتبه على العقار إن اختلف.
 * يُستدعى بعد كل تغيير في العروض وعند فتح صفحة العقار (علاج ذاتي إن فشلت الخطوة الثانية أو تزامن موظفان).
 */
export async function syncSummary(user, pid) {
  const [offers, snap] = await Promise.all([listOffers(pid), getDoc(propRef(pid))]);
  if (!snap.exists()) return { changed: false };
  const s = summarize(offers), cur = snap.data();
  const same = cur.offersSummary && ['activeCount', 'totalCount', 'minPrice', 'maxPrice'].every(k => (cur.offersSummary[k] ?? null) === (s[k] ?? null));
  const priceOk = s.minPrice == null || cur.price === s.minPrice;
  if (same && priceOk) return { changed: false, summary: s };
  await updateDoc(propRef(pid), { offersSummary: s, ...(s.minPrice != null && { price: s.minPrice }), offersUpdatedAt: serverTimestamp(), offersUpdatedBy: user.uid });
  return { changed: true, summary: s };
}

export async function addOffer(user, prop, values) {
  const errs = validateOffer(values); if (Object.keys(errs).length) throw validationError(errs);
  const { pub, priv } = buildOffer(values);
  const ref = doc(offersCol(prop.id)), b = writeBatch(db);
  b.set(ref, { ...pub, propertyId: prop.id, createdBy: user.uid, createdByName: user.name || '', createdAt: serverTimestamp(), ...stamp(user) });
  if (Object.keys(priv).length) b.set(offerPrivRef(prop.id, ref.id), priv);
  log(b, user, 'offer_create', prop, { offerId: ref.id, price: pub.price ?? null });
  await b.commit();
  await syncSummary(user, prop.id);
  return ref.id;
}

/** canPrivate: هل يملك المستخدم صلاحية تعديل البيانات الخاصة؟ وإلا يُعدَّل السعر والحالة فقط. */
export async function updateOffer(user, prop, offer, values, canPrivate) {
  const errs = validateOffer(values); if (Object.keys(errs).length) throw validationError(errs);
  const { pub, priv } = buildOffer(values);
  const b = writeBatch(db);
  b.update(offerRef(prop.id, offer.id), { ...pub, ...stamp(user) });
  if (canPrivate) b.set(offerPrivRef(prop.id, offer.id), { ...priv, ...(offer._priv?.legacy && { legacy: offer._priv.legacy }) });
  log(b, user, 'offer_update', prop, { offerId: offer.id, from: offer.price ?? null, to: pub.price ?? null });
  await b.commit();
  await syncSummary(user, prop.id);
}

export async function setOfferStatus(user, prop, offer, status) {
  const b = writeBatch(db);
  b.update(offerRef(prop.id, offer.id), { status, ...stamp(user) });
  log(b, user, 'offer_status', prop, { offerId: offer.id, from: offer.status, to: status });
  await b.commit();
  await syncSummary(user, prop.id);
}

/** حذف عرض (للمدير فقط في القواعد). لا يحذف العقار. */
export async function deleteOffer(user, prop, offer) {
  const b = writeBatch(db);
  b.delete(offerPrivRef(prop.id, offer.id)); b.delete(offerRef(prop.id, offer.id));
  log(b, user, 'offer_delete', prop, { offerId: offer.id });
  await b.commit();
  await syncSummary(user, prop.id);
}
