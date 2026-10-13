/* Ultimate Rewards SW — do not cache auth or HTML navigations */
const CACHE = 'ur-v2';
const ASSETS = ['/logo.png', '/manifest.json', '/styles.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/api')) return;
  if (e.request.mode === 'navigate') return; // always network for pages
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
