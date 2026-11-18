import { guard, toast } from './layout.js';
import {
  escapeHtml, fmtNumber, fmtDateTime,
  PROPERTY_TYPES, TRANSACTION_TYPES, ACTIVE_REQUEST_STATUSES
} from './utils.js';
import { FINISHING } from './property-model.js';
import {
  CUSTOMER_TYPES, CUSTOMER_STATUSES, CUSTOMER_SOURCES,
  CONTACT_TYPES, CONTACT_OUTCOMES, REQUEST_STATUSES,
  PAYMENT_METHODS, PRIORITIES, FLOOR_PREFS,
  getCustomer, deleteCustomer,
  addCustomerContact, getCustomerContacts, deleteCustomerContact,
  createCustomerRequest, getCustomerRequests, updateRequestStatus, deleteCustomerRequest,
  addRequestFollowUp, getRequestFollowUps, validateRequestInput
} from './services/customers.js';

const user = await guard({ base: '../', active: 'pages/customers.html' });
const $ = id => document.getElementById(id);
const customerId = new URLSearchParams(location.search).get('id');
const isAdmin = user.role === 'admin';

let customer = null;
let contacts = [];
let requests = [];
const followUpsByReq = {};

// تهيئة حقول نموذج التواصل
$('c_type').innerHTML = Object.entries(CONTACT_TYPES)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('c_outcome').innerHTML = Object.entries(CONTACT_OUTCOMES)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('c_date').value = new Date().toISOString().slice(0, 10);

