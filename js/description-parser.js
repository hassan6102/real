// محلل الوصف العربي المحلي (بلا API). دوال خالصة: parseDescription(text) → نتيجة قابلة للمعاينة.
// المبدأ: لا يُخرج أي قيمة دون دليل نصي. الحقل غير المذكور يبقى غائبًا. التعارض يُعرض للمراجعة.
// للتطوير: أضف نمطًا جديدًا عبر registerExtractor({ id, run(ctx) }) دون تعديل أي ملف آخر.
import { toLatinDigits, normalizePhone } from './utils.js';

/* ============ التطبيع: متطابق الأطوال حتى تبقى الإزاحات صالحة للنص الأصلي ============ */
const MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ئ': 'ي', 'ؤ': 'و', '٫': '.', '٬': ',', '؟': '?' };
export function prepare(text = '') {
  const src = toLatinDigits(String(text)).replace(/[\u064B-\u0652\u0640]/g, '');
  const n = [...src].map(c => MAP[c] ?? c).join('').toLowerCase();
  return { src, n };
}

const AR = 'ء-ي';
/** يبني regex لكلمة عربية مع السماح بواو العطف الملتصقة وبادئة ال التعريف. */
const W = (alt, { al = true, flags = 'g' } = {}) => new RegExp(`(?<![${AR}])(?:و)?${al ? '(?:ال)?' : ''}(?:${alt})(?![${AR}])`, flags);

/* ============ تقطيع إلى وحدات (أرقام/كلمات) مع الإزاحات وحدود الجمل ============ */
function tokenize(n) {
  const toks = [], re = /\d+(?:[.,]\d+)*|[^\s:=\d.,،؛;]+/g; let m;
  while ((m = re.exec(n))) toks.push({ t: m[0], start: m.index, end: m.index + m[0].length, brk: false });
  for (let i = 0; i < toks.length; i++) {
    const gap = n.slice(toks[i].end, toks[i + 1] ? toks[i + 1].start : n.length);
    toks[i].brk = /[،؛;\n.]|,/.test(gap) || /\s-\s/.test(gap) || i === toks.length - 1;
  }
  return toks;
}

/* ============ أرقام بالكلمات ============ */
const UNITS = { صفر: 0, واحد: 1, واحده: 1, احد: 1, اثنين: 2, اثنان: 2, اثنتين: 2, اتنين: 2, ثنين: 2, ثلاثه: 3, ثلاث: 3, تلاته: 3, تلات: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, ثماني: 8, تمانيه: 8, تمن: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10,
  حداشر: 11, احدعشر: 11, اتناشر: 12, اثناعشر: 12, تلاتاشر: 13, اربعتاشر: 14, خمستاشر: 15, ستاشر: 16, سبعتاشر: 17, تمنتاشر: 18, تسعتاشر: 19 };
const TENS = { عشرين: 20, عشرون: 20, ثلاثين: 30, تلاتين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, ثمانين: 80, تمانين: 80, تسعين: 90 };
const HUNDREDS = { ميه: 100, مايه: 100, مائه: 100, مئه: 100, ميتين: 200, مائتين: 200, مئتين: 200, ميتان: 200, تلتميه: 300, تلاتميه: 300, ثلاثميه: 300, ثلاثمائه: 300, ثلثمائه: 300, ربعميه: 400, اربعميه: 400, اربعمائه: 400, خمسميه: 500, خمسمائه: 500, ستميه: 600, ستمائه: 600, سبعميه: 700, سبعمائه: 700, تمنميه: 800, ثمانميه: 800, ثمانمائه: 800, ثمنمائه: 800, تسعميه: 900, تسعمائه: 900 };
const MULT = { الف: 1e3, الاف: 1e3, الفين: 2e3, الفان: 2e3, مليون: 1e6, ملايين: 1e6, مليونين: 2e6, مليونان: 2e6 };
const FRACTION = { نص: 0.5, نصف: 0.5, ربع: 0.25, تلت: 1 / 3, ثلث: 1 / 3 };
const FILL = new Set(['و', 'ال', 'حوالي', 'تقريبا', 'بحدود']);

const stripAl = t => (t.startsWith('ال') && t.length > 3 ? t.slice(2) : t);
function wordKind(tok) {
  if (/^\d+(?:[.,]\d+)*$/.test(tok)) return { k: 'num', v: Number(tok.replace(/,/g, '')) };
  const cands = [tok, tok.startsWith('و') ? tok.slice(1) : null].filter(Boolean);
  for (const c0 of cands) {
    const c = stripAl(c0);
    if (c in UNITS) return { k: 'num', v: UNITS[c] };
    if (c in TENS) return { k: 'num', v: TENS[c] };
    if (c in HUNDREDS) return { k: 'num', v: HUNDREDS[c] };
    if (c in MULT) return { k: 'mult', v: MULT[c] };
    if (c in FRACTION) return { k: 'frac', v: FRACTION[c] };
    if (c === 'و') return { k: 'fill' };
  }
  return null;
}

