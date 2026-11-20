// لوحة "إدخال من وصف جاهز": لصق → تحليل محلي → معاينة قابلة للتعديل → اعتماد (يملأ الاستمارة ولا يحفظ شيئًا).
import { parseDescription, PARSER_FIELD_KEYS } from './description-parser.js';
import { ALL_FIELDS } from './property-model.js';
import { escapeHtml } from './utils.js';

const spec = k => ALL_FIELDS.find(f => f.k === k);
const optLabel = (f, v) => (f?.o?.[v] ?? v);

function control(k, value, alternatives) {
  const f = spec(k), attr = `data-pk="${k}"`;
  if (alternatives?.length) return `<select class="form-select form-select-sm" ${attr}>${alternatives.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(optLabel(f, a))}</option>`).join('')}</select>`;
  if (f?.t === 's') return `<select class="form-select form-select-sm" ${attr}>${Object.entries(f.o).map(([v, l]) => `<option value="${v}" ${v === String(value) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  if (f?.t === 'a') return `<textarea class="form-control form-control-sm" rows="2" ${attr}>${escapeHtml(String(value ?? ''))}</textarea>`;
  return `<input class="form-control form-control-sm" ${attr} value="${escapeHtml(String(value ?? ''))}">`;
}

/** onApply({ values, offer, sourceText }) يُستدعى عند "اعتماد البيانات ومراجعة العقار". */
export function mountParsePanel(box, onApply) {
  box.innerHTML = `<div class="card mb-3 border-warning"><div class="card-body">
    <h2 class="h6 mb-1"><i class="bi bi-magic ms-1"></i>إدخال من وصف جاهز</h2>
    <p class="small text-muted mb-2">الصق وصف العقار كما وصلك، وسيُوزَّع على الحقول تلقائيًا. لا يُخترع أي بيانات: ما لم يُذكر يبقى فارغًا، ولن يُحفظ شيء قبل مراجعتك.</p>
    <textarea id="pd_text" class="form-control mb-2" rows="5" placeholder="مثال: شقة للبيع في الخانكة شارع الجمهورية، مساحة 150 متر، الدور الثالث، 3 غرف..."></textarea>
    <div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-navy btn-sm" id="pd_go">تحليل الوصف</button>
    <button type="button" class="btn btn-outline-secondary btn-sm" id="pd_clear" hidden>مسح البيانات المستخرجة</button>
    <span id="pd_spin" class="spinner-border spinner-border-sm align-self-center" hidden role="status" aria-label="جارٍ التحليل"></span></div>
    <div id="pd_out" class="mt-3"></div></div></div>`;
  const $ = id => box.querySelector('#' + id);
  let last = null;

  const clear = () => { $('pd_out').innerHTML = ''; $('pd_clear').hidden = true; last = null; };
  $('pd_clear').onclick = clear;

  $('pd_go').onclick = async () => {
    const text = $('pd_text').value; if (!text.trim()) { $('pd_out').innerHTML = '<div class="alert alert-warning mb-0">الصق الوصف أولًا.</div>'; return; }
    $('pd_spin').hidden = false; $('pd_go').disabled = true;
    await new Promise(r => setTimeout(r, 30));              // يترك للمتصفح فرصة رسم المؤشر
    try { last = parseDescription(text); render(last); } catch (e) { console.error(e); $('pd_out').innerHTML = '<div class="alert alert-danger mb-0">تعذّر تحليل النص. يمكنك إدخال البيانات يدويًا.</div>'; }
    $('pd_spin').hidden = true; $('pd_go').disabled = false;
  };

  function render(r) {
    const found = PARSER_FIELD_KEYS.filter(k => r.fields[k]);
    const missing = PARSER_FIELD_KEYS.filter(k => !r.fields[k] && !['facilities.electricity', 'facilities.water', 'facilities.gas'].includes(k));
    const row = k => { const f = r.fields[k], sp = spec(k);
      const badge = f.conflict ? '<span class="badge text-bg-danger">تعارض: اختر الصحيح</span>' : f.inferred ? '<span class="badge text-bg-info">مستنتج</span>' : '<span class="badge text-bg-success">مستخرج</span>';
      return `<div class="row g-2 align-items-center mb-1"><div class="col-4 small">${escapeHtml(sp?.l || k)}</div><div class="col-5">${control(k, f.value, f.conflict ? f.alternatives : null)}</div><div class="col-3">${badge}</div></div>`; };
    const extraVal = r.extra.join('، ');
    $('pd_out').innerHTML = `
      ${r.warnings.length ? `<div class="alert alert-warning py-2 small">${r.warnings.map(w => `<div><i class="bi bi-exclamation-triangle ms-1"></i>${escapeHtml(w)}</div>`).join('')}</div>` : ''}
      ${found.length ? found.map(row).join('') : '<div class="alert alert-secondary">لم يُعثر على بيانات واضحة في النص. أدخلها يدويًا في الاستمارة.</div>'}
      ${r.offer.brokerPhone ? `<div class="row g-2 align-items-center mb-1"><div class="col-4 small">رقم السمسار (للعرض)</div><div class="col-5"><input class="form-control form-control-sm" data-pk="offer.brokerPhone" value="${escapeHtml(r.offer.brokerPhone)}"></div><div class="col-3"><span class="badge text-bg-success">مستخرج</span></div></div>` : ''}
      ${r.offer.commissionPercent ? `<div class="row g-2 align-items-center mb-1"><div class="col-4 small">نسبة العمولة %</div><div class="col-5"><input class="form-control form-control-sm" data-pk="offer.commissionPercent" value="${r.offer.commissionPercent}"></div><div class="col-3"><span class="badge text-bg-success">مستخرج</span></div></div>` : ''}
      ${r.extra.length ? `<div class="alert alert-info py-2 small mt-2 mb-2"><strong>معلومات لم تُصنَّف في حقل محدد</strong> (ستُضاف إلى الملاحظات العامة، عدّلها أو احذفها):<textarea class="form-control form-control-sm mt-1" rows="2" data-pk="notes.general">${escapeHtml(extraVal)}</textarea></div>` : ''}
      ${missing.length ? `<div class="small text-muted mt-2"><i class="bi bi-dash-circle ms-1"></i>لم يُعثر عليها في النص (تبقى فارغة): ${missing.map(k => escapeHtml(spec(k)?.l || k)).join('، ')}</div>` : ''}
      <button type="button" class="btn btn-gold mt-3" id="pd_apply">اعتماد البيانات ومراجعة العقار</button>`;
    $('pd_clear').hidden = false;
    $('pd_apply').onclick = () => {
      const values = {}, offer = {};
      box.querySelectorAll('[data-pk]').forEach(e => { const k = e.dataset.pk; if (e.value === '' ) return; if (k.startsWith('offer.')) offer[k.slice(6)] = e.value; else values[k] = e.value; });
      onApply({ values, offer, sourceText: last?.text || '' });
    };
  }
  return { clear };
}
