// نموذج العقار: مصدر واحد للاستمارة والتفاصيل ونص المشاركة. دوال خالصة قابلة للاختبار.
import { PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES, toLatinDigits, normalizeAr, fmtNumber } from './utils.js';

export const BOOL = { yes: 'نعم', no: 'لا', unknown: 'غير معروف' };
export const AV = { yes: 'متوفر', no: 'غير متوفر', unknown: 'غير معروف' };
export const FINISHING = { none: 'بدون تشطيب', red_brick: 'على الطوب الأحمر', semi: 'نصف تشطيب', lux: 'لوكس', super_lux: 'سوبر لوكس', high_lux: 'هاي لوكس', ultra: 'ألترا سوبر لوكس', hotel: 'تشطيب فندقي' };
const COND = { good: 'جيدة', average: 'متوسطة', poor: 'سيئة' };
const PAYER = { owner: 'المالك', buyer: 'المشتري', both: 'الطرفان' };
const OWNER_KIND = { direct: 'مباشر', broker: 'وسيط' };

// F(المسار، التسمية، النوع t|n|a|s، الخيارات، أعلام: r مطلوب، p خاص بالمالك، a عند الإضافة فقط)
const F = (k, l, t = 't', o, fl = '') => ({ k, l, t, o, r: fl.includes('r'), p: fl.includes('p'), addOnly: fl.includes('a') });
const fac = (k, l) => F('facilities.' + k, l, 's', AV);
const cond = (k, l) => F(k, l, 's', COND);

