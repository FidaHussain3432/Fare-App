/* =====================================================
   FAREFLOW — SERVICE WORKER (PWA) v4.2.0
   =====================================================
   v4.2.0 UPDATES:
   • Cache version bumped (v4.0.0 → v4.2.0) so users
     receive the new CSS/JS/HTML automatically
   • Auto-reload open tabs when a new version activates
   • Preserved: everything from v4.0.0

   v4.0.0:
   • Global shared data model support
   • Cache-first for static assets
   • Network-first for Firebase / API calls
   • Auto-update on version bump
   • Offline fallback to index.html
   • PNG icons precache (install requirement)
   • Stale-while-revalidate for HTML
   • Auto-cleanup old caches on activate
   ===================================================== */

const CACHE_VERSION = 'fareflow-v4.2.0';
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

/* =====================================================
   INSTALL
   ===================================================== */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // Individual add() calls so one bad URL doesn't break the whole precache
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

/* =====================================================
   ACTIVATE
   =====================================================
   • Deletes old caches
   • Takes control of open clients
   • (New) Notifies open tabs to reload once so they
     pick up the fresh HTML/CSS/JS
   ===================================================== */
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
    )
    .then(() => self.clients.claim())
    .then(() => {
      /* Notify all open tabs that a new version is live.
         app.js listens for this and can reload gracefully.
         If no listener exists, we still call clients.claim()
         so future navigations use the new SW. */
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
          clients.forEach(client => {
            try {
              client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
            } catch (e) { /* ignore */ }
          });
        });
    })
  );
});

/* =====================================================
   FETCH STRATEGY
   =====================================================
   • Skip non-GET and non-http(s)
   • Skip Firebase / Google APIs (auth must hit network)
   • HTML navigations → network-first, fallback to cache
   • Static assets → stale-while-revalidate
   ===================================================== */
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

/* =====================================================
   MESSAGE — force update
   ===================================================== */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/* =====================================================
   OPTIONAL: notification click (future use)
   ===================================================== */
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