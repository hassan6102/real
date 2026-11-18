import { guard, toast } from './layout.js';
import { listQuery, getDocs } from './services/properties.js';
import { onSnapshot } from './firebase-config.js';
import { cardHtml, bindCardActions } from './property-card.js';
import { attachFavorites } from './favorites-ui.js';

const archived = document.body.dataset.mode === 'archive';
const sp = new URLSearchParams(location.search);
const opts = { archived, tx: sp.get('tx') || undefined, status: sp.get('status') || undefined };
const user = await guard({ base: '../', active: archived ? 'pages/archive.html' : 'pages/properties.html' });
const TITLES = { sale: 'عقارات للبيع', rent: 'عقارات للإيجار' };
document.getElementById('title').textContent = archived ? 'الأرشيف' : opts.status === 'reserved' ? 'العقارات المحجوزة' : TITLES[opts.tx] || 'جميع العقارات';

const PAGE = 20;
let first = [], more = [], hasMore = false;
const byId = {};
function render() {
  const all = [...first, ...more];
  all.forEach(d => (byId[d.id] = d.data()));
  document.getElementById('count').textContent = all.length ? `تم تحميل ${all.length} عقار${hasMore ? ' (يوجد المزيد)' : ''}` : '';
  document.getElementById('list').innerHTML = all.length ? all.map(cardHtml).join('') :
    `<div class="empty w-100"><i class="bi bi-buildings"></i><p>${archived ? 'الأرشيف فارغ.' : 'لا توجد عقارات هنا بعد.'}</p>${archived ? '' : '<a class="btn btn-navy" href="add-property.html">إضافة عقار</a>'}</div>`;
  document.getElementById('more').hidden = !hasMore;
}
// الصفحة الأولى لحظية، وما بعدها يُجلب عند الطلب.
onSnapshot(listQuery(opts, PAGE), snap => {
  first = snap.docs; if (!more.length) hasMore = snap.size === PAGE; render();
}, e => { console.error(e); document.getElementById('list').innerHTML = '<div class="alert alert-danger w-100">تعذّر تحميل العقارات. إن كانت هذه أول مرة، تأكد من نشر الفهارس.</div>'; });
document.getElementById('more').onclick = async e => {
  e.target.disabled = true;
  try { const s = await getDocs(listQuery(opts, PAGE, more.at(-1) || first.at(-1))); more.push(...s.docs); hasMore = s.size === PAGE; render(); }
  catch (ex) { console.error(ex); toast('تعذّر تحميل المزيد.', 'danger'); }
  e.target.disabled = false;
};
bindCardActions(document.getElementById('list'), id => byId[id]);
attachFavorites(document.getElementById('list'), user, id => byId[id]);
