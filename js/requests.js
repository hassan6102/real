import { guard, toast } from './layout.js';
import { escapeHtml, fmtNumber, fmtDateTime, normalizeAr, toLatinDigits, PROPERTY_TYPES, TRANSACTION_TYPES } from './utils.js';
import { REQUEST_STATUSES, PAYMENT_METHODS, getAllRequestsPage, updateRequestStatus } from './services/customers.js';

const user = await guard({ base: '../', active: 'pages/requests.html' });
const $ = id => document.getElementById(id);

$('txFilter').innerHTML = '<option value="">كل العمليات</option>' +
  Object.entries(TRANSACTION_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('typeFilter').innerHTML = '<option value="">كل العقارات</option>' +
  Object.entries(PROPERTY_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('statusFilter').innerHTML = '<option value="">كل الحالات</option>' +
  Object.entries(REQUEST_STATUSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

let allReqs = [];
let lastDoc = null;
let hasMore = false;

const formatRange = (min, max, unit) => {
  if (min != null && max != null) return `${fmtNumber(min)} - ${fmtNumber(max)} ${unit}`;
  if (min != null) return `من ${fmtNumber(min)} ${unit}`;
  if (max != null) return `حتى ${fmtNumber(max)} ${unit}`;
  return 'غير محدد';
};

function matches(r) {
  const tx = $('txFilter').value;
  const tp = $('typeFilter').value;
  const st = $('statusFilter').value;
  const q = $('qInput').value.trim();

  if (tx && r.transactionType !== tx) return false;
  if (tp && r.propertyType !== tp) return false;
  if (st && r.status !== st) return false;
  if (!q) return true;

  const qAr = normalizeAr(q);
  const qDigits = toLatinDigits(q).replace(/\D/g, '');
  const text = normalizeAr([r.code, r.customerName, r.city, r.districts, r.notes].filter(Boolean).join(' '));
  if (text.includes(qAr)) return true;
  if (qDigits && String(r.customerPhone || '').includes(qDigits)) return true;
  return false;
}

function render() {
  const filtered = allReqs.filter(matches);
  $('count').textContent = allReqs.length ? `عرض ${filtered.length} من أصل ${allReqs.length} طلب` : '';
  if (!filtered.length) {
    $('list').innerHTML = `<div class="empty panel"><i class="bi bi-card-checklist"></i><p>لا توجد طلبات مطابقة.</p></div>`;
  } else {
    $('list').innerHTML = `<div class="row g-3">${filtered.map(r => `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="req-card h-100 d-flex flex-column justify-content-between">
          <div>
            <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
              <div>
                <strong>${escapeHtml(r.code || '')} · ${PROPERTY_TYPES[r.propertyType] || ''} (${TRANSACTION_TYPES[r.transactionType] || ''})</strong>
                <div class="small text-muted">العميل: <a href="customer-details.html?id=${r.customerId}#requests" class="fw-semibold text-decoration-none">${escapeHtml(r.customerName || '—')}</a> (${escapeHtml(r.customerPhone || '')})</div>
              </div>
              <select class="form-select form-select-sm" style="width:auto" data-status-id="${r.id}">
                ${Object.entries(REQUEST_STATUSES).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div class="small mb-2">
              <div><span class="text-muted">الموقع:</span> <strong>${escapeHtml([r.city, r.districts].filter(Boolean).join(' - ') || 'غير محدد')}</strong></div>
              <div><span class="text-muted">الميزانية:</span> <strong>${formatRange(r.budgetMin, r.budgetMax, 'جنيه')}</strong></div>
              <div><span class="text-muted">المساحة:</span> <strong>${formatRange(r.areaMin, r.areaMax, 'م²')}</strong></div>
              <div><span class="text-muted">الدفع:</span> ${PAYMENT_METHODS[r.paymentMethod] || 'كاش'} ${r.roomsMin != null ? `· ${r.roomsMin}+ غرف` : ''}</div>
            </div>
            ${r.notes ? `<div class="small text-muted bg-light p-2 rounded mb-2">${escapeHtml(r.notes)}</div>` : ''}
          </div>
          <div class="d-flex justify-content-between align-items-center pt-2 border-top small text-muted">
            <span>${fmtDateTime(r.createdAt)}</span>
            <a class="btn btn-sm btn-navy" href="customer-details.html?id=${r.customerId}#requests">ملف العميل والطلب</a>
          </div>
        </div>
      </div>
    `).join('')}</div>`;
  }
  $('more').hidden = !hasMore;
}

async function load(first = false) {
  try {
    const page = await getAllRequestsPage(25, first ? null : lastDoc);
    allReqs = first ? page.items : [...allReqs, ...page.items];
    lastDoc = page.lastDoc;
    hasMore = page.hasMore;
    render();
  } catch (err) {
    console.error(err);
    toast('تعذّر تحميل الطلبات.', 'danger');
  }
}

$('qInput').addEventListener('input', render);
$('txFilter').addEventListener('change', render);
$('typeFilter').addEventListener('change', render);
$('statusFilter').addEventListener('change', render);
$('resetBtn').addEventListener('click', () => {
  $('qInput').value = '';
  $('txFilter').value = '';
  $('typeFilter').value = '';
  $('statusFilter').value = '';
  render();
});
$('more').addEventListener('click', () => load(false));

$('list').addEventListener('change', async e => {
  const sel = e.target.closest('[data-status-id]');
  if (!sel) return;
  const req = allReqs.find(x => x.id === sel.dataset.statusId);
  if (!req) return;
  sel.disabled = true;
  try {
    await updateRequestStatus(user, req, sel.value);
    req.status = sel.value;
    toast('تم تحديث حالة الطلب.', 'success');
  } catch (err) {
    console.error(err);
    sel.value = req.status;
    toast('تعذّر تحديث الحالة.', 'danger');
  } finally {
    sel.disabled = false;
  }
});

await load(true);