/**
 * يقرأ تعبير رقم يبدأ عند وحدة i: أرقام وكلمات وعطف (مليون و400 ألف / ثلاثة وعشرين / ميتين وخمسين).
 * يعيد { value, next, inferred } أو null. "مليون و500" تُفسَّر 1,500,000 ويُعلَّم ذلك inferred.
 */
export function parseNumberAt(toks, i) {
  let total = 0, cur = 0, lastMult = 0, j = i, any = false, inferred = false, prevUnit = null;
  while (j < toks.length) {
    const k = wordKind(toks[j].t);
    if (!k) break;
    if (k.k === 'fill') { if (!any) break; j++; continue; }
    if (k.k === 'num') {
      if (!Number.isInteger(k.v) && j > i) break;
      if (prevUnit != null && cur > 0 && (toks[j].t === 'ميه' || toks[j].t === 'مائه' || toks[j].t === 'مئه') ) { cur = cur - prevUnit + prevUnit * 100; prevUnit = null; any = true; j++; continue; }
      // رقمان متتاليان بلا عطف (مثل "3 غرف" بعد رقم آخر) لا يُجمعان إلا بعد واو أو كلمة
      if (any && cur > 0 && j > i && !/^و/.test(toks[j].t) && toks[j - 1] && wordKind(toks[j - 1].t)?.k !== 'fill' && /^\d/.test(toks[j].t) && /^\d/.test(toks[j - 1].t)) break;
      if (any && cur === 0 && total > 0 && wordKind(toks[j - 1].t)?.k !== 'fill' && !toks[j].t.startsWith('و')) break; // "950 ألف 3 غرف": الرقم 3 ليس من السعر
      cur += k.v; prevUnit = k.v < 10 ? k.v : null; any = true; j++; continue;
    }
    if (k.k === 'mult') {
      const t = stripAl(toks[j].t.startsWith('و') && !(toks[j].t in MULT) ? toks[j].t.slice(1) : toks[j].t);
      const fixed = t === 'الفين' || t === 'الفان' || t === 'مليونين' || t === 'مليونان';
      if (fixed) total += k.v; else total += (cur || 1) * k.v;
      lastMult = fixed ? k.v / 2 : k.v; cur = 0; prevUnit = null; any = true; j++; continue;
    }
    if (k.k === 'frac') { if (!lastMult) break; total += k.v * lastMult; any = true; j++; continue; }
  }
  if (!any) return null;
  if (cur > 0 && lastMult >= 1e6 && cur < 1000 && Number.isInteger(cur)) { cur *= 1000; inferred = true; }
  total += cur;
  // لا نُنهي بكلمة عطف معلّقة
  while (j > i && wordKind(toks[j - 1].t)?.k === 'fill') j--;
  return total > 0 || total === 0 ? { value: total, next: j, inferred } : null;
}

/* ============ أدوات مساعدة ============ */
const tokAt = (toks, idx) => toks.findIndex(t => idx >= t.start && idx < t.end);
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const nearestTokBefore = (toks, pos) => { let r = -1; toks.forEach((t, i) => { if (t.end <= pos) r = i; }); return r; };

/** يقرأ عددًا (حتى رقمين-ثلاث وحدات) ينتهي عند الوحدة e (شاملة) بالبحث للخلف عن أبكر بداية تستهلك كل الوحدات حتى e. */
function numberEndingAt(toks, e, maxBack = 7) {
  for (let s = Math.max(0, e - maxBack); s <= e; s++) {
    const r = parseNumberAt(toks, s);
    if (r && r.next === e + 1) return { ...r, startTok: s };
  }
  return null;
}

/* ============ المستخرجات (قابلة للإضافة) ============ */
export const EXTRACTORS = [];
export const registerExtractor = e => { EXTRACTORS.push(e); return e; };

/** ctx.add(key, value, span, opts): يسجّل مرشحًا. span = {start,end} على النص المطبَّع. */
const blockedBy = (ctx, span) => ctx.blocked.some(b => overlaps(b, span));

// 0) الهواتف (أولًا حتى لا تُقرأ كسعر أو مساحة)
registerExtractor({ id: 'phones', run(ctx) {
  const re = /(?<!\d)(?:\+?20|0020)?\s?0?1[0125][\s-]?\d{4}[\s-]?\d{4}(?!\d)/g; let m;
  while ((m = re.exec(ctx.n))) {
    const ph = normalizePhone(m[0]);
    if (/^01[0125]\d{8}$/.test(ph)) { ctx.blocked.push({ start: m.index, end: m.index + m[0].length }); ctx.cover(m.index, m.index + m[0].length); if (!ctx.phones.includes(ph)) ctx.phones.push(ph); }
  }
} });

