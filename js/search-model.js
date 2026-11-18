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
const STR = ['governorate', 'city', 'districts', 'street', 'addedBy', 'status', 'addedFrom', 'addedTo', 'updatedFrom', 'updatedTo'];

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

/** خطة الخادم: مساواة (الحالة، العملية الواحدة، المدينة) + نطاق على حقل الترتيب فقط. الباقي للمتصفح. */
export function serverPlan(f, sortKey = 'newest') {
  const { field, dir } = SORTS[sortKey], conds = [], handled = new Set();
  if (f.status) { conds.push(['status', '==', f.status]); handled.add('status'); } else conds.push(['isArchived', '==', false]);
  if (f.tx?.length === 1) { conds.push(['transactionType', '==', f.tx[0]]); handled.add('tx'); }
  if (f.city) { conds.push(['location.cityKey', '==', normalizeAr(f.city)]); handled.add('city'); }
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
  if (f.governorate && !normalizeAr(p.location?.governorate || '').includes(normalizeAr(f.governorate))) return false;
  if (f.city && normalizeAr(p.location?.city || '') !== normalizeAr(f.city)) return false;
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
  add(['governorate'], 'المحافظة: ' + f.governorate); add(['city'], 'المدينة: ' + f.city);
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
