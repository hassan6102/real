import { db, doc, collection, getDoc, getDocs, query, where, orderBy, limit, startAfter,
  runTransaction, writeBatch, serverTimestamp, collectionGroup } from '../firebase-config.js';
import { listFilters, archiveFor, diffKeys, flatten, carryLegacyPublic, carryLegacyPrivate, displayCode, parseCodeQuery } from '../property-model.js';
import { buildOffer, validateOffer, summarize } from '../offers-model.js';
import { takeNextNo } from '../code-counter.js';
import { validationError, offerRef, offerPrivRef, offersCol } from './offers.js';

// حقول لا تُستبدل عند التعديل من الاستمارة: الكود الرقمي ثابت، والسعر والملخص مصدرهما العروض.
const PRESERVE = ['code', 'propertyNo', 'createdBy', 'createdByName', 'createdAt', 'originalPrice', 'price', 'offersSummary', 'offersUpdatedAt', 'offersUpdatedBy',
  'offersMigrated', 'offersMigratedAt', 'offersMigrationNote', 'status', 'isArchived', 'statusChangedAt', 'statusChangedBy', 'statusChangedByName', 'closedAt'];
export const propRef = id => doc(db, 'properties', id);
const privRef = id => doc(db, 'properties', id, 'private', 'data');
const counterRef = () => doc(db, 'settings', 'counters');

const logDoc = (user, action, id, label, extra = {}) => ({ userId: user.uid, userName: user.name || '', action, entityType: 'property', entityId: id, entityLabel: label, ...extra, createdAt: serverTimestamp() });
function log(batch, user, action, id, label, extra) { batch.set(doc(collection(db, 'activityLogs')), logDoc(user, action, id, label, extra)); }
const stamp = u => ({ updatedBy: u.uid, updatedByName: u.name || '', updatedAt: serverTimestamp() });

export async function getProperty(id, withPrivate) {
  const s = await getDoc(propRef(id));
  if (!s.exists()) return null;
  let priv = null;
  if (withPrivate) priv = (await getDoc(privRef(id)).catch(() => null))?.data() || {};
  return { id, ...s.data(), _priv: priv };
}

/**
 * ينشئ العقار وعرضه الأول وكوده الرقمي في معاملة واحدة: إما أن تنجح كلها أو لا يُستهلك أي رقم.
 * offerValues: قيم الاستمارة للعرض الأول (السعر مطلوب). يعيد { id, propertyNo }.
 */
export async function createProperty(user, pub, priv, offerValues) {
  const errs = validateOffer(offerValues || {}); if (Object.keys(errs).length) throw validationError(errs);
  const { pub: oPub, priv: oPriv } = buildOffer(offerValues);
  const ref = doc(collection(db, 'properties')), oRef = doc(collection(db, 'properties', ref.id, 'offers')), lRef = doc(collection(db, 'activityLogs'));
  const status = pub.status || 'available';
  const summary = summarize([oPub]);
  const no = await runTransaction(db, async t => {
    const n = await takeNextNo(t, counterRef());
    t.set(ref, { ...pub, price: oPub.price, code: String(n), propertyNo: n, status, isArchived: archiveFor(status), originalPrice: oPub.price,
      offersSummary: summary, offersUpdatedAt: serverTimestamp(), offersUpdatedBy: user.uid,
      createdBy: user.uid, createdByName: user.name || '', createdAt: serverTimestamp(), ...stamp(user) });
    if (Object.keys(priv).length) t.set(privRef(ref.id), priv);
    t.set(oRef, { ...oPub, propertyId: ref.id, createdBy: user.uid, createdByName: user.name || '', createdAt: serverTimestamp(), ...stamp(user) });
    if (Object.keys(oPriv).length) t.set(offerPrivRef(ref.id, oRef.id), oPriv);
    t.set(lRef, logDoc(user, 'property_create', ref.id, String(n)));
    return n;
  });
  return { id: ref.id, propertyNo: no };
}

export async function updateProperty(user, old, pub, priv, canOwner) {
  const next = carryLegacyPublic(old, { ...pub, ...stamp(user) });
  PRESERVE.forEach(k => { if (old[k] !== undefined) next[k] = old[k]; });
  next.status = old.status;
  const keys = diffKeys(flatten({ ...old, id: undefined, _priv: undefined }), flatten(next)).filter(k => !PRESERVE.includes(k) && k !== 'id' && !k.startsWith('_priv'));
  const b = writeBatch(db);
  b.set(propRef(old.id), next);
  if (canOwner) b.set(privRef(old.id), carryLegacyPrivate(old._priv || {}, priv));
  log(b, user, 'property_update', old.id, displayCode(old), { changedKeys: keys.slice(0, 30) });
  await b.commit();
}

