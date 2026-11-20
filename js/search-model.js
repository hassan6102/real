// البحث الهجين: قيود الخادم (Firestore) + فلترة المتصفح على كل دفعة. دوال خالصة قابلة للاختبار.
import { PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES, normalizeAr, toLatinDigits, fmtNumber } from './utils.js';
import { FINISHING, floorLabel } from './property-model.js';

export const SORTS = {
  newest: { label: 'الأحدث إضافة', field: 'createdAt', dir: 'desc' },
  price_asc: { label: 'الأقل سعرًا', field: 'price', dir: 'asc' },
  price_desc: { label: 'الأعلى سعرًا', field: 'price', dir: 'desc' },
  area_desc: { label: 'الأكبر مساحة', field: 'area', dir: 'desc' },
  area_asc: { label: 'الأقل مساحة', field: 'area', dir: 'asc' },
  updated: { label: 'آخر تحديث', field: 'updatedAt', dir: 'desc' }
};
export const FACILITIES = { gas: ['غاز طبيعي', 'facilities.gas'], elevator: ['أسانسير', 'facilities.elevator'], garage: ['جراج', 'engineering.garage'],
  indepElectric: ['عداد كهرباء مستقل', 'facilities.indepElectric'], indepWater: ['عداد مياه مستقل', 'facilities.indepWater'],
  indepGas: ['عداد غاز مستقل', 'facilities.indepGas'], internet: ['إنترنت أرضي', 'facilities.internet'] };
export const FLOOR_FLAGS = { ground: 'أرضي', top: 'أخير', repeated: 'متكرر' };
const NUM = ['priceMin', 'priceMax', 'areaMin', 'areaMax', 'floorMin', 'floorMax', 'yearMin', 'yearMax'];
const ARR = ['tx', 'types', 'floorFlags', 'rooms', 'bathrooms', 'receptions', 'finishing', 'facilities'];
const STR = ['districts', 'street', 'addedBy', 'status', 'addedFrom', 'addedTo', 'updatedFrom', 'updatedTo'];

/** ينظّف قيم النموذج: يحذف الفارغ، ويحوّل الأرقام (بما فيها الهندية). */
export function cleanFilters(raw = {}) {
  const f = {};
  for (const k of NUM) { const s = toLatinDigits(String(raw[k] ?? '')).replace(/,/g, '').trim(); if (s !== '' && Number.isFinite(Number(s))) f[k] = Number(s); }
  for (const k of ARR) if (Array.isArray(raw[k]) && raw[k].length) f[k] = [...raw[k]];
  for (const k of STR) { const s = String(raw[k] ?? '').trim(); if (s) f[k] = s; }
  return f;
}

const startOf = s => new Date(s + 'T00:00:00'), endOf = s => new Date(s + 'T23:59:59.999');
const RANGES = { price: ['priceMin', 'priceMax', Number], area: ['areaMin', 'areaMax', Number], createdAt: ['addedFrom', 'addedTo', null], updatedAt: ['updatedFrom', 'updatedTo', null] };

/** خطة الخادم: مساواة (الحالة، العملية الواحدة) + نطاق على حقل الترتيب فقط. الباقي للمتصفح. */
export function serverPlan(f, sortKey = 'newest') {
  const { field, dir } = SORTS[sortKey], conds = [], handled = new Set();
  if (f.status) { conds.push(['status', '==', f.status]); handled.add('status'); } else conds.push(['isArchived', '==', false]);
  if (f.tx?.length === 1) { conds.push(['transactionType', '==', f.tx[0]]); handled.add('tx'); }
  const [lo, hi] = RANGES[field];
  const date = field.endsWith('At');
  if (f[lo] != null) { conds.push([field, '>=', date ? startOf(f[lo]) : f[lo]]); handled.add(lo); }
  if (f[hi] != null) { conds.push([field, '<=', date ? endOf(f[hi]) : f[hi]]); handled.add(hi); }
  const clientKeys = Object.keys(f).filter(k => !handled.has(k));
  return { conds, field, dir, clientKeys, exactCount: clientKeys.length === 0 };
}

const at = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
const ms = t => t?.toMillis ? t.toMillis() : null;
const inRange = (v, lo, hi) => (lo == null && hi == null) || (v != null && (lo == null || v >= lo) && (hi == null || v <= hi));
const countMatch = (v, list) => !list || (v != null && list.some(x => (+x >= 5 ? v >= 5 : v === +x)));

