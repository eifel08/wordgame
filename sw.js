// Bump CACHE whenever any file in ASSETS changes, so installed apps pick up the new version.
const CACHE = 'wordwall-v2';

const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/ui.js',
  'js/games/matching.js',
  'js/games/quiz.js',
  'js/games/flashcards.js',
  'js/games/scramble.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Bypass the HTTP cache so a new version never precaches stale files.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith('wordwall-') && name !== CACHE).map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = request.mode === 'navigate'
      ? await cache.match('index.html')
      : await cache.match(request, { ignoreSearch: true });
    return cached || fetch(request);
  })());
});
