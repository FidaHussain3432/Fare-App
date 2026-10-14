/* =====================================================
   FAREFLOW — SERVICE WORKER (PWA)
   • Cache-first for static assets
   • Network-first for Firebase / API calls
   • Auto-update on version bump
   • Offline fallback to index.html
   ===================================================== */

const CACHE_VERSION = 'fareflow-v1.0.0';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

/* ---------- STATIC ASSETS TO PRE-CACHE ---------- */
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase.js',
  './three-bg.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('⚠️ SW precache partial:', err))
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- FETCH STRATEGY ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET
  if (req.method !== 'GET') return;

  // Skip Firebase / Google APIs (network-only, never cache auth)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('cloudfunctions.net')
  ) {
    return; // let browser handle normally
  }

  // HTML → network-first, fallback to cache
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Static assets → cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});

/* ---------- MESSAGE: force update ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});