const TX = [
  ['rent_old', W('ايجار\\s+قديم|للايجار\\s+القديم|ايجار\\s+قديم|ايجار\\s+الاقدم', { al: false })],
  ['sale', W('للبيع|بيع|للتمليك|تمليك', { al: false })],
  ['rent_new', W('للايجار|ايجار|للتاجير|تاجير|ايجار\\s+جديد|ايجار\\s+مفروش', { al: false })]
];
registerExtractor({ id: 'transaction', run(ctx) {
  const used = [];
  for (const [val, re] of TX) { re.lastIndex = 0; let m; while ((m = re.exec(ctx.n))) { const span = { start: m.index, end: m.index + m[0].length }; if (used.some(u => overlaps(u, span))) continue; used.push(span); if (/(?:سعر|قيمه|قيمة|مقدم)\s*$/.test(ctx.n.slice(Math.max(0, span.start - 8), span.start))) continue; ctx.add('transactionType', val, span); } }
} });

const TYPES = [
  ['commercial_unit', 'وحده\\s+تجاريه'], ['penthouse', 'بنت\\s?هاوس'], ['duplex', 'دوبلكس|دوبليكس'], ['studio', 'استوديو|ستوديو'], ['villa', 'فيلا|فيله'],
  ['apartment', 'شقه|شقق'], ['clinic', 'عياده'], ['office', 'مكتب\\s+اداري|مكتب'], ['shop', 'محل\\s+تجاري|محل'], ['warehouse', 'مخزن'],
  ['land', 'قطعه\\s+ارض|ارض'], ['building', 'عماره\\s+(?:كامله|سكنيه|اداريه|تجاريه)|(?<=للبيع\\s)عماره|(?<=للايجار\\s)عماره|(?<=^)عماره(?=\\s+(?:للبيع|للايجار))']
];
registerExtractor({ id: 'propertyType', run(ctx) {
  const used = [];
  for (const [val, alt] of TYPES) { const re = W(alt); let m; while ((m = re.exec(ctx.n))) { const span = { start: m.index, end: m.index + m[0].length }; if (used.some(u => overlaps(u, span))) continue; used.push(span); if (val === 'land' && /مساحه\s*$/.test(ctx.n.slice(Math.max(0, span.start - 10), span.start))) continue; ctx.add('propertyType', val, span); } }
} });

/* --- الأرقام المسمّاة: المساحة --- */
registerExtractor({ id: 'area', run(ctx) {
  const { toks, n } = ctx, unit = new Set(['متر', 'م', 'م2', 'م²', 'متر²', 'مترا', 'امتار']);
  const isUnit = i => i < toks.length && unit.has(toks[i].t);
  const skipM2 = i => (toks[i + 1]?.t === '2' ? 2 : 1);
  for (let i = 0; i < toks.length; i++) {
    if (!/^(?:ال)?مساحه(?:ال(?:شقه|وحده))?$/.test(toks[i].t.replace(/^و/, ''))) continue;
    let j = i + 1; while (j < toks.length && ['ال', 'تقريبا', 'حوالي', 'هي', 'شقه', 'الشقه', 'الوحده', 'وحده', 'بحدود', 'الارض', 'ارض', 'القطعه', 'قطعه', 'الفيلا', 'المحل'].includes(toks[j].t)) j++;
    const r = parseNumberAt(toks, j); if (!r) continue;
    let end = r.next - 1; if (isUnit(r.next)) end = r.next + skipM2(r.next) - 1;
    ctx.add('area', r.value, { start: toks[i].start, end: toks[Math.min(end, toks.length - 1)].end }, { tokens: [i, end] });
  }
  for (let i = 1; i < toks.length; i++) {
    if (!isUnit(i)) continue;
    const prev = toks[i - 1].t; if (prev === 'من' || prev === 'بعد') continue;
    const ctxWords = toks.slice(Math.max(0, i - 6), i).map(t => t.t).join(' ');
    if (/عرض\s*(?:ال)?شارع|بعد|يبعد|مسافه|بحري|قبلي|الي|عن/.test(ctxWords.slice(-24)) && !/مساحه/.test(ctxWords)) continue;
    if (toks[i + 1]?.t === 'من' || toks[i + 1]?.t === 'عن') continue;
    const r = numberEndingAt(toks, i - 1); if (!r || r.value <= 0) continue;
    const end = i + skipM2(i) - 1;
    ctx.add('area', r.value, { start: toks[r.startTok].start, end: toks[end].end }, { tokens: [r.startTok, end] });
  }
} });