/** يحدد هل العقار يطابق كل الفلاتر. الحقل غير المسجل لا يطابق أي فلتر عليه. */
export function clientMatch(p, f) {
  if (f.tx && !f.tx.includes(p.transactionType)) return false;
  if (f.types && !f.types.includes(p.propertyType)) return false;
  if (f.districts) {
    const terms = f.districts.split(/[,،]/).map(normalizeAr).filter(Boolean), d = normalizeAr(p.location?.district || '');
    if (terms.length && !terms.some(t => d.includes(t))) return false;
  }
  if (f.street && !normalizeAr(p.location?.street || '').includes(normalizeAr(f.street))) return false;
  if (!inRange(p.price, f.priceMin, f.priceMax) || !inRange(p.area, f.areaMin, f.areaMax)) return false;
  if (!inRange(p.floor, f.floorMin, f.floorMax) || !inRange(p.buildingDetails?.year, f.yearMin, f.yearMax)) return false;
  if (f.floorFlags) {
    const fl = p.floor, top = p.buildingDetails?.floors;
    const ok = f.floorFlags.some(x => x === 'ground' ? fl === 0 : x === 'top' ? fl != null && top != null && fl === top - 1 && fl > 0
      : fl != null && top != null && fl >= 1 && fl < top - 1);
    if (!ok) return false;
  }
  if (!countMatch(p.rooms, f.rooms) || !countMatch(p.bathrooms, f.bathrooms) || !countMatch(p.receptions, f.receptions)) return false;
  if (f.finishing && !f.finishing.includes(p.finishing)) return false;
  if (f.facilities && !f.facilities.every(k => at(p, FACILITIES[k][1]) === 'yes')) return false;
  if (f.addedBy && !normalizeAr(p.createdByName || '').includes(normalizeAr(f.addedBy))) return false;
  if (f.status && p.status !== f.status) return false;
  if (!f.status && p.isArchived) return false;
  for (const [field, [lo, hi]] of [['createdAt', ['addedFrom', 'addedTo']], ['updatedAt', ['updatedFrom', 'updatedTo']]]) {
    if (f[lo] == null && f[hi] == null) continue;
    const t = ms(p[field]);
    if (t == null || (f[lo] && t < startOf(f[lo]).getTime()) || (f[hi] && t > endOf(f[hi]).getTime())) return false;
  }
  return true;
}

/** حلقة التعبئة: تجلب دفعات وتفلترها حتى تجمع `want` نتيجة أو تبلغ سقف المسح. لا تحمّل القاعدة كلها. */
export async function collect({ fetchPage, match, cursor = null, want = 20, maxScan = 300, pageSize = 50 }) {
  const results = []; let scanned = 0, exhausted = false;
  while (results.length < want && scanned < maxScan) {
    const page = await fetchPage(cursor, pageSize);
    scanned += page.docs.length; cursor = page.cursor ?? cursor;
    for (const d of page.docs) if (match(d.data())) results.push(d);
    if (page.docs.length < pageSize) { exhausted = true; break; }
  }
  return { results, cursor, scanned, exhausted };
}

/** شرائح الفلاتر النشطة: لكل شريحة المفاتيح التي تُمسح عند إزالتها. */
export function describeFilters(f) {
  const out = [], add = (keys, label) => { if (keys.some(k => f[k] != null)) out.push({ keys, label }); };
  const rng = (lo, hi, name, unit = '') => f[lo] != null && f[hi] != null ? `${name}: ${fmtNumber(f[lo])} - ${fmtNumber(f[hi])}${unit}` : f[lo] != null ? `${name}: من ${fmtNumber(f[lo])}${unit}` : `${name}: حتى ${fmtNumber(f[hi])}${unit}`;
  add(['status'], 'الحالة: ' + STATUSES[f.status]);
  add(['tx'], f.tx?.map(x => TRANSACTION_TYPES[x]).join(' / '));
  add(['types'], f.types?.map(x => PROPERTY_TYPES[x]).join(' / '));
  add(['districts'], 'المناطق: ' + f.districts); add(['street'], 'الشارع: ' + f.street);
  add(['priceMin', 'priceMax'], rng('priceMin', 'priceMax', 'السعر'));
  add(['areaMin', 'areaMax'], rng('areaMin', 'areaMax', 'المساحة', ' م'));
  add(['floorMin', 'floorMax'], rng('floorMin', 'floorMax', 'الدور'));
  add(['floorFlags'], f.floorFlags?.map(x => FLOOR_FLAGS[x]).join(' / '));
  for (const [k, l] of [['rooms', 'الغرف'], ['bathrooms', 'الحمامات'], ['receptions', 'الريسبشن']]) add([k], `${l}: ${f[k]?.map(x => (+x >= 5 ? '5+' : x)).join(' / ')}`);
  add(['finishing'], f.finishing?.map(x => FINISHING[x]).join(' / '));
  add(['facilities'], f.facilities?.map(x => FACILITIES[x][0]).join(' + '));
  add(['yearMin', 'yearMax'], rng('yearMin', 'yearMax', 'سنة البناء'));
  add(['addedBy'], 'أضافه: ' + f.addedBy);
  add(['addedFrom', 'addedTo'], `تاريخ الإضافة: ${f.addedFrom || '…'} → ${f.addedTo || '…'}`);
  add(['updatedFrom', 'updatedTo'], `آخر تحديث: ${f.updatedFrom || '…'} → ${f.updatedTo || '…'}`);
  return out;
}
export { floorLabel };

