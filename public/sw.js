const CACHE_NAME = 'flupflap-pwa-v2';
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/flupflap_pwa_icon_logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
];
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Offline | FlupFlap</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0b2341; }
      main { text-align: center; padding: 24px; }
      h1 { margin: 0 0 8px; }
      p { margin: 0; color: #334155; }
    </style>
  </head>
  <body>
    <main>
      <h1>Offline</h1>
      <p>FlupFlap is unavailable while offline.</p>
    </main>
  </body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          if (cachedPage) return cachedPage;
          const cachedHome = await caches.match('/');
          if (cachedHome) return cachedHome;
          return new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }),
    );
    return;
  }

  if (!isSameOrigin) return;
  if (!['script', 'style', 'image', 'font'].includes(event.request.destination)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => cached ?? new Response('', { status: 503, statusText: 'Network Unavailable' }));

      return cached || fetchPromise;
    }),
  );
});
