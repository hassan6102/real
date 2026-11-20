import { guard, toast } from './layout.js';
import { listFavorites, removeFavorite } from './services/favorites.js';
import { displayCode } from './property-model.js';
import { priceInfo } from './offers-model.js';
import { escapeHtml, fmtNumber, normalizeAr, PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES } from './utils.js';

const user = await guard({ base: '../', active: 'pages/favorites.html' });
const $ = id => document.getElementById(id);
const opts = (el, all, map) => (el.innerHTML = `<option value="">${all}</option>` + Object.entries(map).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''));
opts($('fTx'), 'كل العمليات', TRANSACTION_TYPES);
opts($('fType'), 'كل العقارات', PROPERTY_TYPES);
opts($('fStatus'), 'كل الحالات', STATUSES);

let items = [];

// العقار المحذوف يظهر فقط عند غياب الفلاتر (لا يمكن تصنيفه)، ويُبحث عنه بالكود المحفوظ.
function pass(f) {
  const q = normalizeAr($('q').value), p = f.property;
  if (!p) return !$('fTx').value && !$('fType').value && !$('fStatus').value && (!q || normalizeAr(f.code).includes(q));
  if ($('fTx').value && p.transactionType !== $('fTx').value) return false;
  if ($('fType').value && p.propertyType !== $('fType').value) return false;
  if ($('fStatus').value && p.status !== $('fStatus').value) return false;
  if (!q) return true;
  return normalizeAr([displayCode(p), p.code, p.location?.district, p.location?.street].filter(Boolean).join(' ')).includes(q);
}

function card(f) {
  const p = f.property;
  if (!p) {
    return `<div class="col-12 col-md-6 col-xl-4"><div class="pcard">
      <div class="d-flex justify-content-between"><strong>${escapeHtml(f.code || '—')}</strong><span class="badge bg-secondary">محذوف</span></div>
      <p class="text-muted small my-3">هذا العقار لم يعد موجودًا في النظام.</p>
      <button class="btn btn-sm btn-outline-danger" data-remove="${f.id}">إزالة من المفضلة</button></div></div>`;
  }
  const inactive = p.status !== 'available';
  return `<div class="col-12 col-md-6 col-xl-4"><div class="pcard">
    <div class="d-flex justify-content-between"><strong>${escapeHtml(displayCode(p))}</strong><span class="badge st-${p.status}">${STATUSES[p.status] || ''}</span></div>
    <div class="fw-semibold mt-1">${PROPERTY_TYPES[p.propertyType] || ''} · ${TRANSACTION_TYPES[p.transactionType] || ''}</div>
    <div class="text-muted small">${escapeHtml([p.location?.district, p.location?.street].filter(Boolean).join('، '))}</div>
    <div class="price">${priceInfo(p).text}${priceInfo(p).note ? ` <small class="text-muted fw-normal">${priceInfo(p).note}</small>` : ''}</div>
    ${inactive ? '<div class="small text-warning-emphasis mb-2"><i class="bi bi-info-circle ms-1"></i>هذا العقار لم يعد متاحًا حاليًا.</div>' : ''}
    <div class="d-flex flex-wrap gap-2"><a class="btn btn-sm btn-navy" href="property-details.html?id=${f.id}">التفاصيل</a>
    <button class="btn btn-sm btn-outline-danger" data-remove="${f.id}"><i class="bi bi-star-fill ms-1"></i>إزالة</button></div></div></div>`;
}

function render() {
  const shown = items.filter(pass);
  $('count').textContent = items.length ? `عرض ${shown.length} من ${items.length}` : '';
  $('list').innerHTML = shown.length ? shown.map(card).join('')
    : `<div class="empty w-100"><i class="bi bi-star"></i><p>${items.length ? 'لا توجد نتائج مطابقة.' : 'لم تضف عقارات إلى المفضلة بعد. اضغط على النجمة في أي عقار لإضافته.'}</p></div>`;
}

async function load() {
  try { items = await listFavorites(user); $('err').hidden = true; render(); }
  catch (e) { console.error(e); $('err').hidden = false; $('list').innerHTML = ''; }
}

['q', 'fTx', 'fType', 'fStatus'].forEach(id => $(id).addEventListener(id === 'q' ? 'input' : 'change', render));
$('reset').onclick = () => { $('q').value = ''; ['fTx', 'fType', 'fStatus'].forEach(id => ($(id).value = '')); render(); };
$('list').addEventListener('click', async e => {
  const b = e.target.closest('[data-remove]'); if (!b) return;
  b.disabled = true;
  try { await removeFavorite(user, b.dataset.remove); items = items.filter(x => x.id !== b.dataset.remove); render(); toast('أُزيل من المفضلة.'); }
  catch (ex) { console.error(ex); b.disabled = false; toast('تعذّر الإزالة.', 'danger'); }
});
await load();
