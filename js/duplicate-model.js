// اكتشاف العقارات المتشابهة قبل الحفظ. دوال خالصة.
// السعر والسمسار ورقم الهاتف لا تدخل في نسبة التشابه إطلاقًا (اختلافها لا يعني اختلاف العقار)، وتُعرض كفروق فقط.
import { normalizeAr } from './utils.js';
import { fmtNumber } from './utils.js';

export const DUP_WEIGHTS = { district: 15, street: 20, area: 20, floor: 15, rooms: 8, bathrooms: 4, buildingNo: 5, unitNo: 8, landmark: 5 };
const LABELS = { district: 'المنطقة', street: 'الشارع', area: 'المساحة', floor: 'الدور', rooms: 'عدد الغرف', bathrooms: 'الحمامات', buildingNo: 'رقم العمارة', unitNo: 'رقم الوحدة', landmark: 'أقرب معلم' };
const LOCATION_KEYS = ['district', 'street', 'buildingNo', 'unitNo'];
const STRONG_KEYS = ['district', 'street', 'floor', 'rooms', 'buildingNo', 'unitNo'];
export const DUP_MIN_SCORE = 55;   // أقل نسبة تُعرض كتحذير
export const MIN_STRONG = 2;       // إشارات قوية متطابقة لازمة
const STOP = new Set(['شارع', 'ش', 'الشارع', 'عماره', 'العماره', 'رقم', 'بجوار', 'امام', 'خلف', 'بالقرب', 'من', 'في', 'علي', 'على', 'و']);

const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const tokens = s => normalizeAr(String(s ?? '')).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(t => t && !STOP.has(t));
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return null; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const textSim = (a, b) => (!has(a) || !has(b)) ? null : (jaccard(tokens(a), tokens(b)));

const SIGNALS = {
  district: (a, b) => { if (!has(a.location?.district) || !has(b.location?.district)) return null; const x = normalizeAr(a.location.district), y = normalizeAr(b.location.district); return x === y ? 1 : (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) ? 0.9 : 0; },
  street: (a, b) => { const j = textSim(a.location?.street, b.location?.street); return j == null ? null : j >= 0.8 ? 1 : j >= 0.4 ? j : 0; },
  area: (a, b) => { if (typeof a.area !== 'number' || typeof b.area !== 'number') return null; const rel = Math.abs(a.area - b.area) / Math.max(a.area, b.area, 1); return rel <= 0.03 ? 1 : rel >= 0.15 ? 0 : 1 - (rel - 0.03) / 0.12; },
  floor: (a, b) => (typeof a.floor !== 'number' || typeof b.floor !== 'number') ? null : a.floor === b.floor ? 1 : 0,
  rooms: (a, b) => (typeof a.rooms !== 'number' || typeof b.rooms !== 'number') ? null : a.rooms === b.rooms ? 1 : 0,
  bathrooms: (a, b) => (typeof a.bathrooms !== 'number' || typeof b.bathrooms !== 'number') ? null : a.bathrooms === b.bathrooms ? 1 : 0,
  buildingNo: (a, b) => (!has(a.location?.buildingNo) || !has(b.location?.buildingNo)) ? null : normalizeAr(String(a.location.buildingNo)) === normalizeAr(String(b.location.buildingNo)) ? 1 : 0,
  unitNo: (a, b) => (!has(a.location?.unitNo) || !has(b.location?.unitNo)) ? null : normalizeAr(String(a.location.unitNo)) === normalizeAr(String(b.location.unitNo)) ? 1 : 0,
  landmark: (a, b) => { const j = textSim(a.location?.landmark, b.location?.landmark); return j == null ? null : j >= 0.6 ? 1 : 0; }
};
const show = (k, o) => k === 'floor' ? (o.floor === 0 ? 'الأرضي' : String(o.floor)) : k === 'area' ? `${fmtNumber(o.area)} م²` : k === 'district' ? o.location?.district : k === 'street' ? o.location?.street : k === 'buildingNo' ? o.location?.buildingNo : k === 'unitNo' ? o.location?.unitNo : k === 'landmark' ? o.location?.landmark : o[k];

export const similarityLevel = s => (s >= 95 ? 'very_high' : s >= 85 ? 'high' : s >= 70 ? 'medium' : 'weak');
export const SIMILARITY_LABELS = { very_high: 'تطابق مرتفع جدًا', high: 'تطابق مرتفع', medium: 'تطابق متوسط', weak: 'تطابق ضعيف' };

/** يقارن عقارًا جديدًا (مسودة) بعقار موجود. يعيد null إن اختلف نوع العقار أو نوع المعاملة (لا يخلط بيع/إيجار). */
export function scoreDuplicate(draft, existing) {
  if (!draft || !existing) return null;
  if (draft.propertyType !== existing.propertyType || draft.transactionType !== existing.transactionType) return null;
  let earned = 0, known = 0;
  const signals = [];
  for (const [k, w] of Object.entries(DUP_WEIGHTS)) {
    const r = SIGNALS[k](draft, existing);
    if (r == null) { signals.push({ key: k, label: LABELS[k], state: 'unknown' }); continue; }
    known += w; earned += w * r;
    signals.push({ key: k, label: LABELS[k], state: r >= 0.999 ? 'same' : r > 0 ? 'close' : 'diff', ratio: r, draft: show(k, draft), existing: show(k, existing) });
  }
  if (known === 0) return null;
  const coverage = known / 100;
  const score = Math.round((earned / known) * 100 * (0.5 + 0.5 * coverage));
  const same = k => signals.some(s => s.key === k && s.state === 'same');
  const strong = STRONG_KEYS.filter(same).length;
  const loc = LOCATION_KEYS.filter(same).length;
  const flagged = score >= DUP_MIN_SCORE && strong >= MIN_STRONG && loc >= 1;
  const differences = signals.filter(s => s.state === 'diff' || s.state === 'close');
  const priceNote = (typeof draft.price === 'number' && typeof existing.price === 'number' && draft.price !== existing.price)
    ? `السعر المُدخل ${fmtNumber(draft.price)} مقابل ${fmtNumber(existing.price)} في العقار الموجود (اختلاف السعر لا يعني اختلاف العقار).` : '';
  return { score, level: similarityLevel(score), signals, differences, strong, flagged, priceNote };
}

/** أفضل المرشحين المحتمل تكرارهم، مرتبين تنازليًا وبحد أقصى. */
export function findDuplicates(draft, pool = [], { max = 5 } = {}) {
  return pool.map(p => { const m = scoreDuplicate(draft, p); return m && m.flagged ? { item: p, ...m } : null; })
    .filter(Boolean).sort((a, b) => b.score - a.score).slice(0, max);
}
