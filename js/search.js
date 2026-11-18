import { guard, toast } from './layout.js';
import { PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES, escapeHtml, fmtNumber } from './utils.js';
import { FINISHING } from './property-model.js';
import { SORTS, FACILITIES, FLOOR_FLAGS, cleanFilters, serverPlan, clientMatch, collect, describeFilters } from './search-model.js';
import { pageFetcher, exactCount, saveSearch, listSaved, deleteSaved } from './services/search.js';
import { cardHtml, bindCardActions } from './property-card.js';
import { attachFavorites } from './favorites-ui.js';

const user = await guard({ base: '../', active: 'pages/search.html' });
const form = document.getElementById('form'), $ = id => document.getElementById(id);

const chips = (name, opts) => `<div class="chips">${Object.entries(opts).map(([v, l]) => `<label class="chip"><input type="checkbox" name="${name}" value="${v}"><span>${l}</span></label>`).join('')}</div>`;
const num = (name, ph) => `<input class="form-control" name="${name}" inputmode="decimal" placeholder="${ph}" autocomplete="off">`;
const txt = (name, ph) => `<input class="form-control" name="${name}" placeholder="${ph}" autocomplete="off">`;
const dt = name => `<input type="date" class="form-control" name="${name}">`;
const cnt = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5+' };
const sec = (t, body, cols = 'col-12 col-lg-6') => `<div class="${cols}"><div class="fsec"><h3>${t}</h3>${body}</div></div>`;
const two = (a, b) => `<div class="row g-2"><div class="col">${a}</div><div class="col">${b}</div></div>`;

