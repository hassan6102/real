// نموذج عروض السماسرة: دوال خالصة (بلا Firebase ولا DOM). العقار = الوحدة، والعرض = مصدر/سمسار بسعر وشروط مستقلة.
// لا يوجد أي منطق يمنع تكرار رقم الهاتف: الرقم مجرد بيانات وليس مفتاحًا.
import { normalizePhone, toLatinDigits, fmtNumber } from './utils.js';

export const OFFER_STATUSES = { active: 'نشط', unavailable: 'غير متاح', expired: 'منتهي' };
export const SOURCE_KINDS = { broker: 'سمسار', owner: 'مالك مباشر' };
export const COMMISSION_PAYER = { owner: 'المالك', buyer: 'المشتري', both: 'الطرفان' };

const isNum = v => typeof v === 'number' && Number.isFinite(v);
/** يحوّل نصًا (بأرقام عربية/هندية وفواصل) إلى رقم. فارغ → null، غير صالح → NaN. */
export function toNumber(v) {
  const s = toLatinDigits(String(v ?? '')).replace(/[٬,\s]/g, '').replace('٫', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** يتحقق من بيانات عرض (قيم الاستمارة كنصوص). الهاتف اختياري، وغير مقيّد بالتفرد. */
export function validateOffer(v = {}) {
  const e = {};
  const price = toNumber(v.price);
  if (price === null) e.price = 'السعر مطلوب';
  else if (Number.isNaN(price) || price <= 0) e.price = 'أدخل سعرًا صحيحًا أكبر من صفر';
  if (String(v.brokerPhone ?? '').trim()) {
    const d = normalizePhone(v.brokerPhone);
    if (d.length < 7 || d.length > 15) e.brokerPhone = 'رقم الهاتف غير صحيح';
  }
  const pct = toNumber(v.commissionPercent);
  if (Number.isNaN(pct) || (pct != null && (pct < 0 || pct > 100))) e.commissionPercent = 'النسبة بين 0 و100';
  const cv = toNumber(v.commissionValue);
  if (Number.isNaN(cv) || (cv != null && cv < 0)) e.commissionValue = 'أدخل قيمة صحيحة';
  const mp = toNumber(v.minPrice);
  if (Number.isNaN(mp) || (mp != null && mp < 0)) e.minPrice = 'أدخل قيمة صحيحة';
  if (v.status && !OFFER_STATUSES[v.status]) e.status = 'حالة غير صالحة';
  return e;
}

const put = (o, k, v) => { if (v !== undefined && v !== null && v !== '') o[k] = v; };

/** يبني مستندي العرض: pub (يقرؤه كل الفريق: السعر والحالة) و priv (الهاتف والعمولة والملاحظات بصلاحية canViewOwnerData). */
export function buildOffer(v = {}) {
  const pub = { status: OFFER_STATUSES[v.status] ? v.status : 'active', sourceKind: SOURCE_KINDS[v.sourceKind] ? v.sourceKind : 'broker' };
  const price = toNumber(v.price);
  if (isNum(price)) pub.price = price;
  const priv = {};
  put(priv, 'brokerName', String(v.brokerName ?? '').trim());
  const ph = String(v.brokerPhone ?? '').trim();
  if (ph) { priv.brokerPhone = ph; priv.brokerPhoneKey = normalizePhone(ph); }
  put(priv, 'commissionAgreed', String(v.commissionAgreed ?? '').trim());
  for (const k of ['commissionPercent', 'commissionValue', 'minPrice']) { const n = toNumber(v[k]); if (isNum(n)) priv[k] = n; }
  if (COMMISSION_PAYER[v.commissionPayer]) priv.commissionPayer = v.commissionPayer;
  put(priv, 'notes', String(v.notes ?? '').trim());
  return { pub, priv };
}

/** ملخص العروض الذي يُخزَّن على مستند العقار لتبقى فلاتر السعر والترتيب تعمل خادميًا. */
export function summarize(offers = []) {
  const active = offers.filter(o => o.status === 'active');
  const prices = (active.length ? active : offers).map(o => o.price).filter(isNum);
  return { activeCount: active.length, totalCount: offers.length, minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null };
}

/** وصف السعر لأي واجهة: يوضح أنه "أقل عرض" عند تعدد العروض. */
export function priceInfo(p = {}) {
  const s = p.offersSummary;
  const price = isNum(p.price) ? p.price : null;
  if (!s) return { text: price != null ? `${fmtNumber(price)} جنيه` : 'السعر غير مسجل', note: '', multi: false, noActive: false };
  if (s.activeCount === 0) return { text: price != null ? `${fmtNumber(price)} جنيه` : 'السعر غير مسجل', note: 'لا يوجد عرض نشط', multi: false, noActive: true };
  const note = s.activeCount > 1
    ? (s.minPrice !== s.maxPrice ? `أقل عرض من ${s.activeCount} عروض (حتى ${fmtNumber(s.maxPrice)})` : `${s.activeCount} عروض بنفس السعر`)
    : '';
  return { text: price != null ? `${fmtNumber(price)} جنيه` : 'السعر غير مسجل', note, multi: s.activeCount > 1, noActive: false };
}

const OFFER_STATUS_FROM_PROPERTY = { available: 'active', reserved: 'active', sold: 'expired', rented: 'expired', suspended: 'unavailable', unavailable: 'unavailable' };
export const legacyOfferId = propertyId => 'legacy_' + propertyId;

/**
 * يحوّل بيانات السمسار/المالك القديمة (داخل مستند العقار والمستند الخاص) إلى عرض.
 * لا يحذف شيئًا من المصدر، وينسخ الكتل القديمة كاملة داخل legacy لتبقى قابلة للرجوع.
 * يعيد null إن لم توجد أي بيانات سعر أو اتصال.
 */
export function legacyToOffer(prop = {}, priv = {}) {
  const o = priv.owner || {}, f = priv.financial || {};
  const kind = o.kind === 'broker' || (!o.kind && o.brokerPhone) ? 'broker' : 'owner';
  const phone = kind === 'broker' ? (o.brokerPhone || o.phone || '') : (o.phone || o.brokerPhone || '');
  const name = kind === 'broker' ? (o.brokerName || o.name || '') : (o.name || o.brokerName || '');
  const price = isNum(prop.price) ? prop.price : null;
  const commissionAgreed = f.commissionAgreed || o.commission || '';
  const has = price != null || phone || name || commissionAgreed || isNum(f.commissionPercent) || isNum(f.commissionValue) || isNum(f.minPrice) || o.notes;
  if (!has) return null;
  const pub = { status: OFFER_STATUS_FROM_PROPERTY[prop.status] || 'active', sourceKind: kind, migratedFromLegacy: true };
  if (price != null) pub.price = price;
  const p = {};
  put(p, 'brokerName', name);
  if (phone) { p.brokerPhone = phone; p.brokerPhoneKey = normalizePhone(phone); }
  put(p, 'commissionAgreed', commissionAgreed);
  for (const [k, src] of [['commissionPercent', f.commissionPercent], ['commissionValue', f.commissionValue], ['minPrice', f.minPrice]]) if (isNum(src)) p[k] = src;
  if (f.commissionPayer) p.commissionPayer = f.commissionPayer;
  put(p, 'notes', o.notes || '');
  p.legacy = { owner: o, financial: f };
  return { pub, priv: p };
}