export const GROUPS = [
  { id: 'basic', title: 'البيانات الأساسية', open: true, fields: [
    F('propertyType', 'نوع العقار', 's', PROPERTY_TYPES, 'r'), F('transactionType', 'نوع العملية', 's', TRANSACTION_TYPES, 'r'),
    F('status', 'حالة العقار', 's', STATUSES, 'a'),
    F('location.governorate', 'المحافظة', 't', 0, 'r'), F('location.city', 'المدينة', 't', 0, 'r'), F('location.district', 'المنطقة'),
    F('price', 'السعر المطلوب (جنيه)', 'n', 0, 'r'), F('area', 'المساحة (متر)', 'n', 0, 'r') ] },
  { id: 'eng', title: 'الموقع والتفاصيل الهندسية', fields: [
    F('location.street', 'اسم الشارع'), F('location.buildingNo', 'رقم العمارة'), F('location.unitNo', 'رقم الوحدة'),
    F('location.mainStreet', 'أقرب شارع رئيسي'), F('location.landmark', 'أقرب معلم'), F('location.mapUrl', 'رابط Google Maps'), F('location.streetWidth', 'عرض الشارع (متر)', 'n'),
    F('location.description', 'وصف الموقع', 'a'),
    F('floor', 'الدور (0 = أرضي)', 'n'), F('rooms', 'عدد الغرف', 'n'), F('bedrooms', 'غرف النوم', 'n'), F('bathrooms', 'الحمامات', 'n'), F('receptions', 'قطع الريسبشن', 'n'),
    F('engineering.kitchens', 'المطابخ', 'n'), F('engineering.balconies', 'البلكونات', 'n'), F('engineering.entrances', 'المداخل', 'n'), F('engineering.direction', 'الاتجاه'),
    F('engineering.corner', 'ناصية؟', 's', BOOL), F('engineering.lightWell', 'يوجد منور؟', 's', BOOL), F('engineering.roof', 'يوجد روف؟', 's', BOOL),
    F('engineering.garden', 'يوجد حديقة؟', 's', BOOL), F('engineering.garage', 'يوجد جراج؟', 's', BOOL), F('engineering.storage', 'يوجد مخزن؟', 's', BOOL),
    F('engineering.independentEntrance', 'مدخل مستقل؟', 's', BOOL), F('engineering.gardenArea', 'مساحة الحديقة', 'n'), F('engineering.roofArea', 'مساحة الروف', 'n') ] },
  { id: 'building', title: 'تفاصيل المبنى والتشطيب', fields: [
    F('buildingDetails.year', 'سنة البناء', 'n'), F('buildingDetails.floors', 'عدد أدوار العمارة', 'n'), cond('buildingDetails.condition', 'حالة المبنى'),
    cond('buildingDetails.facade', 'حالة الواجهة'), cond('buildingDetails.entrance', 'حالة المدخل'), cond('buildingDetails.stairs', 'حالة السلم'),
    fac('elevator', 'أسانسير'), cond('buildingDetails.elevatorCondition', 'حالة الأسانسير'), F('buildingDetails.ownersUnion', 'اتحاد ملاك؟', 's', BOOL),
    F('buildingDetails.construction', 'نوع الإنشاء'), cond('buildingDetails.maintenance', 'حالة الصيانة'),
    F('finishing', 'التشطيب', 's', FINISHING), F('finishingDetails.flooring', 'نوع الأرضيات'), cond('finishingDetails.paint', 'حالة الدهانات'),
    cond('finishingDetails.electricity', 'حالة الكهرباء'), cond('finishingDetails.plumbing', 'حالة السباكة'), cond('finishingDetails.doors', 'حالة الأبواب'),
    cond('finishingDetails.windows', 'حالة الشبابيك'), cond('finishingDetails.kitchen', 'حالة المطبخ'), cond('finishingDetails.bathrooms', 'حالة الحمامات'),
    F('finishingDetails.needsRenovation', 'يحتاج تجديد؟', 's', BOOL), F('finishingDetails.readyToLive', 'جاهز للسكن؟', 's', BOOL) ] },
  { id: 'facilities', title: 'المرافق والخدمات', fields: [
    fac('gas', 'غاز طبيعي'), fac('electricity', 'كهرباء'), fac('water', 'مياه'), fac('sewage', 'صرف صحي'), fac('indepElectric', 'عداد كهرباء مستقل'),
    fac('indepWater', 'عداد مياه مستقل'), fac('indepGas', 'عداد غاز مستقل'), fac('internet', 'إنترنت أرضي'), fac('landline', 'خط أرضي'),
    fac('heater', 'سخان'), fac('ac', 'تكييفات'), fac('satellite', 'دش مركزي') ] },
  { id: 'fin', title: 'البيانات المالية والقانونية', fields: [
    F('financialDetails.negotiable', 'السعر قابل للتفاوض؟', 's', BOOL), F('financialDetails.paymentSystem', 'نظام الدفع'), F('financialDetails.installment', 'يوجد تقسيط؟', 's', BOOL),
    F('financialDetails.downPayment', 'المقدم', 'n'), F('financialDetails.installmentValue', 'قيمة القسط', 'n'), F('financialDetails.installmentMonths', 'مدة التقسيط (شهر)', 'n'),
    F('financialDetails.priceIncludesCommission', 'السعر شامل العمولة؟', 's', BOOL),
    F('financial.minPrice', 'أقل سعر متوقع', 'n', 0, 'p'), F('financial.commissionAgreed', 'العمولة المتفق عليها', 't', 0, 'p'), F('financial.commissionPercent', 'نسبة العمولة %', 'n', 0, 'p'),
    F('financial.commissionValue', 'قيمة العمولة', 'n', 0, 'p'), F('financial.commissionPayer', 'العمولة على', 's', PAYER, 'p'), F('financial.debts', 'مديونيات أو مستحقات', 'a', 0, 'p'),
    F('legalDetails.ownershipType', 'نوع الملكية'), F('legalDetails.registered', 'عقد مسجل؟', 's', BOOL), F('legalDetails.preliminary', 'عقد ابتدائي؟', 's', BOOL),
    F('legalDetails.signatureValid', 'صحة توقيع؟', 's', BOOL), F('legalDetails.validity', 'صحة ونفاذ؟', 's', BOOL), F('legalDetails.powerOfAttorney', 'توكيل؟', 's', BOOL),
    F('legalDetails.buildingLicense', 'رخصة مباني؟', 's', BOOL), F('legalDetails.reconciliation', 'موقف التصالح'), F('legalDetails.landShare', 'حصة في الأرض'),
    F('legalDetails.violations', 'وجود مخالفات؟', 's', BOOL), F('legalDetails.disputes', 'نزاعات قانونية؟', 's', BOOL), F('legalDetails.notes', 'ملاحظات قانونية', 'a') ] },
  { id: 'owner', title: 'بيانات المالك والملاحظات', fields: [
    F('owner.name', 'اسم المالك', 't', 0, 'p'), F('owner.phone', 'هاتف المالك الأساسي', 't', 0, 'p'), F('owner.phone2', 'رقم إضافي', 't', 0, 'p'), F('owner.whatsapp', 'واتساب', 't', 0, 'p'),
    F('owner.kind', 'مباشر أم وسيط؟', 's', OWNER_KIND, 'p'), F('owner.brokerName', 'اسم الوسيط', 't', 0, 'p'), F('owner.brokerPhone', 'رقم الوسيط', 't', 0, 'p'),
    F('owner.commission', 'العمولة المطلوبة', 't', 0, 'p'), F('owner.notes', 'ملاحظات التعامل مع المالك', 'a', 0, 'p'),
    F('notes.general', 'ملاحظات عامة', 'a'), F('notes.details', 'تفاصيل إضافية', 'a'), F('notes.team', 'ملاحظات خاصة بالفريق', 'a'), F('notes.condition', 'ملاحظات عن الحالة', 'a') ] }
];
export const ALL_FIELDS = GROUPS.flatMap(g => g.fields);

