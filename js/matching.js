import { guard, toast } from './layout.js';
import { db, collection, query, where, orderBy, limit, onSnapshot } from './firebase-config.js';
import { escapeHtml, fmtNumber, normalizeAr, toLatinDigits, PROPERTY_TYPES, TRANSACTION_TYPES } from './utils.js';
import { REQUEST_STATUSES, CONTACT_TYPES, CONTACT_OUTCOMES, addCustomerContact, addRequestFollowUp } from './services/customers.js';
import { ACTIVE_STATUSES, DEFAULT_MIN_SCORE, LEVEL_LABELS, scorePair, matchRequest, matchProperty } from './matching-model.js';
import { favButton, attachFavorites } from './favorites-ui.js';

const user = await guard({ base: '../', active: 'pages/matching.html' });
const $ = id => document.getElementById(id);
const MAX = 500; // أقصى عدد عقارات/طلبات تُحمَّل للمطابقة

let props = [], reqs = [], minScore = DEFAULT_MIN_SCORE;
let selReq = null, selProp = null, reqStats = new Map(), propStats = new Map();
let propsReady = false, reqsReady = false;

/* ---------- تحميل لحظي: أي إضافة/تعديل/تغيير حالة يعيد حساب النتائج تلقائيًا ---------- */
const fail = e => { console.error(e); $('loadError').hidden = false; };
onSnapshot(query(collection(db, 'properties'), where('status', '==', 'available'), orderBy('createdAt', 'desc'), limit(MAX)),
  s => { props = s.docs.map(d => ({ id: d.id, ...d.data() })); propsReady = true; refresh(); }, fail);
onSnapshot(query(collection(db, 'customerRequests'), where('status', 'in', ACTIVE_STATUSES), limit(MAX)),
  s => { reqs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)); reqsReady = true; refresh(); }, fail);

/* ---------- حسابات ---------- */
function computeStats() {
  reqStats = new Map(); propStats = new Map();
  for (const r of reqs) for (const p of props) {
    const m = scorePair(r, p);
    if (!m || m.score < minScore) continue;
    const a = reqStats.get(r.id) || { count: 0, best: 0 }; a.count++; a.best = Math.max(a.best, m.score); reqStats.set(r.id, a);
    const b = propStats.get(p.id) || { count: 0, best: 0 }; b.count++; b.best = Math.max(b.best, m.score); propStats.set(p.id, b);
  }
}

const range = (min, max, unit) => min != null && max != null ? `${fmtNumber(min)} - ${fmtNumber(max)} ${unit}` : min != null ? `من ${fmtNumber(min)} ${unit}` : max != null ? `حتى ${fmtNumber(max)} ${unit}` : 'غير محدد';
const pill = s => `<span class="score-pill score-${s >= 80 ? 'high' : s >= 60 ? 'medium' : 'low'}">${s}%</span>`;
const bar = s => `<div class="score-bar mt-1"><i class="score-${s >= 80 ? 'high' : s >= 60 ? 'medium' : 'low'}" style="width:${s}%"></i></div>`;
const reasonsHtml = rs => rs.length ? `<ul class="list-unstyled small mb-2">${rs.map(r => `<li class="reason-${r.state}"><i class="bi bi-${r.state === 'ok' ? 'check-circle' : r.state === 'partial' ? 'dash-circle' : 'x-circle'} ms-1"></i><strong>${r.label}:</strong> ${escapeHtml(r.text)}</li>`).join('')}</ul>` : '';
const empty = (icon, text) => `<div class="empty panel"><i class="bi bi-${icon}"></i><p>${text}</p></div>`;
const propTitle = p => `${escapeHtml(p.code || '')} · ${PROPERTY_TYPES[p.propertyType] || ''} · ${TRANSACTION_TYPES[p.transactionType] || ''}`;
const where_ = p => escapeHtml([p.location?.district, p.location?.city].filter(Boolean).join('، '));

