import { guard, toast } from './layout.js';
import { GROUPS, ALL_FIELDS, buildDoc, validate, flatten } from './property-model.js';
import { getProperty, createProperty, updateProperty } from './services/properties.js';
import { escapeHtml } from './utils.js';

const user = await guard({ base: '../', active: 'pages/add-property.html' });
const id = new URLSearchParams(location.search).get('id');
const canOwner = user.role === 'admin' || user.permissions?.canViewOwnerData === true;
const showField = f => (!id || !f.addOnly) && (!f.p || !id || canOwner);
const dom = k => 'f_' + k.replaceAll('.', '_');

function input(f) {
  const cls = 'form-control';
  if (f.t === 's') return `<select class="form-select" id="${dom(f.k)}" data-k="${f.k}"><option value="">—</option>${Object.entries(f.o).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  if (f.t === 'a') return `<textarea class="${cls}" rows="2" id="${dom(f.k)}" data-k="${f.k}"></textarea>`;
  return `<input class="${cls}" id="${dom(f.k)}" data-k="${f.k}" ${f.t === 'n' ? 'inputmode="decimal"' : ''} autocomplete="off">`;
}

document.getElementById('groups').innerHTML = GROUPS.map((g, i) => {
  const fields = g.fields.filter(showField);
  if (!fields.length) return '';
  return `<div class="accordion-item"><h2 class="accordion-header"><button type="button" class="accordion-button ${g.open ? '' : 'collapsed'}" data-bs-toggle="collapse" data-bs-target="#g_${g.id}">${g.title}</button></h2>
  <div id="g_${g.id}" class="accordion-collapse collapse ${g.open ? 'show' : ''}"><div class="accordion-body"><div class="row g-3">
  ${fields.map(f => `<div class="${f.t === 'a' ? 'col-12' : 'col-12 col-md-6 col-lg-4'}"><label class="form-label" for="${dom(f.k)}">${f.l}${f.r ? ' <span class="text-danger">*</span>' : ''}</label>${input(f)}<div class="invalid-feedback"></div></div>`).join('')}
  </div></div></div></div>`;
}).join('');

const get = () => Object.fromEntries([...document.querySelectorAll('[data-k]')].map(e => [e.dataset.k, e.value]));
let old = null, dirty = window.__dirty = false;

if (id) {
  document.getElementById('title').textContent = 'تعديل عقار';
  old = await getProperty(id, canOwner);
  if (!old) { document.getElementById('groups').innerHTML = '<div class="alert alert-danger">العقار غير موجود.</div>'; document.getElementById('save').hidden = true; }
  else {
    const vals = { ...flatten(old), ...flatten(old._priv || {}) };
    document.querySelectorAll('[data-k]').forEach(e => { const v = vals[e.dataset.k]; if (v != null) e.value = v; });
  }
}
const toggleBtn = document.getElementById('more');
toggleBtn.onclick = () => {
  const rest = GROUPS.slice(1).map(g => document.getElementById('g_' + g.id)).filter(Boolean);
  const open = rest.some(el => !el.classList.contains('show'));
  rest.forEach(el => bootstrap.Collapse.getOrCreateInstance(el, { toggle: false })[open ? 'show' : 'hide']());
  toggleBtn.textContent = open ? 'إخفاء التفاصيل الإضافية' : 'إظهار التفاصيل الإضافية';
};
document.getElementById('form').addEventListener('input', () => (dirty = window.__dirty = true));
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('save');
  if (btn.disabled) return;
  const values = get();
  const errs = validate(values);
  document.querySelectorAll('.is-invalid').forEach(x => x.classList.remove('is-invalid'));
  const keys = Object.keys(errs).filter(k => ALL_FIELDS.some(f => f.k === k && showField(f)));
  keys.forEach(k => { const el = document.getElementById(dom(k)); el.classList.add('is-invalid'); el.nextElementSibling.textContent = errs[k]; });
  if (keys.length) { document.getElementById(dom(keys[0])).scrollIntoView({ block: 'center' }); return toast('راجع الحقول المحددة.', 'danger'); }
  btn.disabled = true;
  try {
    const { pub, priv } = buildDoc(values);
    let target = id;
    if (id) {
      const fresh = await getProperty(id, false);
      if (fresh.updatedAt?.toMillis() !== old.updatedAt?.toMillis() && !confirm('عدّل عضو آخر هذا العقار أثناء فتحك له. هل تريد استبدال تعديلاته بتعديلاتك؟')) { btn.disabled = false; return; }
      await updateProperty(user, old, pub, priv, canOwner);
    } else target = await createProperty(user, pub, priv);
    dirty = window.__dirty = false;
    location.href = `property-details.html?id=${target}`;
  } catch (ex) { console.error(ex); toast('تعذّر الحفظ. بياناتك ما زالت في الاستمارة، حاول مرة أخرى.', 'danger'); btn.disabled = false; }
});