/* --- السعر --- */
const PRICE_KEY = /^(?:ال)?(?:سعر|سعره|سعرها|مطلوب|المطلوب|ايجار|ايجاره|ايجارها|قيمه|كاش|بمبلغ|مبلغ|الايجار|الاجار|اجار)$/;
const PRICE_FILL = new Set(['هو', 'هي', 'حوالي', 'تقريبا', 'ب', 'فقط', 'بحدود', 'بس', 'الشهري', 'شهري', 'الشهريه', 'يبدا', 'من', 'لا', 'يزيد', 'عن']);
const CUR = new Set(['جنيه', 'جنيها', 'ج', 'جم', 'ج.م', 'egp', 'جنية']);
registerExtractor({ id: 'price', run(ctx) {
  const { toks } = ctx;
  for (let i = 0; i < toks.length; i++) {
    const base = toks[i].t.replace(/^و/, '');
    const keyed = PRICE_KEY.test(base) || /^ب(?:سعر|مبلغ)$/.test(base);
    if (!keyed) continue;
    let j = i + 1; while (j < toks.length && PRICE_FILL.has(toks[j].t)) j++;
    const r = parseNumberAt(toks, j); if (!r || r.value < 1) continue;
    let end = r.next - 1; if (CUR.has(toks[r.next]?.t)) end = r.next;
    ctx.add('price', r.value, { start: toks[i].start, end: toks[end].end }, { inferred: r.inferred, tokens: [i, end] });
  }
  for (let i = 1; i < toks.length; i++) {
    if (!CUR.has(toks[i].t)) continue;
    const r = numberEndingAt(toks, i - 1, 9); if (!r || r.value < 1) continue;
    ctx.add('price', r.value, { start: toks[r.startTok].start, end: toks[i].end }, { inferred: r.inferred, tokens: [r.startTok, i] });
  }
} });
registerExtractor({ id: 'negotiable', run(ctx) {
  let m; const no = W('(?:السعر\\s+)?نهائي|لا\\s+فصال|بدون\\s+فصال|مفيش\\s+فصال', { al: false });
  while ((m = no.exec(ctx.n))) ctx.add('financialDetails.negotiable', 'no', { start: m.index, end: m.index + m[0].length });
  const yes = W('قابل\\s+(?:لل)?(?:تفاوض|فصال)|فيه\\s+فصال|فصال\\s+بسيط|(?:ال)?سعر\\s+قابل\\s+للتفاوض', { al: false });
  while ((m = yes.exec(ctx.n))) ctx.add('financialDetails.negotiable', 'yes', { start: m.index, end: m.index + m[0].length });
} });

/* --- الدور --- */
const ORD = { ارضي: 0, ارضيه: 0, اول: 1, اولي: 1, ثاني: 2, تاني: 2, ثانيه: 2, ثالث: 3, تالت: 3, ثالثه: 3, رابع: 4, رابعه: 4, خامس: 5, خامسه: 5, سادس: 6, سادسه: 6, سابع: 7, سابعه: 7, ثامن: 8, تامن: 8, ثامنه: 8, تاسع: 9, تاسعه: 9, عاشر: 10, عاشره: 10 };
registerExtractor({ id: 'floor', run(ctx) {
  const { toks } = ctx;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t.replace(/^[وب]/, '').replace(/^ال/, '');
    if (t !== 'دور' && t !== 'طابق') continue;
    let j = i + 1; if (toks[j]?.t === 'رقم') j++;
    const w = toks[j]?.t; if (w == null) continue;
    const v = /^\d+$/.test(w) ? Number(w) : ORD[stripAl(w)];
    if (v == null) continue;
    ctx.add('floor', v, { start: toks[i].start, end: toks[j].end }, { tokens: [i, j] });
  }
  const re = W('ارضي|ارضيه', {}); let m;
  while ((m = re.exec(ctx.n))) { const span = { start: m.index, end: m.index + m[0].length }; if (!ctx.cands.some(c => c.key === 'floor' && overlaps(c.span, span)) && !/دور\s*$/.test(ctx.n.slice(Math.max(0, m.index - 6), m.index))) ctx.add('floor', 0, span); }
} });

