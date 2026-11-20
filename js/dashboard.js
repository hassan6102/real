import { db, collection, query, where, orderBy, limit, onSnapshot, getCountFromServer } from './firebase-config.js';
import { guard } from './layout.js';
import { escapeHtml, fmtNumber, fmtDateTime, actionText, PROPERTY_TYPES, TRANSACTION_TYPES, STATUSES, ACTIVE_REQUEST_STATUSES } from './utils.js';

const P = () => collection(db, 'properties');
const CARDS = [
  { id: 'total', label: 'إجمالي العقارات', icon: 'buildings', q: () => query(P()) },
  { id: 'sale', label: 'متاح للبيع', icon: 'tag', q: () => query(P(), where('status', '==', 'available'), where('transactionType', '==', 'sale')) },
  { id: 'rent', label: 'متاح للإيجار', icon: 'key', q: () => query(P(), where('status', '==', 'available'), where('transactionType', 'in', ['rent_new', 'rent_old'])) },
  { id: 'reserved', label: 'محجوز', icon: 'bookmark-check', q: () => query(P(), where('status', '==', 'reserved')) },
  { id: 'sold', label: 'تم البيع', icon: 'check2-circle', q: () => query(P(), where('status', '==', 'sold')) },
  { id: 'rented', label: 'تم التأجير', icon: 'check2-all', q: () => query(P(), where('status', '==', 'rented')) },
  { id: 'customers', label: 'إجمالي العملاء', icon: 'people', q: () => query(collection(db, 'customers')) },
  { id: 'requests', label: 'طلبات نشطة', icon: 'card-checklist', q: () => query(collection(db, 'customerRequests'), where('status', 'in', ACTIVE_REQUEST_STATUSES)) }
];

const CACHE_KEY = 'dash-counts', TTL = 60_000;
const cached = () => { try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY)); return c && Date.now() - c.t < TTL ? c.v : null; } catch { return null; } };

function drawCards(values, error) {
  document.getElementById('stats').innerHTML = CARDS.map(c => `
    <div class="col-6 col-md-4 col-xl-3"><div class="stat">
      <i class="bi bi-${c.icon}"></i>
      <div><div class="stat-value">${error ? '—' : fmtNumber(values?.[c.id])}</div><div class="stat-label">${c.label}</div></div>
    </div></div>`).join('');
}

async function loadCounts(force) {
  const hit = !force && cached();
  if (hit) return drawCards(hit);
  try {
    const res = await Promise.all(CARDS.map(c => getCountFromServer(c.q())));
    const v = Object.fromEntries(CARDS.map((c, i) => [c.id, res[i].data().count]));
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v }));
    drawCards(v);
  } catch (e) { console.error(e); drawCards(null, true); document.getElementById('stats-error').hidden = false; }
}

const empty = (icon, text) => `<div class="empty"><i class="bi bi-${icon}"></i><p>${text}</p></div>`;

function watchActivity() {
  onSnapshot(query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc'), limit(10)), snap => {
    const box = document.getElementById('activity');
    box.innerHTML = snap.empty ? empty('clock-history', 'لا توجد نشاطات بعد. ستظهر هنا عمليات الفريق فور حدوثها.')
      : snap.docs.map(d => { const a = d.data(); return `<li><div><strong>${escapeHtml(a.userName || 'عضو')}</strong> ${actionText(a.action)} ${escapeHtml(a.entityLabel || '')}</div><small>${fmtDateTime(a.createdAt)}</small></li>`; }).join('');
  }, e => { console.error(e); document.getElementById('activity').innerHTML = empty('exclamation-triangle', 'تعذّر تحميل النشاطات.'); });
}

function watchRecent() {
  onSnapshot(query(P(), orderBy('createdAt', 'desc'), limit(10)), snap => {
    const box = document.getElementById('recent');
    box.innerHTML = snap.empty ? empty('buildings', 'لم تُسجَّل عقارات بعد. أضف أول عقار ليظهر لجميع الفريق.')
      : snap.docs.map(d => { const p = d.data(); return `<li><a href="pages/property-details.html?id=${d.id}" class="d-block text-reset text-decoration-none">
          <div><strong>${escapeHtml(p.propertyNo != null ? String(p.propertyNo) : (p.code || ''))}</strong> ${PROPERTY_TYPES[p.propertyType] || ''} ${TRANSACTION_TYPES[p.transactionType] ? '- ' + TRANSACTION_TYPES[p.transactionType] : ''}</div>
          <small>${escapeHtml(p.location?.district || p.location?.street || '')} ${p.price != null ? '· ' + fmtNumber(p.price) + ' جنيه' : ''} · ${STATUSES[p.status] || ''}</small></a></li>`; }).join('');
  }, e => { console.error(e); document.getElementById('recent').innerHTML = empty('exclamation-triangle', 'تعذّر تحميل العقارات.'); });
}

const user = await guard({ active: 'dashboard.html' });
document.getElementById('hello').textContent = `أهلًا ${user.name || ''}`;
drawCards(null);
loadCounts();
watchActivity();
watchRecent();
document.getElementById('refresh').addEventListener('click', () => loadCounts(true));