/* ---------- القوائم اليمنى (الاختيار) ---------- */
function drawReqList() {
  const q = normalizeAr($('reqSearch').value), qd = toLatinDigits($('reqSearch').value).replace(/\D/g, '');
  const rows = reqs.filter(r => !q || normalizeAr([r.code, r.customerName, r.city, r.districts].filter(Boolean).join(' ')).includes(q) || (qd && String(r.customerPhone || '').includes(qd)))
    .sort((a, b) => (reqStats.get(b.id)?.best || 0) - (reqStats.get(a.id)?.best || 0));
  $('reqList').innerHTML = !reqsReady ? '<div class="text-muted">جارٍ التحميل...</div> ' : rows.length ? rows.map(r => {
    const st = reqStats.get(r.id);
    return `<button type="button" class="pick ${r.id === selReq ? 'sel' : ''}" data-req="${r.id}">
      <div class="d-flex justify-content-between align-items-start gap-2"><strong>${escapeHtml(r.customerName || '—')}</strong>${st ? pill(st.best) : '<span class="small text-muted">لا نتائج</span>'}</div>
      <div class="small text-muted">${escapeHtml(r.code || '')} · ${PROPERTY_TYPES[r.propertyType] || ''} (${TRANSACTION_TYPES[r.transactionType] || ''})</div>
      <div class="small">${escapeHtml([r.city, r.districts].filter(Boolean).join(' - ') || 'الموقع غير محدد')}${st ? ` · <span class="text-success">${st.count} عقار مناسب</span>` : ''}</div></button>`;
  }).join('') : empty('card-checklist', reqs.length ? 'لا توجد طلبات مطابقة للبحث.' : 'لا توجد طلبات نشطة حاليًا.');
}

function drawPropList() {
  const q = normalizeAr($('propSearch').value);
  const rows = props.filter(p => !q || normalizeAr([p.code, p.location?.city, p.location?.district].filter(Boolean).join(' ')).includes(q))
    .sort((a, b) => (propStats.get(b.id)?.best || 0) - (propStats.get(a.id)?.best || 0));
  $('propList').innerHTML = !propsReady ? '<div class="text-muted">جارٍ التحميل...</div> ' : rows.length ? rows.map(p => {
    const st = propStats.get(p.id);
    return `<button type="button" class="pick ${p.id === selProp ? 'sel' : ''}" data-prop="${p.id}">
      <div class="d-flex justify-content-between align-items-start gap-2"><strong>${propTitle(p)}</strong>${st ? pill(st.best) : '<span class="small text-muted">لا اهتمام</span>'}</div>
      <div class="small text-muted">${where_(p)} ${p.price != null ? '· ' + fmtNumber(p.price) + ' جنيه' : ''}</div>
      ${st ? `<div class="small text-success">${st.count} عميل محتمل</div>` : ''}</button>`;
  }).join('') : empty('buildings', props.length ? 'لا توجد عقارات مطابقة للبحث.' : 'لا توجد عقارات متاحة حاليًا.');
}

