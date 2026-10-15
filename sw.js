/* =====================================================
   FAREFLOW — SERVICE WORKER (PWA) v3.0.0
   • Cache-first for static assets
   • Network-first for Firebase / API calls
   • Auto-update on version bump
   • Offline fallback to index.html
   • FIX v3.0: PNG icons precache (install requirement)
   • FIX v3.0: Stale-while-revalidate for HTML
   • FIX v3.0: Auto-cleanup old caches on activate
   ===================================================== */

const CACHE_VERSION = 'fareflow-v3.0.0';
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
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Use individual add() calls so one bad URL doesn't break the whole precache
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(new Request(url, { cache: 'reload' }))
              .catch(err => console.warn('⚠️ SW precache skip:', url, err.message))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => {
            console.log('🧹 SW deleting old cache:', k);
            return caches.delete(k);
          })
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

  // Skip browser extensions / chrome-extension etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Skip Firebase / Google APIs (network-only, never cache auth)
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('firebaseapp.com')
  ) {
    return; // let browser handle normally
  }

  // HTML navigations → network-first, fallback to cache
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(r => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // Static assets → stale-while-revalidate (fast + fresh)
  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req)
        .then(res => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);

      // Serve cached immediately if available, refresh in background
      return cached || networkFetch;
    })
  );
});

/* ---------- MESSAGE: force update ---------- */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- OPTIONAL: notification click (future use) ---------- */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});