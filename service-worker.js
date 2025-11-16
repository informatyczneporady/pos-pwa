const CACHE = 'pos-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE ? caches.delete(key) : null)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(request, respClone));
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
