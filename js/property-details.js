import { guard, toast } from './layout.js';
import { onSnapshot, getDoc, doc, db } from './firebase-config.js';
import { GROUPS, flatten, shareText, floorLabel, displayCode } from './property-model.js';
import { priceInfo, OFFER_STATUSES } from './offers-model.js';
import { mountOffers } from './offers-ui.js';
import { getProperty, propRef, changeStatus, deleteProperty } from './services/properties.js';
import { favButton, attachFavorites } from './favorites-ui.js';
import { escapeHtml, fmtNumber, fmtDateTime, STATUSES, PROPERTY_TYPES, TRANSACTION_TYPES } from './utils.js';

const user = await guard({ base: '../', active: 'pages/properties.html' });
const id = new URLSearchParams(location.search).get('id');
const canOwner = user.role === 'admin' || user.permissions?.canViewOwnerData === true;
const root = document.getElementById('details');
let cur = null, priv = {}, offersUi = null;

if (canOwner) priv = (await getProperty(id, true))?._priv || {};

const fmt = (f, v, p) => f.k === 'price' ? (() => { const i = priceInfo(p || cur); return i.text + (i.note ? ` <small class="text-muted">(${i.note})</small>` : ''); })() :  f.t === 's' ? (f.o[v] || v) : f.t === 'n' ? fmtNumber(v) + (f.k === 'area' ? ' م²' : f.k === 'price' ? ' جنيه' : '') : escapeHtml(v);

function render(p) {
  cur = p;
  const vals = { ...flatten(p), ...flatten(priv) };
  document.getElementById('title').innerHTML = `<span id="codeTxt">${escapeHtml(displayCode(p))}</span> <button type="button" id="copyCode" class="btn btn-sm btn-outline-secondary align-middle" title="نسخ الكود" aria-label="نسخ الكود"><i class="bi bi-clipboard"></i></button> - ${PROPERTY_TYPES[p.propertyType] || ''} ${TRANSACTION_TYPES[p.transactionType] || ''}`;
  document.getElementById('copyCode').onclick = async () => { try { await navigator.clipboard.writeText(displayCode(p)); toast('تم نسخ كود العقار.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } };
  document.getElementById('status').innerHTML = `<span class="badge st-${p.status}">${STATUSES[p.status]}</span>`;
  document.getElementById('meta').textContent = `أضافه ${p.createdByName || '—'} في ${fmtDateTime(p.createdAt)} · آخر تحديث بواسطة ${p.updatedByName || '—'} في ${fmtDateTime(p.updatedAt)}` +
    (p.statusChangedAt ? ` · تغيّرت الحالة بواسطة ${p.statusChangedByName || '—'} في ${fmtDateTime(p.statusChangedAt)}` : '') + (p.originalPrice != null && p.originalPrice !== p.price ? ` · السعر الأصلي ${fmtNumber(p.originalPrice)}` : '');
  root.innerHTML = GROUPS.map(g => {
    const rows = g.fields.filter(f => (!f.p || canOwner) && vals[f.k] != null && vals[f.k] !== '').map(f => `<div class="col-12 col-md-6 col-lg-4 kv"><small>${f.k === 'price' ? 'السعر (أقل عرض نشط)' : f.l}</small><div>${f.k === 'floor' ? floorLabel(vals[f.k]) : fmt(f, vals[f.k], p)}</div></div>`);
    return rows.length ? `<section class="panel mb-3"><h2>${g.title}</h2><div class="row g-3 p-3">${rows.join('')}</div></section>` : '';
  }).join('') || '<div class="empty">لا توجد تفاصيل مسجلة.</div>';
  document.getElementById('edit').href = `add-property.html?id=${p.id}`;
  document.getElementById('delete').hidden = user.role !== 'admin';
}

onSnapshot(propRef(id), s => {
  if (!s.exists()) { root.innerHTML = '<div class="alert alert-danger">العقار غير موجود.</div>'; return; }
  render({ id, ...s.data() });
  if (!offersUi) offersUi = mountOffers({ box: document.getElementById('offersBox'), user, canOwner, getProp: () => cur, legacy: canOwner && (priv.owner?.brokerPhone || priv.owner?.phone || priv.financial?.commissionAgreed) && !s.data().offersMigrated ? priv : null });
}, e => { console.error(e); root.innerHTML = '<div class="alert alert-danger">تعذّر تحميل العقار.</div>'; });

document.getElementById('copy').onclick = async () => { try { await navigator.clipboard.writeText(shareText(cur)); toast('تم نسخ بيانات العقار.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } };
document.getElementById('wa').onclick = () => open('https://wa.me/?text=' + encodeURIComponent(shareText(cur)), '_blank', 'noopener');

const modal = new bootstrap.Modal('#statusModal'), sel = document.getElementById('newStatus'), fp = document.getElementById('finalPrice');
document.getElementById('openStatus').onclick = () => {
  sel.innerHTML = Object.entries(STATUSES).filter(([k]) => k !== cur.status).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  const offs = (offersUi?.offers() || []).filter(o => o.status === 'active');
  document.getElementById('offerSel').innerHTML = '<option value="">— بدون تحديد —</option>' + offs.map((o, i) => `<option value="${o.id}">${fmtNumber(o.price)} جنيه${o._priv?.brokerName || o._priv?.brokerPhone ? ' — ' + escapeHtml(o._priv.brokerName || o._priv.brokerPhone) : ' — عرض ' + (i + 1)}</option>`).join('');
  document.getElementById('offerSel').onchange = () => { const o = offs.find(x => x.id === document.getElementById('offerSel').value); if (o?.price != null) fp.value = o.price; };
  fp.value = cur.price ?? ''; sel.onchange(); modal.show();
};
sel.onchange = () => { const c = ['sold', 'rented'].includes(sel.value); document.getElementById('fpBox').hidden = !c; document.getElementById('offBox').hidden = !c || document.getElementById('offerSel').options.length < 2; };
document.getElementById('confirmStatus').onclick = async e => {
  e.target.disabled = true;
  try {
    const n = Number(fp.value.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, ''));
    const chosen = (offersUi?.offers() || []).find(o => o.id === document.getElementById('offerSel').value) || null;
    await changeStatus(user, cur, sel.value, Number.isFinite(n) && fp.value.trim() ? n : null, chosen);
    modal.hide(); toast('تم تغيير الحالة لجميع الفريق.', 'success');
  } catch (ex) { console.error(ex); toast('تعذّر تغيير الحالة.', 'danger'); }
  e.target.disabled = false;
};
document.getElementById('delete').onclick = async () => {
  const code = displayCode(cur);
  if (!confirm(`حذف العقار ${code} وعروضه نهائيًا لا يمكن التراجع عنه. هل أنت متأكد؟`)) return;
  if (prompt(`اكتب كود العقار (${code}) للتأكيد`) !== code) return toast('الكود غير مطابق. لم يُحذف شيء.', 'warning');
  try { await deleteProperty(user, cur); location.href = 'properties.html'; } catch (ex) { console.error(ex); toast(['HAS_LINKS', 'BLOCKER_CHECK_FAILED'].includes(ex.code) ? ex.message : 'تعذّر الحذف.', 'danger'); }
};
if (location.hash === '#status') { const t = setInterval(() => { if (cur) { clearInterval(t); document.getElementById('openStatus').click(); } }, 100); setTimeout(() => clearInterval(t), 5000); }

document.getElementById('favSlot').innerHTML = favButton(id);
attachFavorites(document.getElementById('favSlot'), user, () => cur);
