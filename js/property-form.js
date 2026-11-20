import { guard, toast } from './layout.js';
import { GROUPS, ALL_FIELDS, buildDoc, validate, flatten } from './property-model.js';
import { getProperty, createProperty, updateProperty, fetchDuplicatePool } from './services/properties.js';
import { listOffers, addOffer } from './services/offers.js';
import { validateOffer, OFFER_STATUSES, SOURCE_KINDS } from './offers-model.js';
import { findDuplicates, SIMILARITY_LABELS } from './duplicate-model.js';
import { mountParsePanel } from './parse-ui.js';
import { displayCode } from './property-model.js';
import { escapeHtml, fmtNumber } from './utils.js';

const user = await guard({ base: '../', active: 'pages/add-property.html' });
const id = new URLSearchParams(location.search).get('id');
const canOwner = user.role === 'admin' || user.permissions?.canViewOwnerData === true;
// السعر في الإضافة = سعر أول عرض؛ وفي التعديل يُدار السعر من قسم "السماسرة والعروض" بصفحة العقار.
const showField = f => (!id || !f.addOnly) && (!f.p || !id || canOwner) && !(id && f.k === 'price');
const dom = k => 'f_' + k.replaceAll('.', '_');

function input(f) {
  const cls = 'form-control';
  if (f.t === 's') return `<select class="form-select" id="${dom(f.k)}" data-k="${f.k}"><option value="">—</option>${Object.entries(f.o).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  if (f.t === 'a') return `<textarea class="${cls}" rows="2" id="${dom(f.k)}" data-k="${f.k}"></textarea>`;
  return `<input class="${cls}" id="${dom(f.k)}" data-k="${f.k}" ${f.t === 'n' ? 'inputmode="decimal"' : ''} autocomplete="off">`;
}

document.getElementById('groups').innerHTML = GROUPS.map((g, i) => {
  const fields = g.fields.filter(showField);
  if (!fields.length) return '';
  return `<div class="accordion-item"><h2 class="accordion-header"><button type="button" class="accordion-button ${g.open ? '' : 'collapsed'}" data-bs-toggle="collapse" data-bs-target="#g_${g.id}">${g.title}</button></h2>
  <div id="g_${g.id}" class="accordion-collapse collapse ${g.open ? 'show' : ''}"><div class="accordion-body"><div class="row g-3">
  ${fields.map(f => `<div class="${f.t === 'a' ? 'col-12' : 'col-12 col-md-6 col-lg-4'}"><label class="form-label" for="${dom(f.k)}">${f.l}${f.r ? ' <span class="text-danger">*</span>' : ''}</label>${input(f)}<div class="invalid-feedback"></div></div>`).join('')}
  </div></div></div></div>`;
}).join('');

const O = { sourceKind: 'o_sourceKind', brokerName: 'o_brokerName', brokerPhone: 'o_brokerPhone', commissionAgreed: 'o_commissionAgreed', commissionPercent: 'o_commissionPercent', notes: 'o_notes' };
const offerVals = values => ({ price: values.price, ...Object.fromEntries(Object.entries(O).map(([k, i]) => [k, document.getElementById(i)?.value ?? ''])) });
const setVal = (k, v) => { const el = document.querySelector(`[data-k="${k}"]`); if (!el) return false; el.value = v; el.classList.add('from-parse'); el.addEventListener('input', () => el.classList.remove('from-parse'), { once: true }); return true; };

if (!id) {
  document.getElementById('offerBox').innerHTML = `<div class="card mb-3"><div class="card-body"><h2 class="h6 mb-1">عرض السمسار الأول</h2>
    <p class="small text-muted">السعر (في المجموعة الأولى بالأسفل) هو سعر هذا العرض. يمكن إضافة سماسرة وعروض أخرى لنفس العقار لاحقًا من صفحة العقار. رقم الهاتف يمكن تكراره بلا حدود.</p>
    <div class="row g-3">
      <div class="col-12 col-md-4"><label class="form-label" for="o_sourceKind">المصدر</label><select class="form-select" id="o_sourceKind">${Object.entries(SOURCE_KINDS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      <div class="col-12 col-md-4"><label class="form-label" for="o_brokerName">الاسم (اختياري)</label><input class="form-control" id="o_brokerName" autocomplete="off"></div>
      <div class="col-12 col-md-4"><label class="form-label" for="o_brokerPhone">رقم الهاتف</label><input class="form-control" id="o_brokerPhone" inputmode="tel" autocomplete="off"><div class="invalid-feedback"></div></div>
      <div class="col-12 col-md-6"><label class="form-label" for="o_commissionAgreed">العمولة / الاتفاق المالي</label><input class="form-control" id="o_commissionAgreed" autocomplete="off"></div>
      <div class="col-12 col-md-3"><label class="form-label" for="o_commissionPercent">نسبة العمولة %</label><input class="form-control" id="o_commissionPercent" inputmode="decimal" autocomplete="off"><div class="invalid-feedback"></div></div>
      <div class="col-12"><label class="form-label" for="o_notes">ملاحظات خاصة بالسمسار</label><textarea class="form-control" id="o_notes" rows="2"></textarea></div>
    </div></div></div>`;
  mountParsePanel(document.getElementById('parseBox'), ({ values, offer, sourceText }) => {
    let n = 0;
    for (const [k, v] of Object.entries(values)) {
      if (k === 'notes.general') { const el = document.querySelector('[data-k="notes.general"]'); if (el) { el.value = el.value ? `${el.value}\n${v}` : v; el.classList.add('from-parse'); n++; } continue; }
      if (setVal(k, v)) n++;
    }
    if (sourceText) setVal('notes.sourceText', sourceText);
    if (offer.brokerPhone) { const el = document.getElementById(O.brokerPhone); el.value = offer.brokerPhone; el.classList.add('from-parse'); }
    if (offer.commissionPercent) { const el = document.getElementById(O.commissionPercent); el.value = offer.commissionPercent; el.classList.add('from-parse'); }
    document.querySelectorAll('.from-parse').forEach(el => el.closest('.accordion-collapse')?.classList.add('show'));
    window.__dirty = true; dirty = true;
    toast(`تم نقل ${n} حقلًا إلى الاستمارة. راجعها ثم احفظ العقار.`, 'success');
    document.getElementById('form').scrollIntoView({ behavior: 'smooth' });
  });
}

const get = () => Object.fromEntries([...document.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e.value]));
let old = null, dirty = window.__dirty = false;

if (id) {
  document.getElementById('title').textContent = 'تعديل عقار';
  document.getElementById('offerBox').innerHTML = `<div class="alert alert-info small">السعر والسماسرة والعروض تُدار من قسم "السماسرة والعروض" في <a href="property-details.html?id=${id}">صفحة العقار</a>. كود العقار ثابت ولا يتغير.</div>`;
  old = await getProperty(id, canOwner);
  if (!old) { document.getElementById('groups').innerHTML = '<div class="alert alert-danger">العقار غير موجود.</div>'; document.getElementById('save').hidden = true; }
  else {
    const vals = { ...flatten(old), ...flatten(old._priv || {}) };
    document.querySelectorAll('[data-k]').forEach(e => { const v = vals[e.dataset.k]; if (v != null) e.value = v; });
  }
}
const toggleBtn = document.getElementById('more');
toggleBtn.onclick = () => {
  const rest = GROUPS.slice(1).map(g => document.getElementById('g_' + g.id)).filter(Boolean);
  const open = rest.some(el => !el.classList.contains('show'));
  rest.forEach(el => bootstrap.Collapse.getOrCreateInstance(el, { toggle: false })[open ? 'show' : 'hide']());
  toggleBtn.textContent = open ? 'إخفاء التفاصيل الإضافية' : 'إظهار التفاصيل الإضافية';
};
document.getElementById('form').addEventListener('input', () => (dirty = window.__dirty = true));
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- تحذير العقارات المتشابهة (لا يمنع الحفظ: القرار للمستخدم) ---------- */
const modalEl = document.getElementById('dupModal');
const fmtSig = x => `${x.label}: الجديد <strong>${escapeHtml(String(x.draft ?? '—'))}</strong> — الموجود <strong>${escapeHtml(String(x.existing ?? '—'))}</strong>`;
function offerLine(o) {
  const pr = o._priv || {};
  const who = pr.brokerName || pr.brokerPhone ? ` — ${escapeHtml(pr.brokerName || '')} ${escapeHtml(pr.brokerPhone || '')}` : '';
  return `<li>${o.price != null ? fmtNumber(o.price) + ' جنيه' : 'بلا سعر'} <span class="badge text-bg-${o.status === 'active' ? 'success' : 'secondary'}">${OFFER_STATUSES[o.status] || o.status}</span>${who}</li>`;
}
function askDuplicate(cands, oVals) {
  return new Promise(resolve => {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    let done = false; const finish = r => { if (done) return; done = true; modal.hide(); resolve(r); };
    document.getElementById('dupBody').innerHTML = '<p class="small text-muted">النسب تقديرية وليست ضمانًا. اختلاف السعر أو السمسار لا يعني اختلاف العقار. أنت من يقرر: ربط العرض بعقار موجود أو إضافة عقار مستقل.</p>' + cands.map((c, i) => {
      const p = c.item, brokers = c.offers.filter(o => o._priv?.brokerPhone);
      return `<div class="dup-card" data-i="${i}">
        <div class="d-flex justify-content-between flex-wrap gap-1"><div><strong>عقار رقم ${escapeHtml(displayCode(p))}</strong> <button type="button" class="btn btn-sm btn-link p-0" data-copy="${escapeHtml(displayCode(p))}" title="نسخ الكود"><i class="bi bi-clipboard"></i></button></div>
          <div><span class="badge text-bg-warning">${c.score}%</span> ${SIMILARITY_LABELS[c.level]}</div></div>
        <div class="small text-muted my-1">${escapeHtml([p.location?.district, p.location?.street, p.area != null ? p.area + ' م²' : '', p.floor != null ? 'الدور ' + p.floor : '', p.rooms != null ? p.rooms + ' غرف' : ''].filter(Boolean).join(' · '))}</div>
        ${c.differences.length ? `<div class="small"><strong>الاختلافات:</strong><ul class="mb-1">${c.differences.map(x => `<li>${fmtSig(x)}</li>`).join('')}</ul></div>` : '<div class="small text-success">لا اختلافات في البيانات المقارنة.</div>'}
        ${c.priceNote ? `<div class="small text-muted mb-1">${escapeHtml(c.priceNote)}</div>` : ''}
        <div class="small"><strong>العروض الحالية (${c.offers.length}):</strong><ul class="mb-2">${c.offers.map(offerLine).join('') || '<li>لا عروض</li>'}</ul></div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          ${brokers.length ? `<select class="form-select form-select-sm w-auto" data-broker><option value="new">سمسار جديد (من الاستمارة)</option>${brokers.map(o => `<option value="${o.id}">نفس السمسار: ${escapeHtml(o._priv.brokerName || '')} ${escapeHtml(o._priv.brokerPhone)}</option>`).join('')}</select>` : ''}
          <button type="button" class="btn btn-sm btn-gold" data-add>${brokers.length ? 'إضافة العرض إلى هذا العقار' : 'إضافة سمسار جديد إلى هذا العقار'}</button>
          <a class="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener" href="property-details.html?id=${p.id}">فتح العقار الموجود</a></div></div>`;
    }).join('');
    document.getElementById('dupBody').onclick = async e => {
      const cp = e.target.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('تم نسخ الكود.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } return; }
      const add = e.target.closest('[data-add]'); if (!add) return;
      const card = add.closest('[data-i]'), c = cands[+card.dataset.i], sel = card.querySelector('[data-broker]');
      let vals = { ...oVals };
      if (sel && sel.value !== 'new') { const o = c.offers.find(x => x.id === sel.value); vals = { ...vals, brokerName: o._priv.brokerName || '', brokerPhone: o._priv.brokerPhone || '', sourceKind: o.sourceKind || vals.sourceKind }; }
      add.disabled = true; finish({ action: 'addOffer', candidate: c.item, vals });
    };
    document.getElementById('dupIndependent').onclick = () => finish({ action: 'independent' });
    document.getElementById('dupBack').onclick = () => finish(null);
    modalEl.addEventListener('hidden.bs.modal', () => finish(null), { once: true });
    modal.show();
  });
}

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('save');
  if (btn.disabled) return;
  const values = get();
  const errs = validate(values);
  document.querySelectorAll('.is-invalid').forEach(x => x.classList.remove('is-invalid'));
  const keys = Object.keys(errs).filter(k => ALL_FIELDS.some(f => f.k === k && showField(f)));
  keys.forEach(k => { const el = document.getElementById(dom(k)); el.classList.add('is-invalid'); el.nextElementSibling.textContent = errs[k]; });
  let oErr = {};
  if (!id) {
    oErr = validateOffer(offerVals(values)); delete oErr.price;      // السعر يُتحقق منه مع حقول الاستمارة
    for (const k of ['brokerPhone', 'commissionPercent']) if (oErr[k]) { const el = document.getElementById(O[k]); el.classList.add('is-invalid'); el.nextElementSibling.textContent = oErr[k]; }
  }
  if (keys.length || Object.keys(oErr).length) { (document.getElementById(keys.length ? dom(keys[0]) : O[Object.keys(oErr)[0]])).scrollIntoView({ block: 'center' }); return toast('راجع الحقول المحددة.', 'danger'); }
  btn.disabled = true;
  try {
    const { pub, priv } = buildDoc(values);
    let target = id;
    if (id) {
      const fresh = await getProperty(id, false);
      if (fresh.updatedAt?.toMillis() !== old.updatedAt?.toMillis() && !confirm('عدّل عضو آخر هذا العقار أثناء فتحك له. هل تريد استبدال تعديلاته بتعديلاتك؟')) { btn.disabled = false; return; }
      await updateProperty(user, old, pub, priv, canOwner);
    } else {
      const oVals = offerVals(values);
      // فحص التكرار قبل الحفظ. فشل الفحص لا يمنع الحفظ (تحذير فقط).
      let cands = [];
      try {
        cands = findDuplicates(pub, await fetchDuplicatePool(pub));
        cands = await Promise.all(cands.map(async c => ({ ...c, offers: await listOffers(c.item.id, canOwner).catch(() => []) })));
      } catch (ex) { console.error(ex); toast('تعذّر فحص العقارات المتشابهة، سيتم الحفظ دون فحص.', 'warning'); }
      if (cands.length) {
        const choice = await askDuplicate(cands, oVals);
        if (!choice) { btn.disabled = false; return; }
        if (choice.action === 'addOffer') {
          await addOffer(user, choice.candidate, oVals);
          dirty = window.__dirty = false; toast('تمت إضافة العرض إلى العقار الموجود.', 'success');
          location.href = `property-details.html?id=${choice.candidate.id}`; return;
        }
      }
      target = (await createProperty(user, pub, priv, oVals)).id;
    }
    dirty = window.__dirty = false;
    location.href = `property-details.html?id=${target}`;
  } catch (ex) { console.error(ex); toast(ex.code === 'VALIDATION_ERROR' ? ex.message : 'تعذّر الحفظ. بياناتك ما زالت في الاستمارة، حاول مرة أخرى.', 'danger'); btn.disabled = false; }
});
