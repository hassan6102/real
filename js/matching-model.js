// منطق مطابقة العقارات مع طلبات العملاء. دوال خالصة بلا Firebase ولا DOM لتسهيل الاختبار.
import { normalizeAr } from './utils.js';

export const ACTIVE_STATUSES = ['new', 'searching', 'found', 'offers_sent', 'viewed', 'negotiating'];
// أوزان المعايير الاختيارية (المعيار غير المذكور في الطلب لا يدخل في الحساب).
export const WEIGHTS = { location: 30, budget: 30, area: 20, rooms: 20 };
export const BUDGET_TOLERANCE = 0.15; // تجاوز الميزانية حتى 15% يعطي نسبة جزئية تتناقص حتى الصفر
export const AREA_TOLERANCE = 0.2;    // الانحراف عن نطاق المساحة حتى 20%
export const DEFAULT_MIN_SCORE = 50;

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/** يقسّم نص المناطق في الطلب (فاصلة عربية/لاتينية، فاصلة منقوطة، شرطة مائلة) إلى مفاتيح مطبّعة. */
export const splitDistricts = (s = '') => String(s).split(/[,،;؛/\n]+|\s-\s/).map(normalizeAr).filter(Boolean);

const districtHit = (reqKeys, propKey) => !!propKey && reqKeys.some(k => k === propKey || (k.length >= 3 && propKey.length >= 3 && (k.includes(propKey) || propKey.includes(k))));

function budgetRatio(price, min, max) {
  if (!isNum(price)) return { ratio: 0, missing: true };
  if (isNum(max) && price > max) {
    const gap = (price - max) / max;
    return { ratio: gap >= BUDGET_TOLERANCE ? 0 : 1 - gap / BUDGET_TOLERANCE, over: true };
  }
  // سعر أقل من الحد الأدنى للميزانية لا يُعدّ عيبًا.
  return { ratio: 1 };
}

function areaRatio(area, min, max) {
  if (!isNum(area)) return { ratio: 0, missing: true };
  let gap = 0;
  if (isNum(min) && area < min) gap = (min - area) / min;
  else if (isNum(max) && area > max) gap = (area - max) / max;
  return { ratio: gap === 0 ? 1 : gap >= AREA_TOLERANCE ? 0 : 1 - gap / AREA_TOLERANCE };
}

function roomsRatio(rooms, min) {
  if (!isNum(rooms)) return { ratio: 0, missing: true };
  if (rooms >= min) return { ratio: 1 };
  return { ratio: rooms === min - 1 ? 0.5 : 0 };
}

export const scoreLevel = s => (s >= 80 ? 'high' : s >= 60 ? 'medium' : 'low');
export const LEVEL_LABELS = { high: 'توافق عالٍ', medium: 'توافق متوسط', low: 'توافق ضعيف' };

/**
 * يحسب توافق عقار مع طلب. يعيد null عند الاستبعاد الحتمي:
 * طلب غير نشط، عقار غير متاح (أو بلا عرض نشط)، أو اختلاف نوع المعاملة أو نوع العقار.
 * المكتب يعمل في مدينة واحدة، فلا دور للمحافظة/المدينة هنا؛ الموقع = المنطقة فقط.
 */
export function scorePair(req, prop) {
  if (!req || !prop) return null;
  if (!ACTIVE_STATUSES.includes(req.status)) return null;
  if (prop.status !== 'available') return null;
  if (prop.offersSummary && prop.offersSummary.activeCount === 0) return null;
  if (req.transactionType !== prop.transactionType) return null;
  if (req.propertyType !== prop.propertyType) return null;

  const loc = prop.location || {};

  const reasons = [];
  let earned = 0, possible = 0;
  const add = (key, label, weight, ratio, text, missing) => {
    possible += weight; earned += weight * ratio;
    reasons.push({ key, label, ratio, text, missing: !!missing, state: ratio >= 0.999 ? 'ok' : ratio > 0 ? 'partial' : 'miss' });
  };

  // المنطقة (إن ذُكرت مناطق في الطلب). المنطقة غير المسجلة في العقار تُحسب بصفر مع توضيح السبب (كبقية المعايير في هذا الملف).
  const reqDistricts = splitDistricts(req.districts);
  if (reqDistricts.length) {
    const propDistrict = loc.districtKey || normalizeAr(loc.district || '');
    if (!propDistrict) add('location', 'المنطقة', WEIGHTS.location, 0, 'منطقة العقار غير مسجلة', true);
    else {
      const hit = districtHit(reqDistricts, propDistrict);
      add('location', 'المنطقة', WEIGHTS.location, hit ? 1 : 0, hit ? `المنطقة مطابقة (${loc.district})` : `المنطقة غير مطابقة (${loc.district})`);
    }
  }

  // الميزانية
  if (isNum(req.budgetMin) || isNum(req.budgetMax)) {
    const r = budgetRatio(prop.price, req.budgetMin, req.budgetMax);
    add('budget', 'الميزانية', WEIGHTS.budget, r.ratio,
      r.missing ? 'سعر العقار غير مسجل' : r.over ? (r.ratio > 0 ? 'السعر أعلى من الميزانية بنسبة بسيطة' : 'السعر أعلى من الميزانية') : (prop.offersSummary?.activeCount > 1 ? 'أقل عرض نشط ضمن الميزانية' : 'السعر ضمن الميزانية'), r.missing);
  }

  // المساحة
  if (isNum(req.areaMin) || isNum(req.areaMax)) {
    const r = areaRatio(prop.area, req.areaMin, req.areaMax);
    add('area', 'المساحة', WEIGHTS.area, r.ratio, r.missing ? 'مساحة العقار غير مسجلة' : r.ratio >= 0.999 ? 'المساحة ضمن المطلوب' : r.ratio > 0 ? 'المساحة قريبة من المطلوب' : 'المساحة خارج المطلوب', r.missing);
  }

  // عدد الغرف
  if (isNum(req.roomsMin)) {
    const r = roomsRatio(prop.rooms, req.roomsMin);
    add('rooms', 'عدد الغرف', WEIGHTS.rooms, r.ratio, r.missing ? 'عدد الغرف غير مسجل' : r.ratio >= 1 ? `${prop.rooms} غرف (المطلوب ${req.roomsMin}+)` : r.ratio > 0 ? `أقل بغرفة واحدة (${prop.rooms})` : `أقل من المطلوب (${prop.rooms})`, r.missing);
  }

  const basicOnly = possible === 0;
  const score = basicOnly ? 50 : Math.round((earned / possible) * 100);
  return { score, level: scoreLevel(score), reasons, basicOnly };
}

const ms = t => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : 0);
const byScore = (a, b) => b.score - a.score || ms(b.item.createdAt) - ms(a.item.createdAt);

/** عقارات مناسبة لطلب، مرتبة من الأعلى توافقًا. */
export function matchRequest(req, properties, { minScore = DEFAULT_MIN_SCORE } = {}) {
  return properties.map(p => { const m = scorePair(req, p); return m && m.score >= minScore ? { item: p, ...m } : null; }).filter(Boolean).sort(byScore);
}

/** طلبات (عملاء) مهتمة بعقار، مرتبة من الأعلى توافقًا. */
export function matchProperty(prop, requests, { minScore = DEFAULT_MIN_SCORE } = {}) {
  return requests.map(r => { const m = scorePair(r, prop); return m && m.score >= minScore ? { item: r, ...m } : null; }).filter(Boolean).sort(byScore);
}
