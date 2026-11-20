import { auth, db, onAuthStateChanged, doc, getDoc } from './firebase-config.js';
import { logout } from './auth.js';
import { escapeHtml } from './utils.js';

// ready: الصفحة منفذة. غير ذلك تظهر رسالة بالمرحلة المتوقعة.
const NAV = [
  { label: 'الرئيسية', icon: 'house', href: 'dashboard.html', ready: true },
  { label: 'جميع العقارات', icon: 'buildings', href: 'pages/properties.html', ready: true },
  { label: 'إضافة عقار', icon: 'plus-square', href: 'pages/add-property.html', ready: true },
  { label: 'عقارات للبيع', icon: 'tag', href: 'pages/properties.html?tx=sale', ready: true },
  { label: 'عقارات للإيجار', icon: 'key', href: 'pages/properties.html?tx=rent', ready: true },
  { label: 'العقارات المحجوزة', icon: 'bookmark-check', href: 'pages/properties.html?status=reserved', ready: true },
  { label: 'الأرشيف', icon: 'archive', href: 'pages/archive.html', ready: true },
  { label: 'البحث المتقدم', icon: 'funnel', href: 'pages/search.html', ready: true },
  { label: 'العملاء', icon: 'people', href: 'pages/customers.html', ready: true },
  { label: 'طلبات العملاء', icon: 'card-checklist', href: 'pages/requests.html', ready: true },
  { label: 'مطابقة العقارات', icon: 'diagram-3', href: 'pages/matching.html', ready: true },
  { label: 'المفضلة', icon: 'star', href: 'pages/favorites.html', ready: true },
  { label: 'ترحيل العروض', icon: 'arrow-repeat', href: 'pages/migration.html', ready: true, admin: true },
  { label: 'التقارير', icon: 'bar-chart', href: 'pages/reports.html', phase: 6, perm: 'canViewReports' },
  { label: 'سجل النشاطات', icon: 'clock-history', href: 'pages/activity.html', phase: 6, admin: true },
  { label: 'إدارة الفريق', icon: 'person-gear', href: 'pages/team.html', phase: 6, admin: true },
  { label: 'الإعدادات', icon: 'gear', href: 'pages/settings.html', phase: 6 }
];

export function toast(msg, type = 'dark') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toast-container position-fixed bottom-0 start-0 p-3'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white m-auto ms-2" data-bs-dismiss="toast" aria-label="إغلاق"></button></div>`;
  box.appendChild(el);
  new bootstrap.Toast(el, { delay: 3500 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

const allowed = (item, u) => (!item.admin || u.role === 'admin') && (!item.perm || u.role === 'admin' || u.permissions?.[item.perm] === true);

function shell(user, active) {
  const items = NAV.filter(i => allowed(i, user)).map(i => `
    <a class="nav-link ${i.href === active ? 'active' : ''}" href="${i.ready ? i.href : '#'}" ${i.ready ? '' : `data-soon="${i.phase}"`}>
      <i class="bi bi-${i.icon}"></i><span>${i.label}</span></a>`).join('');
  return `
  <header class="topbar d-lg-none">
    <button class="btn btn-icon" data-bs-toggle="offcanvas" data-bs-target="#sidebar" aria-label="القائمة"><i class="bi bi-list"></i></button>
    <strong>إدارة العقارات</strong>
  </header>
  <aside id="sidebar" class="sidebar offcanvas-lg offcanvas-start" tabindex="-1">
    <div class="sidebar-head"><i class="bi bi-building"></i><span>إدارة العقارات</span>
      <button class="btn-close btn-close-white d-lg-none me-auto" data-bs-dismiss="offcanvas" data-bs-target="#sidebar" aria-label="إغلاق"></button></div>
    <nav class="nav flex-column">${items}</nav>
    <div class="sidebar-foot">
      <div class="small text-white-50">${escapeHtml(user.name || '')}<br>${user.role === 'admin' ? 'مدير' : 'عضو'}</div>
      <button id="logout" class="nav-link w-100"><i class="bi bi-box-arrow-right"></i><span>تسجيل الخروج</span></button>
    </div>
  </aside>`;
}

/** حارس الصفحات: يتحقق من الدخول وحالة العضو، يرسم القائمة، ثم يُظهر الصفحة. */
export function guard({ base = '', adminOnly = false, active = '' } = {}) {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async fbUser => {
      const toLogin = () => location.replace(`${base}login.html`);
      if (!fbUser) return toLogin();
      const snap = await getDoc(doc(db, 'users', fbUser.uid)).catch(() => null);
      if (!snap?.exists() || snap.data().status !== 'active') { await logout(); return toLogin(); }
      const user = { uid: fbUser.uid, ...snap.data() };
      if (adminOnly && user.role !== 'admin') return location.replace(`${base}dashboard.html`);

      const main = document.getElementById('page-content');
      const wrap = document.createElement('div');
      wrap.className = 'app';
      wrap.innerHTML = shell(user, active).replaceAll('href="pages/', `href="${base}pages/`).replaceAll('href="dashboard', `href="${base}dashboard`);
      main.before(wrap); wrap.appendChild(main);
      main.hidden = false;
      document.body.classList.remove('booting');
      wrap.addEventListener('click', e => {
        const a = e.target.closest('[data-soon]');
        if (a) { e.preventDefault(); toast(`هذا القسم يتوفر في المرحلة ${a.dataset.soon}.`); }
      });
      document.getElementById('logout').addEventListener('click', async () => { await logout(); toLogin(); });
      resolve(user);
    });
  });
}