export const archiveFor = status => !['available', 'reserved'].includes(status);

const isLeaf = v => v === null || typeof v !== 'object' || Array.isArray(v) || typeof v.toMillis === 'function';
export function flatten(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) isLeaf(v) ? (out[pre + k] = v) : flatten(v, pre + k + '.', out);
  return out;
}
function setPath(o, path, v) {
  const ks = path.split('.'); let c = o;
  ks.slice(0, -1).forEach(k => (c = c[k] ??= {}));
  c[ks.at(-1)] = v;
}

/** يحوّل قيم الاستمارة (نصوص) إلى مستندين: عام وخاص. الفارغ لا يُخزَّن أبدًا (لا أصفار ولا قيم افتراضية). */
export function buildDoc(values) {
  const pub = {}, priv = {};
  for (const f of ALL_FIELDS) {
    let v = values[f.k];
    if (v == null) continue;
    v = String(v).trim();
    if (v === '') continue;
    if (f.t === 'n') { v = Number(toLatinDigits(v).replace(/,/g, '')); if (!Number.isFinite(v)) continue; }
    setPath(f.p ? priv : pub, f.k, v);
  }
  if (pub.location?.city) pub.location.cityKey = normalizeAr(pub.location.city);
  if (pub.location?.district) pub.location.districtKey = normalizeAr(pub.location.district);
  if (pub.location?.governorate) pub.location.governorateKey = normalizeAr(pub.location.governorate);
  return { pub, priv };
}

export function validate(values) {
  const errors = {};
  for (const f of ALL_FIELDS) {
    const v = String(values[f.k] ?? '').trim();
    if (f.r && !v) errors[f.k] = 'هذا الحقل مطلوب';
    else if (f.t === 'n' && v && !Number.isFinite(Number(toLatinDigits(v).replace(/,/g, '')))) errors[f.k] = 'أدخل رقمًا صحيحًا';
    else if (f.t === 'n' && v && Number(toLatinDigits(v)) < 0) errors[f.k] = 'لا يقبل قيمة سالبة';
  }
  return errors;
}

const META = ['updatedAt', 'updatedBy', 'updatedByName'];
export function diffKeys(a, b) {
  const fa = flatten(a), fb = flatten(b);
  return [...new Set([...Object.keys(fa), ...Object.keys(fb)])]
    .filter(k => !META.includes(k) && JSON.stringify(fa[k]) !== JSON.stringify(fb[k]));
}

export function listFilters({ archived = false, tx, status } = {}) {
  const c = [];
  if (status) c.push(['status', '==', status]); else c.push(['isArchived', '==', !!archived]);
  if (tx === 'sale') c.push(['transactionType', '==', 'sale']);
  else if (tx === 'rent') c.push(['transactionType', 'in', ['rent_new', 'rent_old']]);
  return c;
}

const ORD = ['الأرضي', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
export const floorLabel = n => ORD[n] ?? String(n);
const TX_WORD = { sale: 'للبيع', rent_new: 'للإيجار', rent_old: 'للإيجار القديم' };

/** نص المشاركة: يقرأ من المستند العام فقط، فلا يمكن أن يتسرب منه المالك أو العمولة. */
export function shareText(p) {
  const where = [p.location?.district, p.location?.city].filter(Boolean).join('، ');
  const head = `${PROPERTY_TYPES[p.propertyType] || 'عقار'} ${TX_WORD[p.transactionType] || ''}${where ? ' في ' + where : ''}`.replace(/\s+/g, ' ').trim();
  const L = [];
  if (p.area != null) L.push(`المساحة: ${fmtNumber(p.area)} متر.`);
  if (p.floor != null) L.push(`الدور: ${floorLabel(p.floor)}.`);
  if (p.rooms != null) L.push(`عدد الغرف: ${p.rooms}.`);
  if (p.bathrooms != null) L.push(`عدد الحمامات: ${p.bathrooms}.`);
  if (p.finishing) L.push(`التشطيب: ${FINISHING[p.finishing]}.`);
  if (p.facilities?.gas && p.facilities.gas !== 'unknown') L.push(`غاز طبيعي: ${AV[p.facilities.gas]}.`);
  if (p.facilities?.elevator && p.facilities.elevator !== 'unknown') L.push(`أسانسير: ${AV[p.facilities.elevator]}.`);
  if (p.price != null) L.push(`السعر: ${fmtNumber(p.price)} جنيه.`);
  return [head, '', ...L, '', 'للتواصل والاستفسار يرجى الاتصال.'].join('\n');
}
