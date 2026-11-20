import { guard, toast } from './layout.js';
import { normalizePhone, escapeHtml } from './utils.js';
import {
  CUSTOMER_TYPES, CUSTOMER_STATUSES, CUSTOMER_SOURCES,
  getCustomer, createCustomer, updateCustomer, validateCustomerInput
} from './services/customers.js';

const user = await guard({ base: '../', active: 'pages/customers.html' });
const $ = id => document.getElementById(id);
const sp = new URLSearchParams(location.search);
const customerId = sp.get('id');

// تعبئة القوائم المنسدلة
$('customerType').innerHTML = Object.entries(CUSTOMER_TYPES)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

$('status').innerHTML = Object.entries(CUSTOMER_STATUSES)
  .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

$('source').innerHTML = '<option value="">— اختر المصدر —</option>' +
  Object.entries(CUSTOMER_SOURCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

let oldCustomer = null;
let dirty = (window.__dirty = false);

if (customerId) {
  $('title').textContent = 'تعديل بيانات العميل';
  $('cancelBtn').href = `customer-details.html?id=${encodeURIComponent(customerId)}`;
  try {
    oldCustomer = await getCustomer(customerId);
    if (!oldCustomer) {
      $('alertBox').textContent = 'العميل المطلوب غير موجود أو تم حذفه.';
      $('alertBox').hidden = false;
      $('customerForm').hidden = true;
    } else {
      $('name').value = oldCustomer.name || '';
      $('phone').value = oldCustomer.phone || oldCustomer.phoneNormalized || '';
      $('phone2').value = oldCustomer.phone2 || '';
      $('whatsapp').value = oldCustomer.whatsapp || '';
      $('customerType').value = oldCustomer.customerType || 'buyer';
      $('status').value = oldCustomer.status || 'active';
      $('source').value = oldCustomer.source || '';
      $('notes').value = oldCustomer.notes || '';
    }
  } catch (err) {
    console.error(err);
    $('alertBox').textContent = 'تعذّر تحميل بيانات العميل.';
    $('alertBox').hidden = false;
  }
}

$('copyPhoneToWa').addEventListener('click', () => {
  const normalized = normalizePhone($('phone').value);
  if (normalized) {
    $('whatsapp').value = normalized;
    dirty = window.__dirty = true;
  }
});

$('customerForm').addEventListener('input', () => {
  dirty = window.__dirty = true;
});

addEventListener('beforeunload', e => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

$('cancelBtn').addEventListener('click', e => {
  if (dirty && !confirm('توجد تعديلات غير محفوظة. هل تريد المغادرة؟')) {
    e.preventDefault();
  }
});

function clearErrors() {
  $('alertBox').hidden = true;
  $('alertBox').innerHTML = '';
  document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

function showFieldErrors(errors) {
  for (const [k, msg] of Object.entries(errors)) {
    const input = $(k);
    const feedback = $('err_' + k);
    if (input) input.classList.add('is-invalid');
    if (feedback) feedback.textContent = msg;
  }
}

$('customerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('saveBtn');
  if (btn.disabled) return;

  clearErrors();

  const raw = {
    name: $('name').value,
    phone: $('phone').value,
    phone2: $('phone2').value,
    whatsapp: $('whatsapp').value,
    customerType: $('customerType').value,
    status: $('status').value,
    source: $('source').value,
    notes: $('notes').value
  };

  const { errors } = validateCustomerInput(raw);
  if (Object.keys(errors).length) {
    showFieldErrors(errors);
    toast('يرجى مراجعة الحقول المطلوبة.', 'danger');
    return;
  }

  btn.disabled = true;
  try {
    let targetId = customerId;
    if (customerId) {
      await updateCustomer(user, customerId, oldCustomer, raw);
      toast('تم تحديث بيانات العميل بنجاح.', 'success');
    } else {
      targetId = await createCustomer(user, raw);
      toast('تم إضافة العميل بنجاح.', 'success');
    }
    dirty = window.__dirty = false;
    location.href = `customer-details.html?id=${encodeURIComponent(targetId)}`;
  } catch (err) {
    console.error(err);
    if (err.code === 'DUPLICATE_PHONE') {
      $('phone').classList.add('is-invalid');
      $('err_phone').textContent = err.message;
      const linkHtml = err.existingCustomerId
        ? ` <a href="customer-details.html?id=${encodeURIComponent(err.existingCustomerId)}" class="alert-link">عرض صفحة العميل المسجل بهذا الرقم</a>`
        : '';
      $('alertBox').innerHTML = `<i class="bi bi-exclamation-triangle-fill ms-1"></i>${escapeHtml(err.message)}${linkHtml}`;
      $('alertBox').hidden = false;
      toast(err.message, 'danger');
    } else if (err.code === 'VALIDATION_ERROR' && err.errors) {
      showFieldErrors(err.errors);
      toast(err.message, 'danger');
    } else {
      $('alertBox').textContent = 'تعذّر حفظ بيانات العميل. تحقق من الاتصال وصلاحيات الحساب ثم حاول مجددًا.';
      $('alertBox').hidden = false;
      toast('تعذّر حفظ بيانات العميل.', 'danger');
    }
    btn.disabled = false;
  }
});