/* --- الغرف والحمامات والريسبشن والمطبخ --- */
const countBefore = (ctx, nounStart) => {
  const e = nearestTokBefore(ctx.toks, nounStart); if (e < 0) return null;
  const r = numberEndingAt(ctx.toks, e, 2);
  return r && r.value >= 0 && r.value <= 30 && r.next === e + 1 && !ctx.toks.slice(r.startTok, e + 1).some(t => ctx.toks[0] && /^(?:متر|م|جنيه)$/.test(t.t)) && !(ctx.toks[e + 1] && ctx.toks[e + 1].start - ctx.toks[e].end > 12) ? r : null;
};
registerExtractor({ id: 'rooms', run(ctx) {
  let m;
  const dual = W('غرفتين|غرفتان|اوضتين|اوضتان|غرفتين\\s+نوم'); while ((m = dual.exec(ctx.n))) { const span = { start: m.index, end: m.index + m[0].length }; const bed = /^\s*نوم/.test(ctx.n.slice(span.end)); if (bed) span.end += ctx.n.slice(span.end).match(/^\s*نوم/)[0].length; ctx.add(bed ? 'bedrooms' : 'rooms', 2, span); }
  const pl = W('غرف|اوض|غرفه|اوضه'); while ((m = pl.exec(ctx.n))) {
    const nounStart = m.index + (m[0].startsWith('و') && !/^و(?:ال)?(?:غرف|اوض)/.test(m[0]) ? 0 : 0);
    const span = { start: m.index, end: m.index + m[0].length };
    const c = countBefore(ctx, span.start); if (!c) continue;
    const bed = /^\s*نوم/.test(ctx.n.slice(span.end)); if (bed) span.end += ctx.n.slice(span.end).match(/^\s*نوم/)[0].length;
    ctx.add(bed ? 'bedrooms' : 'rooms', c.value, { start: ctx.toks[c.startTok].start, end: span.end }, { tokens: [c.startTok, tokAt(ctx.toks, span.end - 1)] });
  }
} });
registerExtractor({ id: 'bathrooms', run(ctx) {
  let m;
  const dual = W('حمامين|حمامان|دورتين\\s+مياه'); while ((m = dual.exec(ctx.n))) ctx.add('bathrooms', 2, { start: m.index, end: m.index + m[0].length });
  const sing = W('حمامات|حمام|دوره\\s+مياه|دورات\\s+مياه'); while ((m = sing.exec(ctx.n))) {
    const span = { start: m.index, end: m.index + m[0].length };
    if (ctx.cands.some(c => c.key === 'bathrooms' && overlaps(c.span, span))) continue;
    const c = countBefore(ctx, span.start);
    if (c) { ctx.add('bathrooms', c.value, { start: ctx.toks[c.startTok].start, end: span.end }); continue; }
    if (/^حمام(?!ات)$/.test(m[0].replace(/^و?(?:ال)?/, ''))) ctx.add('bathrooms', 1, span);           // "حمام" مذكور صراحةً = 1
    else { ctx.cover(span.start, span.end); ctx.warn('ذُكرت الحمامات دون عدد واضح.'); }
  }
} });
registerExtractor({ id: 'receptions', run(ctx) {
  let m; const re = W('ريسبشن|ريسيبشن|ريسبشنات|استقبال');
  while ((m = re.exec(ctx.n))) {
    const after = ctx.n.slice(m.index + m[0].length), span = { start: m.index, end: m.index + m[0].length };
    const d = after.match(/^\s*(?:قطعتين|قطعتان)/);
    if (d) { ctx.add('receptions', 2, { start: span.start, end: span.end + d[0].length }); continue; }
    const af = ctx.toks.findIndex(t => t.start >= span.end);
    if (af >= 0) {
      const r = parseNumberAt(ctx.toks, af), nx = ctx.toks[r?.next]?.t;
      if (r && /^قطع(?:ه|ه)?$/.test(nx || '')) { ctx.add('receptions', r.value, { start: span.start, end: ctx.toks[r.next].end }); continue; }
      if (/^قطعه$/.test(ctx.toks[af].t) && wordKind(ctx.toks[af + 1]?.t || '')?.v === 1) { ctx.add('receptions', 1, { start: span.start, end: ctx.toks[af + 1].end }); continue; }
    }
    const c = countBefore(ctx, span.start);
    if (c) { ctx.add('receptions', c.value, { start: ctx.toks[c.startTok].start, end: span.end }); continue; }
    const af2 = ctx.toks.findIndex(t => t.start >= span.end), r2 = af2 >= 0 ? parseNumberAt(ctx.toks, af2) : null, nx2 = ctx.toks[r2?.next]?.t;
    if (r2 && r2.value >= 1 && r2.value <= 10 && !(nx2 && (wordKind(nx2) || /^(?:غرف|غرفه|متر|م|حمام|جنيه|مطبخ|دور)/.test(nx2)))) ctx.add('receptions', r2.value, { start: span.start, end: ctx.toks[r2.next - 1].end });
    else { ctx.cover(span.start, span.end); ctx.warn('ذُكر الريسبشن دون عدد واضح.'); }
  }
} });
registerExtractor({ id: 'kitchens', run(ctx) {
  let m; const two = W('مطبخين|مطبخان'); while ((m = two.exec(ctx.n))) ctx.add('engineering.kitchens', 2, { start: m.index, end: m.index + m[0].length });
  const one = W('مطبخ|مطابخ'); while ((m = one.exec(ctx.n))) { const span = { start: m.index, end: m.index + m[0].length }; if (ctx.cands.some(c => c.key === 'engineering.kitchens' && overlaps(c.span, span))) continue; const c = countBefore(ctx, span.start); ctx.add('engineering.kitchens', c ? c.value : 1, c ? { start: ctx.toks[c.startTok].start, end: span.end } : span); }
} });

