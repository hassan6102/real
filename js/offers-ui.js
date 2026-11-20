// قسم "السماسرة والعروض" في صفحة العقار: بطاقة لكل عرض + إضافة/تعديل/إيقاف/إعادة تفعيل/حذف(مدير)/اتصال/نسخ.
import { watchOffers, withPrivate, addOffer, updateOffer, setOfferStatus, deleteOffer, syncSummary } from './services/offers.js';
import { OFFER_STATUSES, SOURCE_KINDS, COMMISSION_PAYER, validateOffer } from './offers-model.js';
import { escapeHtml, fmtNumber, fmtDateTime, normalizePhone } from './utils.js';
import { toast } from './layout.js';

const ST_CLS = { active: 'success', unavailable: 'secondary', expired: 'dark' };

export function mountOffers({ box, user, canOwner, getProp, legacy }) {
  const isAdmin = user.role === 'admin';
  let offers = [], showAll = false, healed = false;
  const privCache = new Map();

  const modalEl = document.createElement('div');
  modalEl.className = 'modal fade'; modalEl.tabIndex = -1;
  document.body.appendChild(modalEl);
  const modal = new bootstrap.Modal(modalEl);
  const fld = (id, label, inner, cols = 'col-12 col-md-6') => `<div class="${cols}"><label class="form-label" for="${id}">${label}</label>${inner}<div class="invalid-feedback"></div></div>`;
  const inp = (id, mode = '') => `<input class="form-control" id="${id}" autocomplete="off" ${mode}>`;
  const sel = (id, o) => `<select class="form-select" id="${id}">${Object.entries(o).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  const m$ = id => modalEl.querySelector('#' + id);

  function openForm(offer, seed = {}) {
    const edit = !!offer, priv = offer?._priv || {}, showPriv = !edit || canOwner;
    modalEl.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5">${edit ? 'تعديل العرض' : seed.brokerPhone ? 'عرض جديد من نفس السمسار' : 'إضافة سمسار / عرض'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button></div>
      <div class="modal-body"><div class="row g-3">
        ${showPriv ? fld('of_phone', 'رقم الهاتف', inp('of_phone', 'inputmode="tel"')) + fld('of_name', 'الاسم (اختياري)', inp('of_name')) + fld('of_kind', 'المصدر', sel('of_kind', SOURCE_KINDS)) : ''}
        ${fld('of_price', 'السعر (جنيه) *', inp('of_price', 'inputmode="decimal"'))}
        ${edit ? fld('of_status', 'حالة العرض', sel('of_status', OFFER_STATUSES)) : ''}
        ${showPriv ? fld('of_comm', 'العمولة / الاتفاق المالي', inp('of_comm')) + fld('of_pct', 'نسبة العمولة %', inp('of_pct', 'inputmode="decimal"')) + fld('of_val', 'قيمة العمولة', inp('of_val', 'inputmode="decimal"')) + fld('of_payer', 'العمولة على', '<select class="form-select" id="of_payer"><option value="">—</option>' + Object.entries(COMMISSION_PAYER).map(([v, l]) => `<option value="${v}">${l}</option>`).join('') + '</select>') + fld('of_min', 'أقل سعر متوقع', inp('of_min', 'inputmode="decimal"')) + fld('of_notes', 'ملاحظات خاصة بهذا السمسار', '<textarea class="form-control" id="of_notes" rows="2"></textarea>', 'col-12') : ''}
        ${!showPriv ? '<div class="col-12 small text-muted">بيانات الهاتف والعمولة تحتاج صلاحية عرض بيانات المالك.</div>' : ''}
      </div></div>
      <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">إلغاء</button><button type="button" class="btn btn-navy" id="of_save">${edit ? 'حفظ التعديل' : 'إضافة'}</button></div></div></div>`;
    const set = (id, v) => { const e = m$(id); if (e && v != null) e.value = v; };
    set('of_kind', offer?.sourceKind || seed.sourceKind || 'broker'); set('of_phone', priv.brokerPhone ?? seed.brokerPhone); set('of_name', priv.brokerName ?? seed.brokerName);
    set('of_price', offer?.price); set('of_status', offer?.status); set('of_comm', priv.commissionAgreed); set('of_pct', priv.commissionPercent); set('of_val', priv.commissionValue);
    set('of_payer', priv.commissionPayer); set('of_min', priv.minPrice); set('of_notes', priv.notes);
    m$('of_save').onclick = async e => {
      const g = id => m$(id)?.value ?? '';
      const values = { price: g('of_price'), status: edit ? g('of_status') : 'active', sourceKind: g('of_kind') || 'broker', brokerPhone: g('of_phone'), brokerName: g('of_name'), commissionAgreed: g('of_comm'), commissionPercent: g('of_pct'), commissionValue: g('of_val'), commissionPayer: g('of_payer'), minPrice: g('of_min'), notes: g('of_notes') };
      const errs = validateOffer(values), map = { price: 'of_price', brokerPhone: 'of_phone', commissionPercent: 'of_pct', commissionValue: 'of_val', minPrice: 'of_min' };
      modalEl.querySelectorAll('.is-invalid').forEach(x => x.classList.remove('is-invalid'));
      for (const [k, msg] of Object.entries(errs)) { const el = m$(map[k]); if (el) { el.classList.add('is-invalid'); el.nextElementSibling.textContent = msg; } }
      if (Object.keys(errs).length) return;
      e.target.disabled = true;
      try {
        if (edit) await updateOffer(user, getProp(), offer, values, canOwner); else await addOffer(user, getProp(), values);
        modal.hide(); toast(edit ? 'تم تعديل العرض.' : 'تمت إضافة العرض.', 'success');
      } catch (ex) { console.error(ex); toast(ex.code === 'VALIDATION_ERROR' ? ex.message : 'تعذّر الحفظ.', 'danger'); }
      e.target.disabled = false;
    };
    modal.show();
  }

  function card(o, i) {
    const p = o._priv, inactive = o.status !== 'active';
    const who = p ? `${p.brokerName ? escapeHtml(p.brokerName) : '<span class="text-muted">بلا اسم</span>'}` : '';
    const comm = p ? [p.commissionAgreed, p.commissionPercent != null && `${p.commissionPercent}%`, p.commissionValue != null && `${fmtNumber(p.commissionValue)} جنيه`, p.commissionPayer && `على ${COMMISSION_PAYER[p.commissionPayer]}`].filter(Boolean).map(x => escapeHtml(String(x))).join(' · ') : '';
    return `<div class="col-12 col-lg-6"><div class="offer-card ${inactive ? 'inactive' : ''}" data-id="${o.id}">
      <div class="d-flex justify-content-between align-items-start gap-2"><div><strong>${o.price != null ? fmtNumber(o.price) + ' جنيه' : 'بلا سعر'}</strong> <span class="badge text-bg-${ST_CLS[o.status] || 'secondary'}">${OFFER_STATUSES[o.status] || o.status}</span> <span class="badge text-bg-light border">${SOURCE_KINDS[o.sourceKind] || ''}</span></div><small class="text-muted">عرض ${i + 1}</small></div>
      ${canOwner ? `<div class="mt-1">${who}${p?.brokerPhone ? ` · <a href="tel:${escapeHtml(normalizePhone(p.brokerPhone))}" dir="ltr">${escapeHtml(p.brokerPhone)}</a>` : ' <span class="text-muted small">لا رقم</span>'}</div>
        ${comm ? `<div class="small"><span class="text-muted">العمولة:</span> ${comm}</div>` : ''}${p?.minPrice != null ? `<div class="small"><span class="text-muted">أقل سعر متوقع:</span> ${fmtNumber(p.minPrice)}</div>` : ''}${p?.notes ? `<div class="small"><span class="text-muted">ملاحظات:</span> ${escapeHtml(p.notes)}</div>` : ''}` : '<div class="small text-muted mt-1">بيانات السمسار تحتاج صلاحية عرض بيانات المالك.</div>'}
      <div class="small text-muted mt-1">آخر تحديث ${fmtDateTime(o.updatedAt)} · ${escapeHtml(o.updatedByName || '')}</div>
      <div class="d-flex flex-wrap gap-1 mt-2">
        <button class="btn btn-sm btn-outline-secondary" data-act="edit">تعديل</button>
        ${inactive ? '<button class="btn btn-sm btn-outline-success" data-act="on">إعادة تفعيل</button>' : '<button class="btn btn-sm btn-outline-warning" data-act="off">إيقاف</button>'}
        ${p?.brokerPhone ? `<a class="btn btn-sm btn-outline-primary" href="tel:${escapeHtml(normalizePhone(p.brokerPhone))}"><i class="bi bi-telephone"></i> اتصال</a><button class="btn btn-sm btn-outline-secondary" data-act="copy" data-phone="${escapeHtml(p.brokerPhone)}"><i class="bi bi-clipboard"></i> نسخ الرقم</button><button class="btn btn-sm btn-outline-secondary" data-act="again">عرض جديد من نفس السمسار</button>` : ''}
        ${isAdmin ? '<button class="btn btn-sm btn-outline-danger" data-act="del">حذف العرض</button>' : ''}</div></div></div>`;
  }

  function render() {
    const active = offers.filter(o => o.status === 'active'), shown = showAll ? offers : active, hidden = offers.length - active.length;
    const lg = !offers.length && legacy ? `<div class="alert alert-warning small mt-2">يوجد لهذا العقار بيانات سمسار/مالك قديمة لم تُنقل إلى العروض بعد (${escapeHtml([legacy.owner?.brokerName, legacy.owner?.brokerPhone, legacy.owner?.phone].filter(Boolean).join(' - ') || 'بيانات مالية')}). يشغّل المدير "ترحيل العروض" من القائمة، أو أضف العرض يدويًا.</div>` : '';
    box.innerHTML = `<section class="panel mb-3"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2 p-3 pb-0"><h2 class="mb-0">السماسرة والعروض <small class="text-muted fs-6">(${active.length} نشط من ${offers.length})</small></h2>
      <div class="d-flex gap-2 flex-wrap">${hidden ? `<button class="btn btn-sm btn-outline-secondary" data-act="all">${showAll ? 'إخفاء غير النشطة' : `عرض جميع العروض (+${hidden})`}</button>` : ''}<button class="btn btn-sm btn-gold" data-act="add"><i class="bi bi-plus-lg ms-1"></i>إضافة سمسار</button></div></div>
      <div class="p-3"><div class="small text-muted mb-2">السعر المعروض في بقية النظام هو أقل عرض نشط. تعديل سعر عرض لا يؤثر على العروض الأخرى، وإيقاف العرض أو حذفه لا يحذف العقار.</div>
      <div class="row g-3">${shown.map((o, i) => card(o, offers.indexOf(o))).join('') || '<div class="col-12 text-muted">لا توجد عروض نشطة.</div>'}</div>${lg}</div></section>`;
  }

  box.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, o = offers.find(x => x.id === b.closest('[data-id]')?.dataset.id);
    try {
      if (act === 'add') return openForm(null);
      if (act === 'all') { showAll = !showAll; return render(); }
      if (act === 'edit') return openForm(o);
      if (act === 'again') return openForm(null, { brokerPhone: o._priv.brokerPhone, brokerName: o._priv.brokerName, sourceKind: o.sourceKind });
      if (act === 'copy') { await navigator.clipboard.writeText(b.dataset.phone); return toast('تم نسخ الرقم.', 'success'); }
      if (act === 'off') { await setOfferStatus(user, getProp(), o, 'unavailable'); return toast('تم إيقاف العرض. العقار لم يُحذف.', 'success'); }
      if (act === 'on') { await setOfferStatus(user, getProp(), o, 'active'); return toast('تمت إعادة تفعيل العرض.', 'success'); }
      if (act === 'del' && confirm('حذف هذا العرض نهائيًا؟ لن يُحذف العقار ولا العروض الأخرى.')) { await deleteOffer(user, getProp(), o); toast('تم حذف العرض.', 'success'); }
    } catch (ex) { console.error(ex); toast('تعذّر تنفيذ العملية.', 'danger'); }
  };

  watchOffers(getProp().id, async list => {
    offers = list;
    if (canOwner) offers = await Promise.all(list.map(async o => { const k = o.id + ':' + (o.updatedAt?.toMillis?.() || 0); if (!privCache.has(k)) privCache.set(k, (await withPrivate([o]))[0]._priv); return { ...o, _priv: privCache.get(k) }; }));
    render();
    if (!healed) { healed = true; syncSummary(user, getProp().id).catch(e => console.error(e)); }   // علاج ذاتي لملخص السعر
  }, () => { box.innerHTML = '<div class="alert alert-danger">تعذّر تحميل العروض.</div>'; });

  return { offers: () => offers };
}
