// ════════════════════════════════════════════════
// Metro Highway — Service Worker
// App-shell caching: precache the shell on install,
// serve cache-first with network fallback, and clean
// up old caches on activate. Cross-origin requests
// (Google Fonts) are cached opportunistically but
// never block the app if offline.
// ════════════════════════════════════════════════

const CACHE_VERSION = 'metro-highway-v1.1.0';
const CACHE_NAME = `metro-highway-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon.ico',
  './css/style.css',
  './js/01-audio-engine.js',
  './js/02-humanize-drift-lofi.js',
  './js/03-synth-keyboard.js',
  './js/04-rhythm-machine.js',
  './js/05-user-presets.js',
  './js/06-sequencer-a.js',
  './js/07-sequencer-b.js',
  './js/09-humanize-ui.js',
  './js/10-lofi-motion-ui-init.js',
  './js/11-mixer-listeners.js',
  './js/12-oscilloscope.js',
  './js/13-led-blink.js',
  './js/14-panel-visibility.js',
  './js/15-wav-recording.js',
  './js/16a-racing-core.js',
  './js/16b-racing-loop.js',
  './js/16c-racing-car3d.js',
  './js/16d-racing-hud-controls.js',
  './js/16e-racing-engine-sound.js',
  './js/16f-racing-roadside.js',
  './js/16g-racing-touch.js',
  './js/17-auto-drone-engine.js',
  './js/18-manual.js',
  './js/19-app-update.js',
  './js/20-wake-lock.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/og-image.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache:'reload' = bypass the browser's HTTP cache, so a new version really precaches the
      // new files (GitHub Pages serves assets with max-age=600; plain addAll could store stale copies).
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('metro-highway-cache-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests; let everything else pass straight through.
  if (req.method !== 'GET') return;

  // version.json is how the page learns that a newer version exists, so it must
  // always come from the network — never from the cache. (Not handled here = browser fetches it.)
  if (new URL(req.url).pathname.endsWith('/version.json')) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req)
        .then(res => {
          // Only cache successful, basic (same-origin) or opaque (cross-origin,
          // e.g. Google Fonts) responses — never cache error responses.
          if (!res || res.status !== 200) return res;

          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => {
          // Offline and not cached: for navigations, fall back to the app shell.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        });
    })
  );
});
