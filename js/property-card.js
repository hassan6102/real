import { toast } from './layout.js';
import { favButton } from './favorites-ui.js';
import { shareText, FINISHING, floorLabel } from './property-model.js';
import { escapeHtml, fmtNumber, PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES } from './utils.js';

export function cardHtml(d) {
  const p = d.data();
  const bits = [p.area != null && `${fmtNumber(p.area)} م`, p.rooms != null && `${p.rooms} غرف`, p.bathrooms != null && `${p.bathrooms} حمام`, p.floor != null && `الدور ${floorLabel(p.floor)}`, p.finishing && FINISHING[p.finishing]].filter(Boolean);
  return `<div class="col-12 col-md-6 col-xl-4"><div class="pcard">
    <div class="d-flex justify-content-between"><strong>${escapeHtml(p.code || '')}</strong><span class="badge st-${p.status}">${STATUSES[p.status] || ''}</span></div>
    <div class="fw-semibold mt-1">${PROPERTY_TYPES[p.propertyType] || ''} · ${TRANSACTION_TYPES[p.transactionType] || ''}</div>
    <div class="text-muted small">${escapeHtml([p.location?.district, p.location?.city].filter(Boolean).join('، '))}</div>
    <div class="price">${p.price != null ? fmtNumber(p.price) + ' جنيه' : 'السعر غير مسجل'}</div>
    <div class="small text-muted mb-3">${bits.join(' · ') || 'لا توجد تفاصيل إضافية'}</div>
    <div class="d-flex flex-wrap gap-2">
      <a class="btn btn-sm btn-navy" href="property-details.html?id=${d.id}">التفاصيل</a>
      <a class="btn btn-sm btn-outline-secondary" href="add-property.html?id=${d.id}">تعديل</a>
      <button class="btn btn-sm btn-outline-secondary" data-copy="${d.id}">نسخ البيانات</button>
      <button class="btn btn-sm btn-outline-success" data-wa="${d.id}">واتساب</button>
      <a class="btn btn-sm btn-outline-secondary" href="property-details.html?id=${d.id}#status">تغيير الحالة</a>
      ${favButton(d.id)}</div></div></div>`;
}
/** يربط أزرار النسخ والواتساب؛ `lookup(id)` يعيد بيانات العقار. */
export function bindCardActions(container, lookup) {
  container.addEventListener('click', async e => {
    const c = e.target.closest('[data-copy]'), w = e.target.closest('[data-wa]');
    if (c) { try { await navigator.clipboard.writeText(shareText(lookup(c.dataset.copy))); toast('تم نسخ بيانات العقار.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } }
    if (w) open('https://wa.me/?text=' + encodeURIComponent(shareText(lookup(w.dataset.wa))), '_blank', 'noopener');
  });
}