/* ===================== البحث الذكي: أقرب العقارات عند غياب التطابق الكامل ===================== */
export const NEAR_WEIGHTS = { location: 25, street: 5, price: 25, area: 20, rooms: 8, bathrooms: 5, receptions: 3, floor: 6, finishing: 5, facilities: 5 };
export const NEAR_MIN_SCORE = 50;    // أقل نسبة تُعرض كبديل
export const NEAR_LIMIT = 10;        // أقصى عدد بدائل
export const EXACT_ENOUGH = 5;       // إن وُجد هذا العدد من المطابقات التامة لا نعرض بدائل
export const PRICE_TOLERANCE = 0.25, AREA_TOLERANCE = 0.2;
export const NEAR_LABELS = { very_high: 'تطابق مرتفع جدًا', high: 'تطابق مرتفع', medium: 'تطابق متوسط', weak: 'تطابق ضعيف' };
export const nearLevel = sc => (sc >= 95 ? 'very_high' : sc >= 85 ? 'high' : sc >= 70 ? 'medium' : 'weak');

const isN = v => typeof v === 'number' && Number.isFinite(v);
const clamp01 = x => Math.max(0, Math.min(1, x));
const rangeText = (lo, hi, unit) => lo != null && hi != null ? `${fmtNumber(lo)} - ${fmtNumber(hi)} ${unit}` : lo != null ? `من ${fmtNumber(lo)} ${unit}` : `حتى ${fmtNumber(hi)} ${unit}`;
function rangeRatio(v, lo, hi, tol) {
  if (lo != null && v < lo) return clamp01(1 - ((lo - v) / lo) / tol);
  if (hi != null && v > hi) return clamp01(1 - ((v - hi) / hi) / tol);
  return 1;
}
function countRatio(v, list) { // list: ['3','4'] أو ['5'] تعني 5+
  let best = 0;
  for (const x of list.map(Number)) { const ok = x >= 5 ? v >= 5 : v === x; const near = x >= 5 ? v === 4 : Math.abs(v - x) === 1; best = Math.max(best, ok ? 1 : near ? 0.5 : 0); }
  return best;
}

/** الشروط الصلبة التي لا تُخفَّف أبدًا في البدائل: نوع المعاملة والعقار والحالة والإضافة/التحديث والسنة. */
export function hardMatch(p, f) {
  if (f.tx && !f.tx.includes(p.transactionType)) return false;
  if (f.types && !f.types.includes(p.propertyType)) return false;
  if (f.status ? p.status !== f.status : p.status !== 'available') return false;
  if (!inRange(p.buildingDetails?.year, f.yearMin, f.yearMax)) return false;
  if (f.addedBy && !normalizeAr(p.createdByName || '').includes(normalizeAr(f.addedBy))) return false;
  for (const [field, [lo, hi]] of [['createdAt', ['addedFrom', 'addedTo']], ['updatedAt', ['updatedFrom', 'updatedTo']]]) {
    if (f[lo] == null && f[hi] == null) continue;
    const t = ms(p[field]);
    if (t == null || (f[lo] && t < startOf(f[lo]).getTime()) || (f[hi] && t > endOf(f[hi]).getTime())) return false;
  }
  return !(p.offersSummary && p.offersSummary.activeCount === 0); // عقار بلا عرض نشط ليس متاحًا فعليًا
}

/**
 * نسبة التشابه بين مواصفات البحث وعقار. المعيار غير المذكور في البحث لا يُحسب،
 * والقيمة غير المسجلة في العقار لا تُعدّ عدم تطابق (تُستبعد وتُسجَّل كـ "غير مسجل") مع خصم تغطية حتى لا تضلل النسبة.
 * غياب تطابق المنطقة يضع سقفًا 74% لأن المنطقة أولوية عالية.
 */