// تهيئة حقول نافذة الطلب العقاري
$('r_tx').innerHTML = '<option value="">— اختر العملية —</option>' +
  Object.entries(TRANSACTION_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('r_type').innerHTML = '<option value="">— اختر نوع العقار —</option>' +
  Object.entries(PROPERTY_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('r_status').innerHTML = Object.entries(REQUEST_STATUSES)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('r_floorPref').innerHTML = Object.entries(FLOOR_PREFS)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('r_finishing').innerHTML = '<option value="">— أي تشطيب —</option>' +
  Object.entries(FINISHING).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('r_payment').innerHTML = Object.entries(PAYMENT_METHODS)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('r_priority').innerHTML = Object.entries(PRIORITIES)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

const reqModal = new bootstrap.Modal('#requestModal');

const statusBadgeClass = st => ({
  active: 'bg-success',
  interested: 'bg-primary',
  follow_up: 'bg-warning text-dark',
  closed: 'bg-dark',
  inactive: 'bg-secondary'
}[st] || 'bg-secondary');

const reqStatusBadgeClass = st => {
  if (st === 'completed') return 'bg-success';
  if (st === 'cancelled') return 'bg-danger';
  if (st === 'postponed') return 'bg-secondary';
  if (st === 'negotiating' || st === 'viewed') return 'bg-warning text-dark';
  return 'bg-primary';
};

const outcomeBadgeClass = out => ({
  interested: 'bg-success',
  viewing_scheduled: 'bg-primary',
  offer_sent: 'bg-info text-dark',
  follow_up: 'bg-warning text-dark',
  no_answer: 'bg-secondary',
  busy: 'bg-secondary',
  not_interested: 'bg-danger'
}[out] || 'bg-dark');

const contactIcon = t => ({
  call: 'telephone-outbound',
  whatsapp: 'whatsapp',
  visit: 'building',
  viewing: 'eye',
  other: 'chat-dots'
}[t] || 'chat-dots');

const waLink = phone => {
  const p = String(phone || '').replace(/\D/g, '');
  if (!p) return '#';
  return `https://wa.me/${p.startsWith('0') ? '2' + p : p}`;
};

function renderBasicInfo() {
  if (!customer) return;
  const phone = customer.phone || customer.phoneNormalized || '';
  $('custTitle').textContent = `${customer.name || ''}${customer.code ? ' (' + customer.code + ')' : ''}`;
  $('custBadges').innerHTML = `
    <span class="badge ${statusBadgeClass(customer.status)}">${CUSTOMER_STATUSES[customer.status] || 'نشط'}</span>
    <span class="badge bg-light text-dark border">${CUSTOMER_TYPES[customer.customerType] || 'مشتري'}</span>
  `;
  $('custMeta').textContent = `أضافه ${customer.createdByName || '—'} في ${fmtDateTime(customer.createdAt) || '—'}` +
    (customer.updatedAt ? ` · آخر تحديث بواسطة ${customer.updatedByName || '—'} في ${fmtDateTime(customer.updatedAt)}` : '') +
    (customer.lastContactAt ? ` · آخر تواصل في ${fmtDateTime(customer.lastContactAt)}` : '');

  $('editBtn').href = `customer-form.html?id=${encodeURIComponent(customer.id)}`;
  $('callBtn').href = `tel:${phone}`;
  $('waBtn').href = waLink(customer.whatsapp || phone);
  $('deleteCustBtn').hidden = !isAdmin;

  const activeReqs = requests.filter(r => ACTIVE_REQUEST_STATUSES.includes(r.status)).length;

  const rows = [
    ['اسم العميل', escapeHtml(customer.name || '—')],
    ['كود العميل', escapeHtml(customer.code || '—')],
    ['رقم الهاتف الأساسي', `<a href="tel:${escapeHtml(phone)}" class="text-decoration-none fw-bold text-dark" dir="ltr">${escapeHtml(phone)}</a>`],
    ['رقم الهاتف الإضافي', customer.phone2 ? `<a href="tel:${escapeHtml(customer.phone2)}" class="text-decoration-none" dir="ltr">${escapeHtml(customer.phone2)}</a>` : '—'],
    ['رقم الواتساب', customer.whatsapp ? `<a href="${waLink(customer.whatsapp)}" target="_blank" rel="noopener" class="text-decoration-none text-success" dir="ltr"><i class="bi bi-whatsapp ms-1"></i>${escapeHtml(customer.whatsapp)}</a>` : '—'],
    ['تصنيف العميل', CUSTOMER_TYPES[customer.customerType] || '—'],
    ['حالة العميل', CUSTOMER_STATUSES[customer.status] || '—'],
    ['مصدر العميل', CUSTOMER_SOURCES[customer.source] || '—'],
    ['المدينة / المنطقة', escapeHtml(customer.city || '—')],
    ['إجمالي مرات التواصل', `${contacts.length} تواصل`],
    ['الطلبات العقارية', `${requests.length} طلب (${activeReqs} نشط)`],
    ['آخر تواصل مسجل', customer.lastContactAt ? `${fmtDateTime(customer.lastContactAt)} (${CONTACT_TYPES[customer.lastContactType] || ''})` : 'لا يوجد بعد']
  ];

  $('basicInfoBody').innerHTML = `
    <div class="row g-3">
      ${rows.map(([label, val]) => `
        <div class="col-12 col-md-6 col-lg-4 kv">
          <small>${label}</small>
          <div>${val}</div>
        </div>
      `).join('')}
      <div class="col-12 kv pt-2 border-top">
        <small>ملاحظات عامة عن العميل</small>
        <div class="fw-normal mt-1 p-2 bg-light rounded">${customer.notes ? escapeHtml(customer.notes).replace(/\n/g, '<br>') : '<span class="text-muted">لا توجد ملاحظات مسجلة.</span>'}</div>
      </div>
    </div>
  `;
}

function renderContacts() {
  $('contactsCountBadge').textContent = contacts.length;
  if (!contacts.length) {
    $('contactsList').innerHTML = `
      <div class="empty">
        <i class="bi bi-telephone-x"></i>
        <p>لا يوجد سجل تواصل مع هذا العميل بعد. سجّل أول تواصل من النموذج الجانبي.</p>
      </div>`;
    return;
  }

  $('contactsList').innerHTML = `
    <div class="ps-2">
      ${contacts.map(c => `
        <div class="timeline-item">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-1">
            <div>
              <span class="fw-bold text-dark"><i class="bi bi-${contactIcon(c.type)} ms-1"></i>${CONTACT_TYPES[c.type] || 'تواصل'}</span>
              <span class="badge ${outcomeBadgeClass(c.outcome)} me-1">${CONTACT_OUTCOMES[c.outcome] || ''}</span>
            </div>
            <div class="d-flex align-items-center gap-2">
              <small class="text-muted">${escapeHtml(c.contactDate || '')} · ${fmtDateTime(c.createdAt)}</small>
              ${isAdmin ? `<button type="button" class="btn btn-sm btn-link text-danger p-0" data-del-contact="${c.id}" title="حذف"><i class="bi bi-trash"></i></button>` : ''}
            </div>
          </div>
          <div class="bg-light p-2 rounded small mb-1">${escapeHtml(c.notes || '').replace(/\n/g, '<br>')}</div>
          <div class="d-flex justify-content-between align-items-center flex-wrap small text-muted">
            <span>بواسطة: <strong>${escapeHtml(c.createdByName || 'عضو')}</strong></span>
            ${c.nextFollowUpDate ? `<span class="text-warning-emphasis fw-semibold"><i class="bi bi-calendar-event ms-1"></i>متابعة قادمة: ${escapeHtml(c.nextFollowUpDate)}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function formatRange(min, max, unit) {
  if (min != null && max != null) return `${fmtNumber(min)} - ${fmtNumber(max)} ${unit}`;
  if (min != null) return `من ${fmtNumber(min)} ${unit}`;
  if (max != null) return `حتى ${fmtNumber(max)} ${unit}`;
  return 'غير محدد';
}

function renderFollowUpsList(reqId) {
  const list = followUpsByReq[reqId] || [];
  if (!list.length) return '<div class="small text-muted mb-2">لا توجد متابعات مسجلة على هذا الطلب بعد.</div>';
  return `
    <ul class="list-group list-group-flush mb-2 small">
      ${list.map(f => `
        <li class="list-group-item px-0 py-2 bg-transparent">
          <div class="d-flex justify-content-between text-muted">
            <span><strong>${escapeHtml(f.createdByName || 'عضو')}</strong> ${f.status ? `<span class="badge bg-secondary ms-1">${REQUEST_STATUSES[f.status] || ''}</span>` : ''}</span>
            <span>${fmtDateTime(f.createdAt)}</span>
          </div>
          <div class="mt-1">${escapeHtml(f.note || '')}</div>
          ${f.nextActionDate ? `<div class="text-warning-emphasis mt-1"><i class="bi bi-calendar-check ms-1"></i>الموعد القادم: ${escapeHtml(f.nextActionDate)}</div>` : ''}
        </li>
      `).join('')}
    </ul>`;
}

function renderRequests() {
  $('requestsCountBadge').textContent = requests.length;
  if (!requests.length) {
    $('requestsList').innerHTML = `
      <div class="empty panel">
        <i class="bi bi-card-checklist"></i>
        <p>لا توجد طلبات عقارية مسجلة لهذا العميل بعد.</p>
        <button type="button" class="btn btn-navy" onclick="document.getElementById('openReqModalBtn').click()">
          <i class="bi bi-plus-lg ms-1"></i>إضافة أول طلب عقاري
        </button>
      </div>`;
    return;
  }

  $('requestsList').innerHTML = `
    <div class="row g-3">
      ${requests.map(r => {
        const prioBadge = r.priority === 'high'
          ? '<span class="badge bg-danger">عاجل</span>'
          : r.priority === 'low'
            ? '<span class="badge bg-secondary">غير مستعجل</span>'
            : '';

        return `
        <div class="col-12 col-xl-6">
          <div class="req-card">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 pb-2 mb-2 border-bottom">
              <div>
                <div class="d-flex align-items-center gap-2">
                  <span class="fw-bold text-dark fs-6">${escapeHtml(r.code || 'طلب')} · ${PROPERTY_TYPES[r.propertyType] || 'عقار'} (${TRANSACTION_TYPES[r.transactionType] || ''})</span>
                  ${prioBadge}
                </div>
                <small class="text-muted">أضيف في ${fmtDateTime(r.createdAt)} بواسطة ${escapeHtml(r.createdByName || '—')}</small>
              </div>
              <div class="d-flex align-items-center gap-2">
                <select class="form-select form-select-sm" data-req-status="${r.id}" aria-label="تغيير حالة الطلب" style="width:auto">
                  ${Object.entries(REQUEST_STATUSES).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <span class="badge ${reqStatusBadgeClass(r.status)}">${REQUEST_STATUSES[r.status] || r.status}</span>
                ${isAdmin ? `<button type="button" class="btn btn-sm btn-outline-danger" data-del-req="${r.id}" title="حذف الطلب"><i class="bi bi-trash"></i></button>` : ''}
              </div>
            </div>

            <div class="row g-2 small mb-2">
              <div class="col-6 col-sm-4">
                <span class="text-muted d-block">الموقع المطلوب:</span>
                <strong>${escapeHtml([r.city, r.districts].filter(Boolean).join(' - ') || 'غير محدد')}</strong>
              </div>
              <div class="col-6 col-sm-4">
                <span class="text-muted d-block">الميزانية:</span>
                <strong>${formatRange(r.budgetMin, r.budgetMax, 'جنيه')}</strong>
              </div>
              <div class="col-6 col-sm-4">
                <span class="text-muted d-block">المساحة:</span>
                <strong>${formatRange(r.areaMin, r.areaMax, 'م²')}</strong>
              </div>
              <div class="col-6 col-sm-4">
                <span class="text-muted d-block">الغرف / الحمامات:</span>
                <strong>${r.roomsMin != null ? `${r.roomsMin}+ غرف` : '—'} / ${r.bathroomsMin != null ? `${r.bathroomsMin}+ حمام` : '—'}</strong>
              </div>
              <div class="col-6 col-sm-4">
                <span class="text-muted d-block">الدور / التشطيب:</span>
                <strong>${FLOOR_PREFS[r.floorPref] || 'أي دور'} · ${FINISHING[r.finishing] || 'أي تشطيب'}</strong>
              </div>
              <div class="col-6 col-sm-4">
                <span class="text-muted d-block">طريقة الدفع:</span>
                <strong>${PAYMENT_METHODS[r.paymentMethod] || 'كاش'}</strong>
              </div>
            </div>

            ${r.notes ? `<div class="small bg-light p-2 rounded mb-2"><strong>ملاحظات:</strong> ${escapeHtml(r.notes)}</div>` : ''}

            <div class="d-flex justify-content-between align-items-center pt-2 border-top">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-toggle-followups="${r.id}">
                <i class="bi bi-chat-left-text ms-1"></i>متابعات الطلب
              </button>
              <a class="btn btn-sm btn-outline-primary" href="search.html"><i class="bi bi-funnel ms-1"></i>بحث عن عقار مطابق</a>
            </div>

            <!-- قسم متابعات الطلب (customerRequests/{id}/followUps) -->
            <div class="mt-3 pt-2 border-top bg-light p-2 rounded" id="followups_box_${r.id}" hidden>
              <h4 class="fs-6 fw-bold mb-2">متابعات الطلب (${escapeHtml(r.code || '')})</h4>
              <div id="followups_list_${r.id}">${renderFollowUpsList(r.id)}</div>
              <form class="row g-2 align-items-end" data-followup-form="${r.id}">
                <div class="col-12 col-sm-6">
                  <input type="text" class="form-control form-control-sm" name="note" placeholder="اكتب ملاحظة متابعة جديدة..." required>
                </div>
                <div class="col-6 col-sm-3">
                  <select class="form-select form-select-sm" name="status">
                    <option value="">— بقاء الحالة —</option>
                    ${Object.entries(REQUEST_STATUSES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                  </select>
                </div>
                <div class="col-6 col-sm-3">
                  <button type="submit" class="btn btn-sm btn-navy w-100">إضافة متابعة</button>
                </div>
              </form>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

async function loadAllData() {
  if (!customerId) {
    $('errorAlert').textContent = 'لم يتم تحديد معرّف العميل في الرابط.';
    $('errorAlert').hidden = false;
    return;
  }

  try {
    const [cData, cContacts, cRequests] = await Promise.all([
      getCustomer(customerId),
      getCustomerContacts(customerId).catch(() => []),
      getCustomerRequests(customerId).catch(() => [])
    ]);

    if (!cData) {
      $('errorAlert').textContent = 'العميل غير موجود أو تم حذفه.';
      $('errorAlert').hidden = false;
      $('actionBar').hidden = true;
      return;
    }

    customer = cData;
    contacts = cContacts;
    requests = cRequests;

    renderBasicInfo();
    renderContacts();
    renderRequests();
  } catch (err) {
    console.error(err);
    $('errorAlert').textContent = 'حدث خطأ أثناء تحميل بيانات العميل.';
    $('errorAlert').hidden = false;
    toast('تعذّر تحميل بيانات العميل.', 'danger');
  }
}

// نسخ رقم الهاتف
$('copyPhoneBtn').addEventListener('click', async () => {
  if (!customer) return;
  try {
    await navigator.clipboard.writeText(customer.phone || customer.phoneNormalized || '');
    toast('تم نسخ رقم الهاتف.', 'success');
  } catch {
    toast('تعذّر نسخ الرقم.', 'danger');
  }
});

// حذف العميل (للمدير فقط)
$('deleteCustBtn').addEventListener('click', async () => {
  if (!customer) return;
  if (!confirm(`هل أنت متأكد من حذف العميل "${customer.name}" نهائيًا؟ سيتم تحرير رقم الهاتف الخاص به.`)) return;
  try {
    await deleteCustomer(customer);
    toast('تم حذف العميل بنجاح.', 'success');
    location.href = 'customers.html';
  } catch (err) {
    console.error(err);
    toast('تعذّر حذف العميل.', 'danger');
  }
});

// حفظ تواصل جديد
$('contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('saveContactBtn');
  if (btn.disabled || !customer) return;

  const notesEl = $('c_notes');
  notesEl.classList.remove('is-invalid');
  if (!notesEl.value.trim()) {
    notesEl.classList.add('is-invalid');
    return;
  }

  btn.disabled = true;
  try {
    await addCustomerContact(user, customer.id, {
      type: $('c_type').value,
      contactDate: $('c_date').value,
      outcome: $('c_outcome').value,
      nextFollowUpDate: $('c_nextDate').value,
      notes: notesEl.value
    });

    notesEl.value = '';
    $('c_nextDate').value = '';
    toast('تم تسجيل التواصل بنجاح.', 'success');

    // تحديث البيانات والسجل
    const [freshCustomer, freshContacts] = await Promise.all([
      getCustomer(customer.id),
      getCustomerContacts(customer.id)
    ]);
    if (freshCustomer) customer = freshCustomer;
    contacts = freshContacts;
    renderBasicInfo();
    renderContacts();
  } catch (err) {
    console.error(err);
    toast(err.message || 'تعذّر حفظ سجل التواصل.', 'danger');
  } finally {
    btn.disabled = false;
  }
});

// حذف سجل تواصل
$('contactsList').addEventListener('click', async e => {
  const delBtn = e.target.closest('[data-del-contact]');
  if (!delBtn || !customer) return;
  if (!confirm('حذف سجل التواصل هذا؟')) return;
  try {
    await deleteCustomerContact(customer.id, delBtn.dataset.delContact);
    contacts = await getCustomerContacts(customer.id);
    renderContacts();
    renderBasicInfo();
    toast('تم حذف سجل التواصل.', 'success');
  } catch (err) {
    console.error(err);
    toast('تعذّر حذف سجل التواصل.', 'danger');
  }
});

// فتح نافذة إضافة طلب عقاري
$('openReqModalBtn').addEventListener('click', () => {
  $('requestForm').reset();
  document.querySelectorAll('#requestForm .is-invalid').forEach(el => el.classList.remove('is-invalid'));
  if (customer?.city) $('r_city').value = customer.city;
  reqModal.show();
});

// حفظ طلب عقاري جديد
$('saveReqBtn').addEventListener('click', async () => {
  const btn = $('saveReqBtn');
  if (btn.disabled || !customer) return;

  document.querySelectorAll('#requestForm .is-invalid').forEach(el => el.classList.remove('is-invalid'));

  const raw = {
    transactionType: $('r_tx').value,
    propertyType: $('r_type').value,
    status: $('r_status').value,
    city: $('r_city').value,
    districts: $('r_districts').value,
    budgetMin: $('r_budgetMin').value,
    budgetMax: $('r_budgetMax').value,
    areaMin: $('r_areaMin').value,
    areaMax: $('r_areaMax').value,
    roomsMin: $('r_roomsMin').value,
    bathroomsMin: $('r_bathroomsMin').value,
    floorPref: $('r_floorPref').value,
    finishing: $('r_finishing').value,
    paymentMethod: $('r_payment').value,
    priority: $('r_priority').value,
    notes: $('r_notes').value
  };

  const { errors } = validateRequestInput(raw);
  if (Object.keys(errors).length) {
    if (errors.transactionType) $('r_tx').classList.add('is-invalid');
    if (errors.propertyType) $('r_type').classList.add('is-invalid');
    for (const k of ['budgetMin', 'budgetMax', 'areaMin', 'areaMax']) {
      if (errors[k]) {
        $('r_' + k).classList.add('is-invalid');
        $('err_' + k).textContent = errors[k];
      }
    }
    toast(Object.values(errors)[0], 'danger');
    return;
  }

  btn.disabled = true;
  try {
    await createCustomerRequest(user, customer, raw);
    reqModal.hide();
    toast('تمت إضافة الطلب العقاري بنجاح.', 'success');
    requests = await getCustomerRequests(customer.id);
    renderRequests();
    renderBasicInfo();
  } catch (err) {
    console.error(err);
    toast(err.message || 'تعذّر حفظ الطلب العقاري.', 'danger');
  } finally {
    btn.disabled = false;
  }
});

// أحداث بطاقات الطلبات (تغيير الحالة، حذف الطلب، عرض/إضافة متابعات الطلب)
$('requestsList').addEventListener('change', async e => {
  const sel = e.target.closest('[data-req-status]');
  if (!sel) return;
  const reqId = sel.dataset.reqStatus;
  const req = requests.find(r => r.id === reqId);
  if (!req) return;

  sel.disabled = true;
  try {
    await updateRequestStatus(user, req, sel.value);
    req.status = sel.value;
    renderRequests();
    renderBasicInfo();
    toast('تم تحديث حالة الطلب.', 'success');
  } catch (err) {
    console.error(err);
    toast('تعذّر تحديث حالة الطلب.', 'danger');
    sel.value = req.status;
  } finally {
    sel.disabled = false;
  }
});

$('requestsList').addEventListener('click', async e => {
  const delBtn = e.target.closest('[data-del-req]');
  if (delBtn) {
    if (!confirm('هل تريد حذف هذا الطلب العقاري نهائيًا؟')) return;
    try {
      await deleteCustomerRequest(delBtn.dataset.delReq);
      requests = await getCustomerRequests(customer.id);
      renderRequests();
      renderBasicInfo();
      toast('تم حذف الطلب العقاري.', 'success');
    } catch (err) {
      console.error(err);
      toast('تعذّر حذف الطلب.', 'danger');
    }
    return;
  }

  const toggleBtn = e.target.closest('[data-toggle-followups]');
  if (toggleBtn) {
    const reqId = toggleBtn.dataset.toggleFollowups;
    const box = $('followups_box_' + reqId);
    if (!box) return;
    box.hidden = !box.hidden;
    if (!box.hidden) {
      try {
        followUpsByReq[reqId] = await getRequestFollowUps(reqId);
        $('followups_list_' + reqId).innerHTML = renderFollowUpsList(reqId);
      } catch (err) {
        console.error(err);
      }
    }
  }
});

$('requestsList').addEventListener('submit', async e => {
  const form = e.target.closest('[data-followup-form]');
  if (!form) return;
  e.preventDefault();
  const reqId = form.dataset.followupForm;
  const noteInput = form.elements.note;
  const statusSelect = form.elements.status;
  const note = noteInput.value.trim();
  if (!note) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await addRequestFollowUp(user, reqId, {
      note,
      status: statusSelect.value || null
    });
    noteInput.value = '';
    if (statusSelect.value) {
      const req = requests.find(r => r.id === reqId);
      if (req) req.status = statusSelect.value;
      statusSelect.value = '';
    }
    followUpsByReq[reqId] = await getRequestFollowUps(reqId);
    $('followups_list_' + reqId).innerHTML = renderFollowUpsList(reqId);
    toast('تمت إضافة متابعة الطلب.', 'success');
  } catch (err) {
    console.error(err);
    toast('تعذّر إضافة المتابعة.', 'danger');
  } finally {
    submitBtn.disabled = false;
  }
});

// تفعيل التبويب المناسب إذا وُجد Hash في الرابط (#contacts أو #requests)
function checkHashTab() {
  if (location.hash === '#contacts') {
    bootstrap.Tab.getOrCreateInstance($('contacts-tab')).show();
  } else if (location.hash === '#requests') {
    bootstrap.Tab.getOrCreateInstance($('requests-tab')).show();
  }
}
addEventListener('hashchange', checkHashTab);
checkHashTab();

await loadAllData();