/* ---------- النتائج ---------- */
function drawReqResults() {
  const r = reqs.find(x => x.id === selReq);
  if (!selReq) return ($('reqResults').innerHTML = empty('diagram-3', 'اختر طلب عميل لعرض العقارات المناسبة له.'));
  if (!r) { selReq = null; return ($('reqResults').innerHTML = empty('info-circle', 'هذا الطلب لم يعد نشطًا أو تم حذفه.')); }
  const res = matchRequest(r, props, { minScore });
  const head = `<section class="panel mb-3 p-3"><div class="d-flex justify-content-between flex-wrap gap-2">
    <div><strong>${escapeHtml(r.code || '')} · ${PROPERTY_TYPES[r.propertyType] || ''} (${TRANSACTION_TYPES[r.transactionType] || ''})</strong>
    <div class="small text-muted">العميل: <a class="text-decoration-none fw-semibold" href="customer-details.html?id=${r.customerId}#requests">${escapeHtml(r.customerName || '—')}</a> (${escapeHtml(r.customerPhone || '')}) · ${REQUEST_STATUSES[r.status] || ''}</div></div>
    <button class="btn btn-sm btn-gold align-self-start" data-contact-req="${r.id}"><i class="bi bi-telephone ms-1"></i>تسجيل تواصل</button></div>
    <div class="small mt-2">الموقع: <strong>${escapeHtml([r.city, r.districts].filter(Boolean).join(' - ') || 'غير محدد')}</strong> · الميزانية: <strong>${range(r.budgetMin, r.budgetMax, 'جنيه')}</strong> · المساحة: <strong>${range(r.areaMin, r.areaMax, 'م²')}</strong>${r.roomsMin != null ? ` · غرف: <strong>${r.roomsMin}+</strong>` : ''}</div></section>`;
  $('reqResults').innerHTML = head + (res.length ? `<div class="small text-muted mb-2">${res.length} عقار مناسب، الأعلى توافقًا أولًا</div>` + res.map(m => {
    const p = m.item;
    return `<div class="req-card mb-3"><div class="d-flex justify-content-between align-items-start gap-2">
      <div><strong>${propTitle(p)}</strong><div class="small text-muted">${where_(p)}</div>
      <div class="fw-bold" style="color:var(--navy)">${p.price != null ? fmtNumber(p.price) + ' جنيه' : 'السعر غير مسجل'}
      <span class="small text-muted fw-normal">${[p.area != null && fmtNumber(p.area) + ' م²', p.rooms != null && p.rooms + ' غرف'].filter(Boolean).join(' · ')}</span></div></div>
      <div class="text-center">${pill(m.score)}<div class="small text-muted">${LEVEL_LABELS[m.level]}</div></div></div>
      ${bar(m.score)}<div class="mt-2">${reasonsHtml(m.reasons)}</div>
      <div class="d-flex flex-wrap gap-2"><a class="btn btn-sm btn-navy" href="property-details.html?id=${p.id}">تفاصيل العقار</a>
      <a class="btn btn-sm btn-outline-secondary" href="customer-details.html?id=${r.customerId}#requests">ملف العميل</a>
      <button class="btn btn-sm btn-outline-success" data-contact-req="${r.id}" data-contact-prop="${p.id}"><i class="bi bi-telephone ms-1"></i>تسجيل تواصل</button>${favButton(p.id)}</div></div>`;
  }).join('') : empty('search', `لا توجد عقارات متاحة بتوافق ${minScore}% أو أكثر. جرّب تخفيض نسبة التوافق.`));
}

function drawPropResults() {
  const p = props.find(x => x.id === selProp);
  if (!selProp) return ($('propResults').innerHTML = empty('people', 'اختر عقارًا لعرض العملاء المحتمل اهتمامهم به.'));
  if (!p) { selProp = null; return ($('propResults').innerHTML = empty('info-circle', 'هذا العقار لم يعد متاحًا أو تم حذفه.')); }
  const res = matchProperty(p, reqs, { minScore });
  const head = `<section class="panel mb-3 p-3"><div class="d-flex justify-content-between flex-wrap gap-2">
    <div><strong>${propTitle(p)}</strong><div class="small text-muted">${where_(p)}</div>
    <div class="small">${p.price != null ? fmtNumber(p.price) + ' جنيه' : 'السعر غير مسجل'} · ${[p.area != null && fmtNumber(p.area) + ' م²', p.rooms != null && p.rooms + ' غرف'].filter(Boolean).join(' · ')}</div></div>
    <a class="btn btn-sm btn-navy align-self-start" href="property-details.html?id=${p.id}">تفاصيل العقار</a>${favButton(p.id)}</div></section>`;
  $('propResults').innerHTML = head + (res.length ? `<div class="small text-muted mb-2">${res.length} عميل محتمل، الأعلى توافقًا أولًا</div>` + res.map(m => {
    const r = m.item;
    return `<div class="req-card mb-3"><div class="d-flex justify-content-between align-items-start gap-2">
      <div><strong>${escapeHtml(r.customerName || '—')}</strong> <span class="small text-muted">${escapeHtml(r.customerPhone || '')}</span>
      <div class="small text-muted">${escapeHtml(r.code || '')} · ${REQUEST_STATUSES[r.status] || ''}</div>
      <div class="small">الميزانية: ${range(r.budgetMin, r.budgetMax, 'جنيه')} · المساحة: ${range(r.areaMin, r.areaMax, 'م²')}${r.roomsMin != null ? ` · ${r.roomsMin}+ غرف` : ''}</div></div>
      <div class="text-center">${pill(m.score)}<div class="small text-muted">${LEVEL_LABELS[m.level]}</div></div></div>
      ${bar(m.score)}<div class="mt-2">${reasonsHtml(m.reasons)}</div>
      <div class="d-flex flex-wrap gap-2"><a class="btn btn-sm btn-navy" href="customer-details.html?id=${r.customerId}#requests">ملف العميل والطلب</a>
      <button class="btn btn-sm btn-outline-success" data-contact-req="${r.id}" data-contact-prop="${p.id}"><i class="bi bi-telephone ms-1"></i>تسجيل تواصل</button></div></div>`;
  }).join('') : empty('search', `لا يوجد عملاء بتوافق ${minScore}% أو أكثر مع هذا العقار.`));
}

