import { toast } from './layout.js';
import { favButton } from './favorites-ui.js';
import { shareText, FINISHING, floorLabel, displayCode } from './property-model.js';
import { priceInfo } from './offers-model.js';
import { escapeHtml, fmtNumber, PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES } from './utils.js';

/** match (اختياري): نتيجة بحث ذكي {score, level, reasons} تُعرض كنسبة تشابه وأسباب الاختلاف. */
export function cardHtml(d, match) {
  const p = d.data(), pi = priceInfo(p);
  const bits = [p.area != null && `${fmtNumber(p.area)} م`, p.rooms != null && `${p.rooms} غرف`, p.bathrooms != null && `${p.bathrooms} حمام`, p.floor != null && `الدور ${floorLabel(p.floor)}`, p.finishing && FINISHING[p.finishing]].filter(Boolean);
  return `<div class="col-12 col-md-6 col-xl-4"><div class="pcard">
    <div class="d-flex justify-content-between"><span><strong>${escapeHtml(displayCode(p))}</strong> <button type="button" class="btn btn-sm btn-link p-0 align-baseline" data-copycode="${escapeHtml(displayCode(p))}" aria-label="نسخ الكود" title="نسخ الكود"><i class="bi bi-clipboard"></i></button></span><span class="badge st-${p.status}">${STATUSES[p.status] || ''}</span></div>
    <div class="fw-semibold mt-1">${PROPERTY_TYPES[p.propertyType] || ''} · ${TRANSACTION_TYPES[p.transactionType] || ''}</div>
    <div class="text-muted small">${escapeHtml([p.location?.district, p.location?.street].filter(Boolean).join('، '))}</div>
    <div class="price">${pi.text}${pi.note ? `<div class="small fw-normal ${pi.noActive ? 'text-danger' : 'text-muted'}">${pi.note}</div>` : ''}</div>
    <div class="small text-muted mb-3">${bits.join(' · ') || 'لا توجد تفاصيل إضافية'}</div>${match ? matchHtml(match) : ''}
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
    const cc = e.target.closest('[data-copycode]');
    if (cc) { try { await navigator.clipboard.writeText(cc.dataset.copycode); toast('تم نسخ كود العقار.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } return; }
    const c = e.target.closest('[data-copy]'), w = e.target.closest('[data-wa]');
    if (c) { try { await navigator.clipboard.writeText(shareText(lookup(c.dataset.copy))); toast('تم نسخ بيانات العقار.', 'success'); } catch { toast('تعذّر النسخ.', 'danger'); } }
    if (w) open('https://wa.me/?text=' + encodeURIComponent(shareText(lookup(w.dataset.wa))), '_blank', 'noopener');
  });
}

const LV = { very_high: ['success', 'تطابق مرتفع جدًا'], high: ['success', 'تطابق مرتفع'], medium: ['warning', 'تطابق متوسط'], weak: ['secondary', 'تطابق ضعيف'] };
/** شارة نسبة التشابه + سبب اختلاف كل معيار (المطلوب مقابل المتوفر). النسبة تقديرية وليست ضمانًا. */
export function matchHtml(m) {
  const [c, l] = LV[m.level] || LV.weak;
  const icon = { ok: 'check-circle text-success', near: 'dash-circle text-warning', miss: 'x-circle text-danger', unknown: 'question-circle text-muted' };
  return `<div class="border rounded p-2 mb-3 small"><div class="mb-1"><span class="badge text-bg-${c}">${m.score}%</span> <strong>${l}</strong> <span class="text-muted">(تقديري)</span></div>
    <ul class="list-unstyled mb-0">${m.reasons.filter(r => r.state !== 'ok').map(r => `<li><i class="bi bi-${icon[r.state]} ms-1"></i><strong>${r.label}:</strong> ${escapeHtml(r.text)}</li>`).join('') || '<li>كل المعايير مطابقة.</li>'}</ul></div>`;
}
