// Service worker: caches every app file so Taskboard opens instantly and works fully offline.
// The deploy workflow replaces the VERSION placeholder with the commit hash, so each deploy gets a fresh cache
// and the app shows an "Update" prompt. Every file in this folder must be listed in ASSETS
// (the deploy workflow fails if one is missing).

const VERSION = '__BUILD_VERSION__';
const CACHE_PREFIX = 'taskboard-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/components/app-bar.css',
  './css/components/collections.css',
  './css/components/composer.css',
  './css/components/controls.css',
  './css/components/forms.css',
  './css/components/items.css',
  './css/components/overlays.css',
  './css/motion.css',
  './css/tokens.css',
  './css/utilities.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './js/app.js',
  './js/backup.js',
  './js/components.js',
  './js/constants.js',
  './js/db.js',
  './js/dispatch.js',
  './js/effects.js',
  './js/gestures.js',
  './js/icons.js',
  './js/motion.js',
  './js/prefs.js',
  './js/pwa.js',
  './js/router.js',
  './js/schema.js',
  './js/sheet.js',
  './js/store.js',
  './js/toast.js',
  './js/undo.js',
  './js/util.js',
  './js/vendor/idiomorph.esm.js',
  './js/views/home.js',
  './js/views/item.js',
  './js/views/project-settings.js',
  './js/views/project.js',
  './js/views/settings.js',
  './js/views/shared.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files.
  const requests = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  const deleteOldCaches = caches
    .keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))));
  event.waitUntil(deleteOldCaches.then(() => self.clients.claim()));
});

// The page sends this when the user taps "Update".
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => (cached === undefined ? fetch(request) : cached)));
});