function refresh() {
  $('loadError').hidden = true;
  computeStats();
  const capped = [props.length >= MAX && 'العقارات', reqs.length >= MAX && 'الطلبات'].filter(Boolean);
  $('limitNote').hidden = !capped.length;
  if (capped.length) $('limitNote').textContent = `تم الوصول للحد الأقصى (${MAX}) في ${capped.join(' و')}؛ تُحمَّل الأحدث فقط لأغراض المطابقة.`;
  drawReqList(); drawPropList(); drawReqResults(); drawPropResults();
}

/* ---------- أحداث ---------- */
const scrollTo_ = id => { if (matchMedia('(max-width:991px)').matches) $(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('reqList').addEventListener('click', e => { const b = e.target.closest('[data-req]'); if (!b) return; selReq = b.dataset.req; drawReqList(); drawReqResults(); scrollTo_('reqResults'); });
$('propList').addEventListener('click', e => { const b = e.target.closest('[data-prop]'); if (!b) return; selProp = b.dataset.prop; drawPropList(); drawPropResults(); scrollTo_('propResults'); });
$('reqSearch').addEventListener('input', drawReqList);
$('propSearch').addEventListener('input', drawPropList);
$('minScore').addEventListener('change', e => { minScore = Number(e.target.value); refresh(); });
attachFavorites($('reqResults'), user, id => props.find(p => p.id === id));
attachFavorites($('propResults'), user, id => props.find(p => p.id === id));

/* ---------- تسجيل نتيجة التواصل: يستخدم نفس خدمات سجل التواصل والمتابعات في المرحلة 4 ---------- */
const modal = new bootstrap.Modal($('contactModal'));
let ctx = null;
const fill = (el, map, first) => (el.innerHTML = (first ? `<option value="">${first}</option>` : '') + Object.entries(map).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
fill($('cmType'), CONTACT_TYPES); fill($('cmOutcome'), CONTACT_OUTCOMES); fill($('cmStatus'), REQUEST_STATUSES, 'بدون تغيير');

document.addEventListener('click', e => {
  const b = e.target.closest('[data-contact-req]'); if (!b) return;
  const r = reqs.find(x => x.id === b.dataset.contactReq); if (!r) return toast('الطلب لم يعد نشطًا.', 'warning');
  const p = props.find(x => x.id === b.dataset.contactProp);
  ctx = { r, p };
  $('cmContext').textContent = `العميل: ${r.customerName || '—'} · الطلب ${r.code || ''}${p ? ` · العقار ${p.code || ''}` : ''}`;
  $('cmDate').value = new Date().toISOString().slice(0, 10);
  $('cmNext').value = ''; $('cmNotes').value = ''; $('cmStatus').value = ''; $('cmNotes').classList.remove('is-invalid');
  modal.show();
});

$('contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const notes = $('cmNotes').value.trim();
  $('cmNotes').classList.toggle('is-invalid', !notes);
  if (!notes || !ctx) return;
  const { r, p } = ctx, save = $('cmSave'), tag = p ? `[مطابقة ${p.code || ''}] ` : '[مطابقة] ';
  save.disabled = true;
  try {
    await addCustomerContact(user, r.customerId, { type: $('cmType').value, outcome: $('cmOutcome').value, contactDate: $('cmDate').value, nextFollowUpDate: $('cmNext').value, notes: tag + notes });
    // المتابعة على الطلب: تُسجَّل دائمًا مع نص التواصل، وتغيّر حالة الطلب فقط إن اختارها المستخدم.
    await addRequestFollowUp(user, r.id, { note: tag + notes, status: $('cmStatus').value || null, nextActionDate: $('cmNext').value });
    modal.hide(); toast('تم تسجيل نتيجة التواصل والمتابعة.', 'success');
  } catch (ex) { console.error(ex); toast(ex.code === 'VALIDATION_ERROR' ? ex.message : 'تعذّر حفظ التواصل.', 'danger'); }
  save.disabled = false;
});
