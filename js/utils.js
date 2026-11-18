// دوال مساعدة خالصة (بلا اعتماد على DOM عند الاستيراد) لتسهيل الاختبار.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(s = '') {
  return String(s).replace(/[٠-٩۰-۹]/g, ch => {
    const i = AR_DIGITS.indexOf(ch);
    return i >= 0 ? i : FA_DIGITS.indexOf(ch);
  });
}

/** يوحّد رقم الهاتف المصري: 01012345678 (يعالج +20 و0020 والأرقام الهندية). */
export function normalizePhone(input = '') {
  let d = toLatinDigits(input).replace(/\D/g, '');
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (/^1[0125]\d{8}$/.test(d)) d = '0' + d;
  return d;
}

export function isValidMobile(input) {
  return /^01[0125]\d{8}$/.test(normalizePhone(input));
}

/** تحويل الدخول برقم الهاتف إلى بريد داخلي (بدون الحاجة لـ SMS). */
export function identifierToEmail(identifier = '') {
  const v = toLatinDigits(identifier).trim();
  if (v.includes('@')) return v.toLowerCase();
  return `${normalizePhone(v)}@team.app`;
}

/** توحيد النص العربي لمفاتيح البحث: (أ إ آ→ا) (ة→ه) (ى→ي) وإزالة التشكيل. */
export function normalizeAr(s = '') {
  return toLatinDigits(s)
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmtNumber = n => (n == null ? '—' : new Intl.NumberFormat('en-US').format(n));

export function fmtDateTime(ts) {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!d) return '';
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export const PROPERTY_TYPES = { apartment: 'شقة', villa: 'فيلا', duplex: 'دوبلكس', studio: 'استوديو', penthouse: 'بنتهاوس', shop: 'محل تجاري', office: 'مكتب إداري', clinic: 'عيادة', land: 'أرض', building: 'عمارة كاملة', warehouse: 'مخزن', commercial_unit: 'وحدة تجارية' };
export const TRANSACTION_TYPES = { sale: 'بيع', rent_new: 'إيجار جديد', rent_old: 'إيجار قديم' };
export const STATUSES = { available: 'متاح', reserved: 'محجوز', sold: 'تم البيع', rented: 'تم التأجير', suspended: 'موقوف مؤقتًا', unavailable: 'غير متاح' };
export const ACTIVE_REQUEST_STATUSES = ['new', 'searching', 'found', 'offers_sent', 'viewed', 'negotiating'];

const ACTION_VERBS = {
  property_create: 'أضاف عقارًا', property_delete: 'حذف عقارًا نهائيًا', property_update: 'عدّل عقارًا', price_change: 'عدّل سعر عقار',
  status_change: 'غيّر حالة عقار', property_archive: 'أرشف عقارًا',
  customer_create: 'أضاف عميلًا', customer_update: 'عدّل بيانات عميل',
  request_create: 'أضاف طلب عميل', request_update: 'عدّل طلب عميل'
};
export const actionText = a => ACTION_VERBS[a] || 'نفّذ عملية';
