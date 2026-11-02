// Offline support. Pages load network-first (so deploys show up right away);
// versioned assets are served from the cache.
const VERSION = '2.0.0';
const CACHE = `fcs-${VERSION}`;
const SHELL = [
  './',
  './manifest.webmanifest',
  './assets/css/app.css?v=2.0.0',
  './assets/js/theme.js?v=2.0.0',
  './assets/vendor/supabase.js?v=2.0.0',
  './assets/js/main.js?v=2.0.0',
  './assets/js/config.js?v=2.0.0',
  './assets/js/ui.js?v=2.0.0',
  './assets/js/nav.js?v=2.0.0',
  './assets/js/store.js?v=2.0.0',
  './assets/js/auth.js?v=2.0.0',
  './assets/js/fsrs.js?v=2.0.0',
  './assets/js/session.js?v=2.0.0',
  './assets/js/answer.js?v=2.0.0',
  './assets/js/csv.js?v=2.0.0',
  './assets/js/samples.js?v=2.0.0',
  './assets/js/theme-switch.js?v=2.0.0',
  './assets/js/views/home.js?v=2.0.0',
  './assets/js/views/deck.js?v=2.0.0',
  './assets/js/views/editor.js?v=2.0.0',
  './assets/js/views/study.js?v=2.0.0',
  './assets/js/views/flashcards.js?v=2.0.0',
  './assets/js/views/test.js?v=2.0.0',
  './assets/js/views/match.js?v=2.0.0',
  './assets/js/views/settings.js?v=2.0.0',
  './assets/js/views/auth.js?v=2.0.0',
  './assets/img/icon-192.png',
  './assets/img/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('fcs-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put('./', copy));
          }
          return response;
        })
        .catch(() => caches.match('./').then(hit => hit || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok && url.search.includes('v=')) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