/* --- التشطيب (الأخص أولًا) --- */
const FIN = [['ultra', 'الترا\\s+سوبر\\s+لوكس|الترا\\s+لوكس|الترا'], ['high_lux', 'هاي\\s+لوكس'], ['super_lux', 'سوبر\\s+لوكس|سوبر\\s+لكس|سوبر'], ['hotel', 'فندقي'],
  ['red_brick', 'على\\s+الطوب(?:\\s+الاحمر)?|علي\\s+الطوب|طوب\\s+احمر|عالطوب'], ['none', 'بدون\\s+تشطيب|بلا\\s+تشطيب|مش\\s+مشطبه'], ['semi', 'نص\\s+تشطيب|نصف\\s+تشطيب|نص\\s+تشطيب|محاره'], ['lux', 'لوكس|لكس']];
registerExtractor({ id: 'finishing', run(ctx) {
  const used = [];
  for (const [val, alt] of FIN) {
    const re = new RegExp(`(?<![${AR}])(?:تشطيب(?:ها|ه)?\\s+)?(?:${alt})(?![${AR}])`, 'g'); let m;
    while ((m = re.exec(ctx.n))) { const span = { start: m.index, end: m.index + m[0].length }; if (used.some(u => overlaps(u, span))) continue; used.push(span); ctx.add('finishing', val, span); }
  }
} });

/* --- الأسانسير والمرافق والمميزات --- */
const NEG = /(?:بدون|مفيش|لا\s+يوجد|مافيش|غير\s+متوفر|ما\s+فيش)\s*$/;
const featureRe = (words, lead = '(?:(?:ال)?(?:عماره|مبني)\\s+)?(?:بها|فيها|به|يوجد|موجود|متوفر|مع|فيه)?\\s*') => new RegExp(`(?<![${AR}])(?:و)?${lead}(?:ال)?(?:${words})(?![${AR}])`, 'g');
const FEATURES = [
  ['facilities.elevator', 'اسانسير|اسنسير|مصعد|أسانسير'], ['engineering.garage', 'جراج|جاراج'], ['engineering.garden', 'حديقه'], ['engineering.roof', 'روف'], ['engineering.corner', 'ناصيه']
];
registerExtractor({ id: 'features', run(ctx) {
  for (const [key, words] of FEATURES) {
    const re = featureRe(words); let m;
    while ((m = re.exec(ctx.n))) {
      const before = ctx.n.slice(Math.max(0, m.index - 14), m.index), neg = NEG.test(before);
      const start = neg ? m.index - (before.match(NEG)?.[0].length || 0) : m.index;
      ctx.add(key, neg ? 'no' : 'yes', { start, end: m.index + m[0].length });
    }
  }
} });
const UTIL = { كهرباء: ['indepElectric', 'electricity'], مياه: ['indepWater', 'water'], غاز: ['indepGas', 'gas'] };
registerExtractor({ id: 'utilities', run(ctx) {
  // 1) عدادات كهرباء ومياه وغاز → عدادات مستقلة (وتُستنتج المرافق نفسها وتُعلَّم "مستنتج")
  const meters = /(?<![ء-ي])عدادات?\s+((?:(?:و)?(?:كهرباء|مياه|غاز)(?:\s+طبيعي)?\s*(?:،|,)?\s*)+)/g; let m;
  const metered = [];
  while ((m = meters.exec(ctx.n))) {
    const span = { start: m.index, end: m.index + m[0].trimEnd().length };
    for (const w of m[1].match(/كهرباء|مياه|غاز/g) || []) { const [meter, base] = UTIL[w]; ctx.add('facilities.' + meter, 'yes', span); ctx.add('facilities.' + base, 'yes', span, { inferred: true }); }
    metered.push(span);
  }
  // 2) ذكر المرفق دون عدادات
  const re = /(?<![ء-ي])(?:و)?(?:ال)?(كهرباء|مياه|غاز)(?:\s+طبيعي)?(?![ء-ي])/g;
  while ((m = re.exec(ctx.n))) {
    const span = { start: m.index, end: m.index + m[0].length };
    if (metered.some(u => overlaps(u, span))) continue;
    const neg = NEG.test(ctx.n.slice(Math.max(0, m.index - 14), m.index));
    ctx.add('facilities.' + UTIL[m[1]][1], neg ? 'no' : 'yes', span);
  }
} });

