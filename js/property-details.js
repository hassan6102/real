import { guard, toast } from './layout.js';
import { onSnapshot, getDoc, doc, db } from './firebase-config.js';
import { GROUPS, flatten, shareText, floorLabel } from './property-model.js';
import { getProperty, propRef, changeStatus, deleteProperty } from './services/properties.js';
import { favButton, attachFavorites } from './favorites-ui.js';
import { escapeHtml, fmtNumber, fmtDateTime, STATUSES, PROPERTY_TYPES, TRANSACTION_TYPES } from './utils.js';

const user = await guard({ base: '../', active: 'pages/properties.html' });
const id = new URLSearchParams(location.search).get('id');
const canOwner = user.role === 'admin' || user.permissions?.canViewOwnerData === true;
const root = document.getElementById('details');
let cur = null, priv = {};

if (canOwner) priv = (await getProperty(id, true))?._priv || {};

const fmt = (f, v) => f.t === 's' ? (f.o[v] || v) : f.t === 'n' ? fmtNumber(v) + (f.k === 'area' ? ' م²' : f.k === 'price' ? ' جنيه' : '') : escapeHtml(v);

function render(p) {
  cur = p;
  const vals = { ...flatten(p), ...flatten(priv) };
  document.getElementById('title').textContent = `${p.code} - ${PROPERTY_TYPES[p.propertyType] || ''} ${TRANSACTION_TYPES[p.transactionType] || ''}`;
  document.getElementById('status').innerHTML = `<span class="badge st-${p.status}">${STATUSES[p.status]}</span>`;
  document.getElementById('meta').textContent = `أضافه ${p.createdByName || '—'} في ${fmtDateTime(p.createdAt)} · آخر تحديث بواسطة ${p.updatedByName || '—'} في ${fmtDateTime(p.updatedAt)}` +
    (p.statusChangedAt ? ` · تغيّرت الحالة بواسطة ${p.statusChangedByName || '—'} في ${fmtDateTime(p.statusChangedAt)}` : '') + (p.originalPrice != null && p.originalPrice !== p.price ? ` · السعر الأصلي ${fmtNumber(p.originalPrice)}` : '');
  root.innerHTML = GROUPS.map(g => {
    const rows = g.fields.filter(f => (!f.p || canOwner) && vals[f.k] != null && vals[f.k] !== '').map(f => `<div class="col-12 col-md-6 col-lg-4 kv"><small>${f.l}</small><div>${f.k === 'floor' ? floorLabel(vals[f.k]) : fmt(f, vals[f.k])}</div></div>`);
    return rows.length ? `<section class="panel mb-3"><h2>${g.title}</h2><div class="row g-3 p-3">${rows.join('')}</div></section>` : '';
  }).join('') || '<div class="empty">لا توجد تفاصيل مسجلة.</div>';
  document.getElementById('edit').href = `add-property.html?id=${p.id}`;
  document.getElementById('delete').hidden = user.role !== 'admin';
}

onSnapshot(propRef(id), s => {
  if (!s.exists()) { root.innerHTML = '<div class="alert alert-danger">العقار غير موجود.</div>'; return; }
  render({ id, ...s.data() });
}, e => { console.error(e); root.innerHTML = '<div class="alert alert-danger">تعذّر تحميل العقار.</div>'; });

document.getElementById('copy').onclick = async () => { try { await navigator.clipboard.writeText(shareText(cur)); toast('تم نسخ بيانات العقار.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } };
document.getElementById('wa').onclick = () => open('https://wa.me/?text=' + encodeURIComponent(shareText(cur)), '_blank', 'noopener');

const modal = new bootstrap.Modal('#statusModal'), sel = document.getElementById('newStatus'), fp = document.getElementById('finalPrice');
document.getElementById('openStatus').onclick = () => {
  sel.innerHTML = Object.entries(STATUSES).filter(([k]) => k !== cur.status).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  fp.value = cur.price ?? ''; sel.onchange(); modal.show();
};
sel.onchange = () => { document.getElementById('fpBox').hidden = !['sold', 'rented'].includes(sel.value); };
document.getElementById('confirmStatus').onclick = async e => {
  e.target.disabled = true;
  try {
    const n = Number(fp.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, ''));
    await changeStatus(user, cur, sel.value, Number.isFinite(n) && fp.value.trim() ? n : null);
    modal.hide(); toast('تم تغيير الحالة لجميع الفريق.', 'success');
  } catch (ex) { console.error(ex); toast('تعذّر تغيير الحالة.', 'danger'); }
  e.target.disabled = false;
};
document.getElementById('delete').onclick = async () => {
  if (!confirm(`حذف العقار ${cur.code} نهائيًا لا يمكن التراجع عنه. هل أنت متأكد؟`)) return;
  if (prompt(`اكتب كود العقار (${cur.code}) للتأكيد`) !== cur.code) return toast('الكود غير مطابق. لم يُحذف شيء.', 'warning');
  try { await deleteProperty(user, cur); location.href = 'properties.html'; } catch (ex) { console.error(ex); toast('تعذّر الحذف.', 'danger'); }
};
if (location.hash === '#status') { const t = setInterval(() => { if (cur) { clearInterval(t); document.getElementById('openStatus').click(); } }, 100); setTimeout(() => clearInterval(t), 5000); }

document.getElementById('favSlot').innerHTML = favButton(id);
attachFavorites(document.getElementById('favSlot'), user, () => cur);
