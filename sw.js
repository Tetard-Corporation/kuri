// Service worker — offline-first app shell caching.
const VERSION = 'kuri-v13';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/maskable.svg',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/router.js',
  './js/ui.js',
  './js/parse.js',
  './js/import.js',
  './js/backup.js',
  './js/feedback.js',
  './js/seasonal.js',
  './js/ideas.js',
  './js/mashup.js',
  './js/views/recipes.js',
  './js/views/recipe.js',
  './js/views/edit.js',
  './js/views/cook.js',
  './js/views/lists.js',
  './js/views/list.js',
  './js/views/shopping.js',
  './js/views/importView.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Network-first for cross-origin (imports, OCR CDN) with cache fallback.
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for same-origin app shell, falling back to network then index.
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    )
  );
});
