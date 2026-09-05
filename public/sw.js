/* Brokly PWA service worker
 * Cache strategy:
 *  - _next/static assets: cache-first (immutable hashed filenames)
 *  - icons/fonts/images: cache-first
 *  - page navigations: network-first (8s timeout) with offline fallback
 *  - API requests + Supabase + _next/data (RSC payloads): network-only, NEVER cached
 *  2026-09-05: v1.2.0 — bypass _next/data to kill stale-chunk infinite loads,
 *  navigation timeout so flaky networks fall back instead of hanging.
 */
const VERSION = 'brokly-v1.2.0';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Navigation network timeout — hanging fetch must fall back, never spin forever.
const NAV_TIMEOUT_MS = 8000;

function fetchWithTimeout(request, ms) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('nav-timeout')), ms)),
  ]);
}

const STATIC_ASSETS = [
  '/icons/icon-192-v2.png',
  '/icons/icon-512-v2.png',
  '/icons/icon-maskable-512-v2.png',
  '/icons/apple-touch-icon-v2.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  if (!(self.Notification || {}).permission) {
    try {
      if (Notification.permission !== 'granted') return;
    } catch {
      return;
    }
  }
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Brokly', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Brokly';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192-v2.png',
    badge: '/icons/icon-192-v2.png',
    data: { url: payload.url || '/' },
    vibrate: [100, 50, 100],
    tag: payload.tag || '',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Cross-origin (Supabase, CDNs, tracking) — never touch, always network.
  if (url.origin !== self.location.origin) return;
  // Explicit Supabase bypass (in case REST is ever same-origin proxied).
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) return;

  // Never cache API calls, RSC flight payloads, or non-GET requests.
  // /_next/data/* MUST stay network-only: caching it serves stale page data
  // and dead buildIds after deploys (infinite loading / frozen pages).
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/data/')) return;
  if (url.pathname.endsWith('/revalidate')) return;

  // App shell navigations: network-first with TIMEOUT + offline fallback.
  // The timeout is the freeze fix: a hanging network must fall back to cache
  // instead of leaving the page loading forever.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(request, NAV_TIMEOUT_MS)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || caches.match(request).then((r) => r || Response.error()))
        )
    );
    return;
  }

  // Hashed static chunks: cache-first (immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Icons, images, fonts: cache-first
  if (/\.(png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else (same-origin docs, manifest, misc): network-first with
  // runtime-cache fallback. Kept OUT of STATIC_CACHE so generic responses can
  // never poison immutable-asset lookups or survive version purges wrongly.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