$('fields').innerHTML = [
  sec('نوع العملية والعقار', chips('tx', TRANSACTION_TYPES) + chips('types', PROPERTY_TYPES)),
  sec('الموقع', two(txt('governorate', 'المحافظة'), txt('city', 'المدينة (تطابق كامل)')) + `<div class="mt-2">${txt('districts', 'المناطق (افصل بفاصلة)')}</div><div class="mt-2">${txt('street', 'الشارع')}</div>`),
  sec('السعر والمساحة', two(num('priceMin', 'السعر من'), num('priceMax', 'السعر إلى')) + `<div class="mt-2">${two(num('areaMin', 'المساحة من'), num('areaMax', 'المساحة إلى'))}</div>`),
  sec('الدور', two(num('floorMin', 'الدور من'), num('floorMax', 'الدور إلى')) + chips('floorFlags', FLOOR_FLAGS)),
  sec('الغرف والحمامات والريسبشن', `<small>الغرف</small>${chips('rooms', cnt)}<small>الحمامات</small>${chips('bathrooms', cnt)}<small>الريسبشن</small>${chips('receptions', cnt)}`),
  sec('التشطيب', chips('finishing', FINISHING)),
  sec('المرافق', chips('facilities', Object.fromEntries(Object.entries(FACILITIES).map(([k, v]) => [k, v[0]])))),
  sec('إضافية', two(num('yearMin', 'سنة البناء من'), num('yearMax', 'سنة البناء إلى')) + `<div class="mt-2">${txt('addedBy', 'اسم العضو الذي أضافه')}</div>
    <div class="mt-2"><select class="form-select" name="status"><option value="">الحالة: المتاحة والمحجوزة (الافتراضي)</option>${Object.entries(STATUSES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    <div class="mt-2"><small>تاريخ الإضافة</small>${two(dt('addedFrom'), dt('addedTo'))}</div><div class="mt-2"><small>آخر تحديث</small>${two(dt('updatedFrom'), dt('updatedTo'))}</div>`)
].join('');
$('sort').innerHTML = Object.entries(SORTS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
if (innerWidth >= 992) $('filters').classList.add('show');

const raw = () => { const r = {}; for (const e of form.elements) { if (!e.name) continue; if (e.type === 'checkbox') { if (e.checked) (r[e.name] ??= []).push(e.value); } else r[e.name] = e.value; } return r; };
const fill = f => { for (const e of form.elements) { if (!e.name) continue; const v = f[e.name]; if (e.type === 'checkbox') e.checked = Array.isArray(v) && v.includes(e.value); else e.value = v ?? ''; } };

let filters = {}, plan = null, state = null, byId = {}, running = false, seq = 0;

function renderChips() {
  const d = describeFilters(filters);
  $('active').innerHTML = d.map((c, i) => `<button type="button" class="btn btn-sm btn-outline-secondary" data-i="${i}">${escapeHtml(c.label)} <i class="bi bi-x"></i></button>`).join('');
  $('active').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; d[b.dataset.i].keys.forEach(k => delete filters[k]); fill(filters); run(); };
}
function renderResults(total) {
  const r = state.results; r.forEach(d => (byId[d.id] = d.data()));
  $('count').textContent = r.length || state.exhausted ? (total != null ? `تم العثور على ${fmtNumber(total)} عقارًا مطابقًا.` : state.exhausted ? `تم العثور على ${r.length} عقارًا مطابقًا.` : `تم العثور على ${r.length} عقارًا حتى الآن.`) : '';
  $('list').innerHTML = r.length ? r.map(cardHtml).join('') : state.exhausted ? '<div class="empty w-100"><i class="bi bi-search"></i><p>لا توجد عقارات مطابقة. جرّب تخفيف بعض الفلاتر.</p></div>' : '';
  $('more').hidden = state.exhausted;
  $('note').textContent = !state.exhausted ? `تم فحص ${state.scanned} عقارًا${r.length ? '' : ' دون نتائج مطابقة'}. اضغط "متابعة البحث" لفحص المزيد.` : '';
}
async function step(first) {
  if (running) return; running = true; const my = seq; $('go').disabled = $('more').disabled = true; $('spin').hidden = false;
  try {
    const prev = first ? { results: [], cursor: null, scanned: 0 } : state;
    const r = await collect({ fetchPage: pageFetcher(plan), match: p => clientMatch(p, filters), cursor: prev.cursor });
    if (my !== seq) return;
    const total = plan.exactCount ? (first ? await exactCount(plan).catch(() => null) : prev.total) : null;
    state = { results: [...prev.results, ...r.results], cursor: r.cursor, scanned: prev.scanned + r.scanned, exhausted: r.exhausted, total };
    renderResults(total);
  } catch (e) { console.error(e); $('list').innerHTML = '<div class="alert alert-danger w-100">تعذّر البحث. إن كانت هذه أول مرة، انشر الفهارس ثم أعد المحاولة (راجع README).</div>'; }
  finally { running = false; $('go').disabled = $('more').disabled = false; $('spin').hidden = true; }
}
function run() {
  filters = cleanFilters(raw()); plan = serverPlan(filters, $('sort').value); seq++; running = false;
  renderChips(); step(true);
}
form.addEventListener('submit', e => { e.preventDefault(); run(); });
$('sort').onchange = run;
$('more').onclick = () => step(false);
$('reset').onclick = () => { form.reset(); $('sort').value = 'newest'; run(); };
bindCardActions($('list'), id => byId[id]);
attachFavorites($('list'), user, id => byId[id]);

async function loadSaved() {
  const s = await listSaved(user).catch(() => []);
  $('saved').innerHTML = s.length ? s.map(x => `<div class="d-flex align-items-center gap-1 mb-1"><button class="btn btn-sm btn-outline-secondary flex-grow-1 text-start" data-load="${x.id}">${escapeHtml(x.name)}</button><button class="btn btn-sm btn-outline-danger" data-del="${x.id}" aria-label="حذف"><i class="bi bi-trash"></i></button></div>`).join('') : '<small class="text-muted">لا توجد أبحاث محفوظة.</small>';
  $('saved').onclick = async e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (l) { const x = s.find(i => i.id === l.dataset.load); form.reset(); fill(x.filters); $('sort').value = x.sort in SORTS ? x.sort : 'newest'; run(); }
    if (d && confirm('حذف هذا البحث المحفوظ؟')) { await deleteSaved(d.dataset.del); loadSaved(); }
  };
}
$('save').onclick = async () => {
  if (!Object.keys(cleanFilters(raw())).length) return toast('اختر فلاتر أولًا ثم احفظ البحث.', 'warning');
  const name = prompt('اسم البحث (مثال: شقق للبيع في الخانكة أقل من مليون)');
  if (!name?.trim()) return;
  try { await saveSearch(user, name.trim(), cleanFilters(raw()), $('sort').value); toast('تم حفظ البحث.', 'success'); loadSaved(); } catch (e) { console.error(e); toast('تعذّر حفظ البحث.', 'danger'); }
};
loadSaved(); run();