/* --- الموقع: الشارع ثم المنطقة --- */
const LOC_STOP = new Set(['مساحه', 'الدور', 'دور', 'السعر', 'بسعر', 'سعر', 'للبيع', 'للايجار', 'بيع', 'ايجار', 'متر', 'م', 'غرف', 'غرفه', 'ريسبشن', 'حمام', 'مطبخ', 'تشطيب', 'بجوار', 'قريب', 'بالقرب', 'امام', 'خلف', 'علي', 'على', 'عماره', 'العماره', 'رقم', 'ناصيه', 'مباشر', 'شارع', 'الشارع', 'وسط', 'بالدور', 'بمساحه', 'مساحتها']);
const DIST_BAD_FIRST = new Set(['الدور', 'دور', 'عماره', 'العماره', 'الطابق', 'مكان', 'موقع', 'ظل', 'الايجار', 'الاسكندريه', 'البيع', 'منطقه', 'مساحه']);
const PRE_AL = new Set(['بالدور', 'بالقرب', 'بالكامل', 'بالتقسيط', 'بالنظام', 'بالعماره', 'بالتفاوض', 'بالاتفاق', 'بالتمليك', 'بالمتر', 'بالسعر']);
registerExtractor({ id: 'street', run(ctx) {
  const { toks } = ctx;
  for (let i = 0; i < toks.length; i++) {
    if (!/^(?:ال)?شارع$/.test(toks[i].t.replace(/^[وب]/, '')) || toks[i].t === 'الشارع' && toks[i - 1]?.t === 'عرض') continue;
    if (toks[i - 1]?.t === 'عرض') continue;
    const parts = []; let j = i + 1;
    while (j < toks.length && parts.length < 4) {
      const t = toks[j].t;
      if (LOC_STOP.has(t) || (parts.length && /^\d/.test(t) && !/^\d/.test(parts[0])) || (parts.length && /^[وب]?(?:ال)?(?:مساحه|دور|سعر)/.test(t))) break;
      parts.push(t); const end = toks[j].brk; j++; if (end) break;
    }
    if (parts.length) ctx.add('location.street', parts.join(' '), { start: toks[i].start, end: toks[j - 1].end }, { first: true, display: parts.map((_, k) => ctx.src.slice(toks[i + 1 + k].start, toks[i + 1 + k].end)).join(' ') });
  }
} });
registerExtractor({ id: 'district', run(ctx) {
  const { toks } = ctx; let found = false;
  for (let i = 0; i < toks.length && !found; i++) {
    const t = toks[i].t.replace(/^و/, '');
    if (!['في', 'فى', 'ف', 'بمنطقه', 'منطقه', 'بحي', 'حي', 'بمدينه', 'مدينه', 'بمنطقة'].includes(t)) continue;
    let j = i + 1; if (['منطقه', 'حي', 'مدينه'].includes(toks[j]?.t) && ['في', 'ف', 'فى'].includes(t)) j++;
    const first = toks[j]?.t; if (!first || DIST_BAD_FIRST.has(first) || /^\d/.test(first) || LOC_STOP.has(first)) continue;
    const parts = [];
    while (j < toks.length && parts.length < 3) { const x = toks[j].t; if (LOC_STOP.has(x) || /^\d/.test(x)) break; parts.push(j); const brk = toks[j].brk; j++; if (brk) break; }
    if (!parts.length) continue;
    const a = toks[parts[0]].start, b = toks[parts.at(-1)].end;
    ctx.add('location.district', ctx.n.slice(a, b), { start: toks[i].start, end: b }, { first: true, display: ctx.src.slice(a, b) }); found = true;
  }
  if (!found) for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t.replace(/^و/, '');
    if (!/^بال\S{2,}/.test(t) || PRE_AL.has(t)) continue;
    const a = toks[i].start + (toks[i].t.startsWith('و') ? 2 : 1);
    ctx.add('location.district', ctx.n.slice(a, toks[i].end), { start: toks[i].start, end: toks[i].end }, { first: true, display: ctx.src.slice(a, toks[i].end) }); break;
  }
} });

/* --- عمولة السمسار (للعرض وليس للعقار) --- */
registerExtractor({ id: 'commission', run(ctx) {
  const re = /(?<![ء-ي])عموله\s*(?:السمسار\s*)?(?:ال)?\s*(\d+(?:\.\d+)?)\s*(?:%|٪|في\s+المايه|في\s+المائه)?/g; let m;
  while ((m = re.exec(ctx.n))) { const v = Number(m[1]); if (v > 0 && v <= 100) ctx.addOffer('commissionPercent', v, { start: m.index, end: m.index + m[0].length }); }
} });

/* ============ المحرك ============ */
const STOP_WORDS = new Set(['او', 'ثم', 'شهريا', 'سنويا', 'يوميا', 'شهري', 'و', 'في', 'ف', 'ب', 'من', 'علي', 'على', 'مع', 'بها', 'به', 'فيها', 'فيه', 'هو', 'هي', 'ال', 'ان', 'الي', 'عن', 'كل', 'لل', 'بس', 'فقط', 'يوجد', 'موجود', 'متوفر']);
const LABEL_FALLBACK = {};
export const CONFLICTABLE = new Set(['propertyType', 'transactionType', 'price', 'area', 'floor', 'rooms', 'bedrooms', 'bathrooms', 'receptions', 'finishing', 'engineering.kitchens', 'facilities.elevator']);

