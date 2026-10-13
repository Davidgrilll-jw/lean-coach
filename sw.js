// Service worker: makes the app shell available offline.
// Bump CACHE when shipping a new version so old files are dropped.
const CACHE = 'lean-coach-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/config.js',
  './js/data/defaults.js',
  './js/data/foods.js',
  './js/domain/dates.js',
  './js/domain/nutrition.js',
  './js/domain/plateau.js',
  './js/domain/report.js',
  './js/domain/validate.js',
  './js/domain/weight.js',
  './js/domain/workout.js',
  './js/pages/activity.js',
  './js/pages/body.js',
  './js/pages/dashboard.js',
  './js/pages/food.js',
  './js/pages/photos.js',
  './js/pages/report.js',
  './js/pages/settings.js',
  './js/pages/workout.js',
  './js/services/insights.js',
  './js/services/supabase.js',
  './js/services/sync.js',
  './js/services/syncCore.js',
  './js/store/adapters.js',
  './js/store/repo.js',
  './js/ui/charts.js',
  './js/ui/components.js',
  './js/ui/dom.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates show up immediately when online; cache when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});
