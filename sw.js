// Offline play. Every file the game needs is kept under a version that
// tools/stamp-sw.mjs writes in (a hash of their contents), so a deploy with
// any change installs fresh copies all at once, and the old cache goes
// once the new one takes over. Pages are served from the cache first.

const VERSION = 'mr-53bae169a198';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'vendor/matter.min.js',
  'fonts/mona-sans-latin-wdth-normal.woff2',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/actions.js',
  'js/art/draw.js',
  'js/art/pieces.js',
  'js/art/shapes.js',
  'js/audio/chimes.js',
  'js/audio/engine.js',
  'js/audio/impacts.js',
  'js/audio/rolling.js',
  'js/behaviors.js',
  'js/board.js',
  'js/config.js',
  'js/fx.js',
  'js/history.js',
  'js/input.js',
  'js/main.js',
  'js/music.js',
  'js/orientation.js',
  'js/pause.js',
  'js/pieces/catalog.js',
  'js/pieces/geometry.js',
  'js/pieces/piece.js',
  'js/placement.js',
  'js/polyfills.js',
  'js/prefs.js',
  'js/presets.js',
  'js/render.js',
  'js/save.js',
  'js/share.js',
  'js/theme.js',
  'js/ui/coach.js',
  'js/ui/confirm.js',
  'js/ui/focus.js',
  'js/ui/icons.js',
  'js/ui/palette.js',
  'js/ui/saveload.js',
  'js/ui/splash.js',
  'js/ui/splashToy.js',
  'js/ui/toast.js',
  'js/ui/toolbar.js',
  'js/viewport.js',
  'js/world.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mr-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // any page load (?test, a shared #b= link...) is the game's one page
  const page = req.mode === 'navigate';
  event.respondWith(
    caches.open(VERSION)
      .then(cache => cache.match(page ? './' : req, { ignoreSearch: page }))
      .then(hit => hit || fetch(req)),
  );
});