/** تغيير الحالة. عند البيع/التأجير يُسجَّل العرض المنفّذ (offerId) وسعره إن اختير. */
export async function changeStatus(user, p, status, finalPrice, offer) {
  const closed = status === 'sold' || status === 'rented';
  const b = writeBatch(db);
  b.update(propRef(p.id), { status, isArchived: archiveFor(status), statusChangedAt: serverTimestamp(), statusChangedBy: user.uid, statusChangedByName: user.name || '',
    ...(closed && { closedAt: serverTimestamp() }), ...stamp(user) });
  if (closed) b.set(doc(collection(db, 'deals')), { propertyId: p.id, code: displayCode(p), propertyNo: p.propertyNo ?? null, kind: status === 'sold' ? 'sale' : 'rent',
    listedPrice: offer?.price ?? p.price ?? null, finalPrice: finalPrice ?? offer?.price ?? p.price ?? null, ...(offer && { offerId: offer.id }), closedBy: user.uid, closedByName: user.name || '', closedAt: serverTimestamp() });
  log(b, user, 'status_change', p.id, displayCode(p), { from: p.status, to: status, ...(offer && { offerId: offer.id }) });
  await b.commit();
}

/** عقار مرتبط بصفقات أو مفضلة لا يُحذف (يُؤرشف بدل ذلك). */
export async function getDeleteBlockers(p) {
  const out = { deals: 0, favorites: 0, error: false };
  try { out.deals = (await getDocs(query(collection(db, 'deals'), where('propertyId', '==', p.id), limit(1)))).size; } catch (e) { console.error(e); out.error = true; }
  try { out.favorites = (await getDocs(query(collectionGroupFavorites(), where('propertyId', '==', p.id), limit(1)))).size; } catch (e) { console.error(e); out.error = true; }
  return out;
}
const collectionGroupFavorites = () => collectionGroup(db, 'favorites');

/** حذف نهائي (مدير): يحذف العقار وعروضه وبياناتها الخاصة. يرفض إن وُجدت صفقات أو مفضلة أو تعذّر التحقق. */
export async function deleteProperty(user, p) {
  const bl = await getDeleteBlockers(p);
  if (bl.error) { const e = new Error('تعذّر التحقق من ارتباط العقار بالصفقات والمفضلة، فلم يُحذف. تأكد من نشر الفهارس والقواعد.'); e.code = 'BLOCKER_CHECK_FAILED'; throw e; }
  if (bl.deals || bl.favorites) { const e = new Error(`لا يمكن حذف العقار لارتباطه بـ ${bl.deals ? 'صفقات' : ''}${bl.deals && bl.favorites ? ' و' : ''}${bl.favorites ? 'مفضلة' : ''}. غيّر حالته ليُؤرشف بدل حذفه.`); e.code = 'HAS_LINKS'; throw e; }
  const offers = (await getDocs(offersCol(p.id))).docs;
  const b = writeBatch(db);
  offers.forEach(o => { b.delete(offerPrivRef(p.id, o.id)); b.delete(offerRef(p.id, o.id)); });
  b.delete(privRef(p.id)); b.delete(propRef(p.id));
  log(b, user, 'property_delete', p.id, displayCode(p));
  await b.commit();
}

/** يبني استعلام قائمة بقيود خادمية (ترتيب بالأحدث). */
export function listQuery(opts, pageSize = 20, after) {
  const q = [...listFilters(opts).map(([f, op, v]) => where(f, op, v)), orderBy('createdAt', 'desc')];
  if (after) q.push(startAfter(after));
  return query(collection(db, 'properties'), ...q, limit(pageSize));
}

/** بحث بالكود: رقمي (propertyNo) أو قديم (P-000123). استعلام مساواة واحد فلا يحتاج فهرسًا مركبًا. */
export async function findByCode(input) {
  const q = parseCodeQuery(input); if (!q) return [];
  const out = new Map();
  const run = async (f, v) => (await getDocs(query(collection(db, 'properties'), where(f, '==', v), limit(5)))).docs.forEach(d => out.set(d.id, { id: d.id, ...d.data() }));
  if (q.no != null) await run('propertyNo', q.no);
  await run('code', q.code);
  if (q.no != null && !out.size) await run('code', 'P-' + String(q.no).padStart(6, '0'));
  return [...out.values()];
}

/** مرشحو التكرار: نفس نوع العقار ونفس المعاملة وغير مؤرشف، الأحدث أولًا وبحد أقصى. الفلترة الدقيقة في المتصفح. */
export async function fetchDuplicatePool(draft, max = 300) {
  if (!draft.propertyType || !draft.transactionType) return [];
  const s = await getDocs(query(collection(db, 'properties'), where('isArchived', '==', false), where('transactionType', '==', draft.transactionType),
    where('propertyType', '==', draft.propertyType), orderBy('createdAt', 'desc'), limit(max)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export { getDocs };
