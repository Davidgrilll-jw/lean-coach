// App shell: start-up, hash router and navigation.
import * as activity from './pages/activity.js';
import * as body from './pages/body.js';
import * as dashboard from './pages/dashboard.js';
import * as food from './pages/food.js';
import * as photos from './pages/photos.js';
import * as report from './pages/report.js';
import * as settings from './pages/settings.js';
import * as workout from './pages/workout.js';
import * as repo from './store/repo.js';
import { esc, icon } from './ui/dom.js';

const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', short: 'หน้าหลัก', icon: 'home', page: dashboard, primary: true },
  { id: 'food', label: 'อาหาร', short: 'อาหาร', icon: 'food', page: food, primary: true },
  { id: 'body', label: 'น้ำหนักและรอบเอว', short: 'น้ำหนัก', icon: 'scale', page: body, primary: true },
  { id: 'workout', label: 'ตารางเวท', short: 'เวท', icon: 'dumbbell', page: workout, primary: true },
  { id: 'activity', label: 'กิจกรรม', short: 'กิจกรรม', icon: 'activity', page: activity },
  { id: 'report', label: 'รายงาน', short: 'รายงาน', icon: 'report', page: report },
  { id: 'photos', label: 'ภาพเปรียบเทียบ', short: 'ภาพ', icon: 'camera', page: photos },
  { id: 'settings', label: 'ตั้งค่า', short: 'ตั้งค่า', icon: 'settings', page: settings },
];

const view = () => document.getElementById('view');
let current = null;
let storage = { persistent: true };

function routeId() {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.some((r) => r.id === id) ? id : 'dashboard';
}

const app = {
  navigate(id) {
    if (routeId() === id) app.refresh();
    else location.hash = `#/${id}`;
  },
  /** Re-render the current page, keeping the scroll position. */
  refresh() {
    const y = window.scrollY;
    renderPage();
    window.scrollTo(0, y);
  },
};

function renderNav() {
  const id = routeId();
  const link = (r, cls) =>
    `<a href="#/${r.id}" class="${cls}${r.id === id ? ' active' : ''}" ${r.id === id ? 'aria-current="page"' : ''}>${icon(r.icon)}<span>${esc(cls === 'tab' ? r.short : r.label)}</span></a>`;
  document.getElementById('sidebar-nav').innerHTML = ROUTES.map((r) => link(r, 'side-link')).join('');
  const moreActive = !ROUTES.find((r) => r.id === id).primary;
  document.getElementById('tabbar').innerHTML =
    ROUTES.filter((r) => r.primary).map((r) => link(r, 'tab')).join('') +
    `<button type="button" class="tab${moreActive ? ' active' : ''}" id="more-btn" aria-haspopup="true" aria-expanded="false">${icon('more')}<span>เพิ่มเติม</span></button>`;
  document.getElementById('more-menu').innerHTML = ROUTES.filter((r) => !r.primary).map((r) => link(r, 'more-link')).join('');
}

function setMore(open) {
  document.getElementById('more-menu').hidden = !open;
  document.getElementById('more-btn')?.setAttribute('aria-expanded', String(open));
}

function renderPage() {
  const route = ROUTES.find((r) => r.id === routeId());
  const root = view();
  if (current && current !== route && current.page.leave) current.page.leave();
  current = route;
  // Pages attach handlers as root.on*; reset so nothing leaks between pages.
  root.onclick = root.onsubmit = root.oninput = root.onchange = null;
  try {
    route.page.render(root, app);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="card error-card"><h2>หน้านี้แสดงผลไม่ได้</h2><p>${esc(err.message)}</p><button class="btn btn-primary" id="retry">ลองใหม่</button></div>`;
    root.querySelector('#retry').onclick = () => app.refresh();
  }
  document.title = `${route.label} · Lean Coach`;
}

function onRoute() {
  setMore(false);
  renderNav();
  renderPage();
  window.scrollTo(0, 0);
}

async function start() {
  try {
    storage = await repo.init();
  } catch (err) {
    console.error(err);
    view().innerHTML = `<div class="card error-card"><h2>เปิดฐานข้อมูลไม่ได้</h2><p>${esc(err.message)}</p><p>ลองปิดแท็บอื่นของแอปนี้แล้วโหลดหน้าใหม่</p></div>`;
    return;
  }
  document.getElementById('storage-warning').hidden = storage.persistent;

  document.addEventListener('click', (e) => {
    if (e.target.closest('#more-btn')) setMore(document.getElementById('more-menu').hidden);
    else setMore(false);
  });
  window.addEventListener('hashchange', onRoute);

  let lastWidth = window.innerWidth;
  let timer = null;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => !document.querySelector('dialog[open]') && app.refresh(), 200);
  });

  onRoute();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker registration failed:', err));
  }
}

start();
