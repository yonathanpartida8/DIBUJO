// Service worker — offline-first app shell for Dibujo PWA.
const VERSION = 'dibujo-v4.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

// Core files that make the app usable offline.
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/reset.css',
  './css/theme.css',
  './css/layout.css',
  './css/components.css',
  './css/canvas.css',
  './js/app.js',
  './js/core/bus.js',
  './js/core/store.js',
  './js/core/db.js',
  './js/core/i18n.js',
  './js/core/router.js',
  './js/core/sync.js',
  './js/core/ui.js',
  './js/core/utils.js',
  './js/core/theme-apply.js',
  './js/core/firebase.js',
  './js/core/sounds.js',
  './js/drawing/engine.js',
  './js/drawing/brushes.js',
  './js/drawing/paint.js',
  './js/drawing/layers.js',
  './js/drawing/history.js',
  './js/drawing/floodfill.js',
  './js/drawing/color.js',
  './js/drawing/recorder.js',
  './js/drawing/player.js',
  './js/drawing/ruler.js',
  './js/gl/aurora.js',
  './js/media/klipy.js',
  './js/ui/icons.js',
  './js/ui/home.js',
  './js/ui/login.js',
  './js/ui/widgets.js',
  './js/ui/vinyl.js',
  './js/ui/assets.js',
  './js/ui/achievements-ui.js',
  './js/ui/studio.js',
  './js/ui/gallery.js',
  './js/ui/chat.js',
  './js/ui/us.js',
  './js/ui/settings.js',
  './js/ui/player-ui.js',
  './js/ui/onboarding.js',
  './js/couples/features.js',
  './js/couples/achievements.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    // El SDK de Firebase (URLs versionadas de gstatic) sí se cachea para
    // arranque offline; el resto de externos (API de GIFs, CDNs) va solo a red.
    if (url.hostname === 'www.gstatic.com') {
      event.respondWith(
        caches.match(req).then((cached) => cached || fetch(req).then((res) => {
          if (res && res.status === 200) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
          return res;
        }))
      );
      return;
    }
    event.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
    return;
  }

  // App-shell navigations: serve cached index for offline SPA routing.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
