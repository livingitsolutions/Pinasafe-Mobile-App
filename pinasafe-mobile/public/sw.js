/* PinaSafe service worker: caches only public static files. Reports, accounts and API data are never cached. */
const CACHE = 'pinasafe-static-v1';
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
const STATIC_PATH = /^\/(_expo\/static\/|assets\/|icons\/|fonts\/)/;
const STATIC_FILE = /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|ttf|otf|woff2?)$/i;
const PRIVATE_PATH = /^\/(api|auth|rest|storage|functions|realtime)(\/|$)/i;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('pinasafe-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheableStatic(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has('authorization')) return false;
  if (url.search && !url.pathname.startsWith('/_expo/static/')) return false;
  if (PRIVATE_PATH.test(url.pathname)) return false;
  return STATIC_PATH.test(url.pathname) || STATIC_FILE.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  if (!isCacheableStatic(request, url)) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const noStore = /no-store|private/i.test(response.headers.get('cache-control') || '');
      if (response.ok && response.type === 'basic' && !noStore) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })),
  );
});
