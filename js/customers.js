import { guard, toast } from './layout.js';
import { escapeHtml, fmtDateTime } from './utils.js';
import {
  CUSTOMER_TYPES, CUSTOMER_STATUSES, CUSTOMER_SOURCES, CONTACT_TYPES,
  getCustomersPage, matchCustomerSearch
} from './services/customers.js';

await guard({ base: '../', active: 'pages/customers.html' });

const $ = id => document.getElementById(id);
const PAGE_SIZE = 20;

let allCustomers = [];
let lastDoc = null;
let hasMore = false;
let viewMode = localStorage.getItem('customers_view_mode') === 'table' ? 'table' : 'cards';
let loading = false;

// تعبئة قوائم الفلترة
$('typeFilter').innerHTML = '<option value="">كل التصنيفات</option>' +
  Object.entries(CUSTOMER_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('statusFilter').innerHTML = '<option value="">كل الحالات</option>' +
  Object.entries(CUSTOMER_STATUSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

function updateViewButtons() {
  $('viewCards').classList.toggle('active', viewMode === 'cards');
  $('viewTable').classList.toggle('active', viewMode === 'table');
}
updateViewButtons();

const statusBadgeClass = st => ({
  active: 'bg-success',
  interested: 'bg-primary',
  follow_up: 'bg-warning text-dark',
  closed: 'bg-dark',
  inactive: 'bg-secondary'
}[st] || 'bg-secondary');

const waLink = phone => {
  const p = String(phone || '').replace(/\D/g, '');
  if (!p) return '#';
  return `https://wa.me/${p.startsWith('0') ? '2' + p : p}`;
};

function renderCard(c) {
  const initial = escapeHtml((c.name || 'ع').trim().charAt(0));
  const phone = escapeHtml(c.phone || c.phoneNormalized || '');
  const wa = waLink(c.whatsapp || c.phone);
  return `
  <div class="col-12 col-md-6 col-xl-4">
    <div class="ccard d-flex flex-column justify-content-between">
      <div>
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div class="d-flex align-items-center gap-2">
            <div class="avatar-circle">${initial}</div>
            <div>
              <a href="customer-details.html?id=${c.id}" class="fw-bold text-decoration-none text-dark d-block">${escapeHtml(c.name || '')}</a>
              <small class="text-muted">${escapeHtml(c.code || '')} ${c.customerType ? '· ' + (CUSTOMER_TYPES[c.customerType] || '') : ''}</small>
            </div>
          </div>
          <span class="badge ${statusBadgeClass(c.status)}">${CUSTOMER_STATUSES[c.status] || 'نشط'}</span>
        </div>

        <div class="mb-2 small">
          <div class="d-flex align-items-center gap-2 mb-1">
            <i class="bi bi-telephone text-muted"></i>
            <a href="tel:${phone}" class="text-decoration-none fw-semibold text-dark" dir="ltr">${phone}</a>
            ${c.phone2 ? `<span class="text-muted">· ${escapeHtml(c.phone2)}</span>` : ''}
          </div>
          ${c.city ? `<div class="text-muted"><i class="bi bi-geo-alt ms-1"></i>${escapeHtml(c.city)}</div>` : ''}
          ${c.source ? `<div class="text-muted"><i class="bi bi-megaphone ms-1"></i>المصدر: ${escapeHtml(CUSTOMER_SOURCES[c.source] || c.source)}</div>` : ''}
          ${c.lastContactAt ? `<div class="text-muted"><i class="bi bi-clock-history ms-1"></i>آخر تواصل: ${fmtDateTime(c.lastContactAt)}${c.lastContactType ? ' (' + (CONTACT_TYPES[c.lastContactType] || '') + ')' : ''}</div>` : ''}
        </div>

        ${c.notes ? `<p class="small text-muted bg-light p-2 rounded mb-3 text-truncate" title="${escapeHtml(c.notes)}">${escapeHtml(c.notes)}</p>` : '<div class="mb-3"></div>'}
      </div>

      <div class="d-flex flex-wrap gap-2 pt-2 border-top">
        <a class="btn btn-sm btn-navy" href="customer-details.html?id=${c.id}"><i class="bi bi-person-lines-fill ms-1"></i>التفاصيل</a>
        <a class="btn btn-sm btn-outline-secondary" href="customer-form.html?id=${c.id}"><i class="bi bi-pencil ms-1"></i>تعديل</a>
        <a class="btn btn-sm btn-outline-success" href="${wa}" target="_blank" rel="noopener" title="مراسلة واتساب"><i class="bi bi-whatsapp"></i></a>
        <a class="btn btn-sm btn-outline-primary" href="customer-details.html?id=${c.id}#requests" title="الطلبات العقارية"><i class="bi bi-card-checklist ms-1"></i>الطلبات</a>
      </div>
    </div>
  </div>`;
}

function renderTable(items) {
  return `
  <div class="table-panel table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead>
        <tr>
          <th>الكود</th>
          <th>الاسم</th>
          <th>رقم الهاتف</th>
          <th>التصنيف</th>
          <th>الحالة</th>
          <th>المدينة / المصدر</th>
          <th>آخر تواصل</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(c => {
          const phone = escapeHtml(c.phone || c.phoneNormalized || '');
          const wa = waLink(c.whatsapp || c.phone);
          return `
          <tr>
            <td class="small text-muted fw-semibold">${escapeHtml(c.code || '—')}</td>
            <td>
              <a href="customer-details.html?id=${c.id}" class="fw-bold text-dark text-decoration-none">${escapeHtml(c.name || '')}</a>
              ${c.notes ? `<div class="small text-muted text-truncate" style="max-width:220px">${escapeHtml(c.notes)}</div>` : ''}
            </td>
            <td>
              <a href="tel:${phone}" class="text-decoration-none fw-semibold text-dark" dir="ltr">${phone}</a>
            </td>
            <td>${CUSTOMER_TYPES[c.customerType] || '—'}</td>
            <td><span class="badge ${statusBadgeClass(c.status)}">${CUSTOMER_STATUSES[c.status] || 'نشط'}</span></td>
            <td class="small text-muted">${escapeHtml([c.city, CUSTOMER_SOURCES[c.source]].filter(Boolean).join(' · ') || '—')}</td>
            <td class="small text-muted">${c.lastContactAt ? fmtDateTime(c.lastContactAt) : 'لا يوجد'}</td>
            <td>
              <div class="d-flex flex-wrap gap-1">
                <a class="btn btn-sm btn-navy" href="customer-details.html?id=${c.id}">التفاصيل</a>
                <a class="btn btn-sm btn-outline-secondary" href="customer-form.html?id=${c.id}">تعديل</a>
                <a class="btn btn-sm btn-outline-success" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i></a>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function render() {
  const q = $('searchInput').value;
  const tf = $('typeFilter').value;
  const sf = $('statusFilter').value;
  const filtered = allCustomers.filter(c => matchCustomerSearch(c, q, tf, sf));

  if (!allCustomers.length) {
    $('count').textContent = '';
    $('list').innerHTML = `
      <div class="empty panel">
        <i class="bi bi-people"></i>
        <p>لا يوجد عملاء مسجلون حتى الآن.</p>
        <a class="btn btn-navy" href="customer-form.html"><i class="bi bi-person-plus ms-1"></i>إضافة أول عميل</a>
      </div>`;
    $('more').hidden = true;
    return;
  }

  $('count').textContent = (q || tf || sf)
    ? `نتائج البحث: ${filtered.length} من أصل ${allCustomers.length} عميل محمّل${hasMore ? ' (حمّل المزيد للبحث في بقية السجلات)' : ''}`
    : `تم تحميل ${allCustomers.length} عميل${hasMore ? ' (يوجد المزيد)' : ''}`;

  if (!filtered.length) {
    $('list').innerHTML = `
      <div class="empty panel">
        <i class="bi bi-search"></i>
        <p>لا توجد نتائج مطابقة لبحثك في العملاء المحمّلين.</p>
      </div>`;
  } else if (viewMode === 'table') {
    $('list').innerHTML = renderTable(filtered);
  } else {
    $('list').innerHTML = `<div class="row g-3">${filtered.map(renderCard).join('')}</div>`;
  }

  $('more').hidden = !hasMore;
}

async function fetchBatch(isFirst = false) {
  if (loading) return;
  loading = true;
  $('more').disabled = true;
  $('errorBox').hidden = true;

  try {
    const page = await getCustomersPage(PAGE_SIZE, isFirst ? null : lastDoc);
    if (isFirst) {
      allCustomers = page.items;
    } else {
      const existingIds = new Set(allCustomers.map(x => x.id));
      page.items.forEach(item => {
        if (!existingIds.has(item.id)) allCustomers.push(item);
      });
    }
    lastDoc = page.lastDoc;
    hasMore = page.hasMore;
    render();
  } catch (err) {
    console.error(err);
    $('errorBox').textContent = 'تعذّر تحميل بيانات العملاء. تحقق من الاتصال بالإنترنت وصلاحيات الحساب.';
    $('errorBox').hidden = false;
    toast('تعذّر تحميل قائمة العملاء.', 'danger');
  } finally {
    loading = false;
    $('more').disabled = false;
  }
}

$('searchInput').addEventListener('input', render);
$('typeFilter').addEventListener('change', render);
$('statusFilter').addEventListener('change', render);
$('resetFilter').addEventListener('click', () => {
  $('searchInput').value = '';
  $('typeFilter').value = '';
  $('statusFilter').value = '';
  render();
});

$('viewCards').addEventListener('click', () => {
  viewMode = 'cards';
  localStorage.setItem('customers_view_mode', 'cards');
  updateViewButtons();
  render();
});

$('viewTable').addEventListener('click', () => {
  viewMode = 'table';
  localStorage.setItem('customers_view_mode', 'table');
  updateViewButtons();
  render();
});

$('more').addEventListener('click', () => fetchBatch(false));

await fetchBatch(true);