export function scoreSearch(f, p) {
  const reasons = []; let earned = 0, known = 0, wanted = 0, areaMiss = false;
  const add = (key, label, w, ratio, text) => {
    wanted += w;
    if (ratio == null) { reasons.push({ key, label, state: 'unknown', text: text || 'غير مسجل في العقار' }); return; }
    known += w; earned += w * ratio;
    reasons.push({ key, label, state: ratio >= 0.999 ? 'ok' : ratio > 0 ? 'near' : 'miss', text });
  };
  if (f.districts) {
    const terms = f.districts.split(/[,،]/).map(normalizeAr).filter(Boolean), d = normalizeAr(p.location?.district || '');
    if (!d) add('location', 'المنطقة', NEAR_WEIGHTS.location, null);
    else { const hit = terms.some(t => d.includes(t) || (d.length >= 3 && t.includes(d))); if (!hit) areaMiss = true; add('location', 'المنطقة', NEAR_WEIGHTS.location, hit ? 1 : 0, `المطلوب ${f.districts} — المتوفر ${p.location.district}`); }
  }
  if (f.street) {
    const st = normalizeAr(p.location?.street || '');
    add('street', 'الشارع', NEAR_WEIGHTS.street, !st ? null : st.includes(normalizeAr(f.street)) ? 1 : 0, `المطلوب ${f.street} — المتوفر ${p.location?.street || ''}`);
  }
  if (f.priceMin != null || f.priceMax != null) {
    add('price', 'السعر', NEAR_WEIGHTS.price, isN(p.price) ? rangeRatio(p.price, f.priceMin, f.priceMax, PRICE_TOLERANCE) : null,
      `السعر المطلوب ${rangeText(f.priceMin, f.priceMax, 'جنيه')} — المتوفر ${fmtNumber(p.price)} (أقل عرض نشط)`);
  }
  if (f.areaMin != null || f.areaMax != null) {
    add('area', 'المساحة', NEAR_WEIGHTS.area, isN(p.area) ? rangeRatio(p.area, f.areaMin, f.areaMax, AREA_TOLERANCE) : null,
      `المساحة المطلوبة ${rangeText(f.areaMin, f.areaMax, 'متر')} — المتوفرة ${fmtNumber(p.area)} متر`);
  }
  for (const [k, label, field] of [['rooms', 'عدد الغرف', 'rooms'], ['bathrooms', 'الحمامات', 'bathrooms'], ['receptions', 'الريسبشن', 'receptions']]) {
    if (f[k]) add(k, label, NEAR_WEIGHTS[k], isN(p[field]) ? countRatio(p[field], f[k]) : null, `المطلوب ${f[k].map(x => (+x >= 5 ? '5+' : x)).join(' أو ')} — المتوفر ${p[field]}`);
  }
  if (f.floorMin != null || f.floorMax != null) {
    let r = null; if (isN(p.floor)) { const lo = f.floorMin ?? -Infinity, hi = f.floorMax ?? Infinity; r = p.floor >= lo && p.floor <= hi ? 1 : (p.floor === lo - 1 || p.floor === hi + 1) ? 0.5 : 0; }
    add('floor', 'الدور', NEAR_WEIGHTS.floor, r, `الدور المطلوب ${rangeText(f.floorMin, f.floorMax, '')} — المتوفر ${floorLabel(p.floor)}`);
  }
  if (f.finishing) add('finishing', 'التشطيب', NEAR_WEIGHTS.finishing, p.finishing ? (f.finishing.includes(p.finishing) ? 1 : 0) : null, `المطلوب ${f.finishing.map(x => FINISHING[x]).join(' أو ')} — المتوفر ${FINISHING[p.finishing] || ''}`);
  if (f.facilities) {
    const vals = f.facilities.map(k => at(p, FACILITIES[k][1])).filter(v => v === 'yes' || v === 'no');
    add('facilities', 'المرافق', NEAR_WEIGHTS.facilities, vals.length ? vals.filter(v => v === 'yes').length / f.facilities.length : null, `المطلوب ${f.facilities.map(k => FACILITIES[k][0]).join(' + ')}`);
  }
  if (wanted === 0 || known === 0) return null;
  let score = Math.round((earned / known) * 100 * (0.5 + 0.5 * (known / wanted)));
  if (areaMiss) score = Math.min(score, 74);
  const exact = reasons.every(r => r.state === 'ok');
  return { score, level: nearLevel(score), reasons, exact };
}

/** أقرب العقارات (غير المطابقة تمامًا) مرتبة بالتشابه. `skipIds`: ما ظهر ضمن المطابقة التامة. */
export function rankNear(f, props, { skipIds = new Set(), min = NEAR_MIN_SCORE, limit = NEAR_LIMIT } = {}) {
  return props.filter(p => !skipIds.has(p.id) && hardMatch(p, f))
    .map(p => { const m = scoreSearch(f, p); return m && !m.exact && m.score >= min ? { item: p, ...m } : null; })
    .filter(Boolean).sort((a, b) => b.score - a.score || (ms(b.item.createdAt) || 0) - (ms(a.item.createdAt) || 0)).slice(0, limit);
}

/** خطة جلب مرشحي البدائل: متاح فقط + نوع معاملة واحد إن حُدد (الباقي يُفلتر في المتصفح). بلا نطاقات فلا تحتاج فهارس جديدة. */
export function nearPlan(f) {
  const conds = [['status', '==', f.status || 'available']];
  if (f.tx?.length === 1) conds.push(['transactionType', '==', f.tx[0]]);
  return { conds, field: 'createdAt', dir: 'desc' };
}