export function parseDescription(text = '') {
  const { src, n } = prepare(text);
  const toks = tokenize(n);
  const cands = [], offer = [], warnings = [], phones = [], blocked = [];
  const covered = new Array(n.length).fill(false);
  const ctx = {
    src, n, toks, cands, phones, blocked,
    add(key, value, span, opts = {}) { cands.push({ key, value, span, ...opts }); this.cover(span.start, span.end); },
    addOffer(key, value, span) { offer.push({ key, value, span }); this.cover(span.start, span.end); },
    cover(a, b) { for (let i = a; i < b && i < covered.length; i++) covered[i] = true; },
    warn(w) { if (!warnings.includes(w)) warnings.push(w); }
  };
  for (const ex of EXTRACTORS) {
    try {
      // المرشحون داخل نطاق هاتف لا يُقبلون (حتى لا يُقرأ الرقم كسعر)
      const before = cands.length; ex.run(ctx);
      if (ex.id !== 'phones') for (let i = cands.length - 1; i >= before; i--) if (blockedBy(ctx, cands[i].span) && cands[i].key !== 'phone') cands.splice(i, 1);
    } catch (e) { ctx.warn(`تعذّر تطبيق نمط "${ex.id}".`); }
  }

  const fields = {}, conflicts = [];
  const groups = new Map();
  for (const c of cands) (groups.get(c.key) || groups.set(c.key, []).get(c.key)).push(c);
  for (const [key, list] of groups) {
    const first = list[0];
    const distinct = [...new Map(list.map(c => [String(c.value), c])).values()];
    const display = c => c.display ?? c.value;
    const f = { value: display(first), raw: src.slice(first.span.start, first.span.end), conflict: false, alternatives: [], inferred: list.every(c => c.inferred) };
    if (distinct.length > 1 && CONFLICTABLE.has(key)) { f.conflict = true; f.alternatives = distinct.map(display); conflicts.push(key); }
    fields[key] = f;
  }
  // الحقل المستنتج (مثل المرفق من العداد) لا يطغى على حقل مصرَّح به صراحةً
  for (const [key, f] of Object.entries(fields)) if (f.inferred) { const explicit = groups.get(key).some(c => !c.inferred); if (explicit) f.inferred = false; }

  if (fields.price?.inferred === false && groups.get('price')?.some(c => c.inferred)) warnings.push('تم تفسير جزء من السعر (مثل "مليون و500") على أنه بالآلاف. راجع السعر.');
  if (fields.transactionType?.conflict) warnings.push('ورد في النص أكثر من نوع معاملة (بيع/إيجار). اختر الصحيح.');
  if (fields.propertyType?.conflict) warnings.push('ورد في النص أكثر من نوع عقار. اختر الصحيح.');
  if (!n.trim()) warnings.push('النص فارغ.');

  // الوصف الإضافي: كل ما لم يُفهم من النص (وحدات غير مغطاة) مجمّعة حسب الجملة
  const extra = []; let cur = [];
  const flush = () => { if (cur.length) { const phrase = src.slice(cur[0].start, cur.at(-1).end).trim(); if (phrase) extra.push(phrase); cur = []; } };
  for (const t of toks) {
    const isCovered = covered.slice(t.start, t.end).some(Boolean);
    const stop = STOP_WORDS.has(t.t) || STOP_WORDS.has(t.t.replace(/^و/, '')) || CUR.has(t.t) || unitLike(t.t);
    if (!isCovered && !stop) cur.push(t); else if (isCovered || stop) { if (!isCovered && cur.length && stop) { /* ربط داخل العبارة */ } else flush(); }
    if (t.brk) flush();
  }
  flush();

  const offerOut = {};
  if (phones.length) offerOut.brokerPhone = phones[0];
  for (const o of offer) offerOut[o.key] = o.value;
  if (phones.length > 1) warnings.push(`وُجد أكثر من رقم هاتف في النص (${phones.join('، ')}). تم اعتماد الأول كرقم السمسار، راجعه.`);

  return { fields, offer: offerOut, phones, extra, warnings, conflicts, found: Object.keys(fields).length, text: String(text) };
}
const unitLike = t => /^(?:متر|م|م2|م²|مربع)$/.test(t);

/** مفاتيح الاستمارة التي قد يملؤها المحلل (للمعاينة والتمييز). */
export const PARSER_FIELD_KEYS = ['propertyType', 'transactionType', 'location.district', 'location.street', 'area', 'floor', 'rooms', 'bedrooms', 'bathrooms', 'receptions', 'engineering.kitchens', 'finishing', 'price',
  'facilities.elevator', 'facilities.electricity', 'facilities.water', 'facilities.gas', 'facilities.indepElectric', 'facilities.indepWater', 'facilities.indepGas', 'engineering.garage', 'engineering.garden', 'engineering.roof', 'engineering.corner', 'financialDetails.negotiable'];
