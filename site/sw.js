/* HAUL service worker.
 * - App shell: precached, served stale-while-revalidate.
 * - data/data.json: network-first (query string ignored for the cache key), cached copy offline.
 * - Leaflet (unpkg) + Esri/OSM tiles: cache-first runtime caches (tiles capped).
 * - Camera images / NWS icons: not intercepted (always live).
 * All paths are relative to the SW location, so it works under /haul/ on GitHub Pages.
 * Bump VERSION whenever shell files change.
 */
const VERSION = 'haul-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = 'haul-data';      // unversioned: keep last good data across deploys
const RUNTIME_CACHE = 'haul-runtime'; // leaflet lib
const TILE_CACHE = 'haul-tiles-v2';   // renamed so activate() purges cached CARTO watermark tiles
const TILE_HOSTS = ['server.arcgisonline.com', 'tile.openstreetmap.org'];
const TILE_MAX = 400;

const SCOPE = self.registration.scope; // e.g. https://user.github.io/haul/
const DATA_URL = new URL('data/data.json', SCOPE).href;
const INDEX_URL = new URL('index.html', SCOPE).href;

const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icon.svg',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
  'js/util.js', 'js/derive.js', 'js/consts.js', 'js/icons.js', 'js/camimg.js', 'js/viewer.js',
  'js/views/go.js', 'js/views/cams.js', 'js/views/map.js', 'js/views/weather.js',
  'js/views/checklist.js', 'js/views/notices.js',
].map((p) => new URL(p, SCOPE).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Fetch with cache: 'reload' so we never precache a stale HTTP-cached copy.
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch { /* one missing file must not break install */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE, RUNTIME_CACHE, TILE_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('haul') && !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.href.startsWith(SCOPE)) {
    if (url.pathname.endsWith('/data/data.json')) { event.respondWith(dataNetworkFirst(req)); return; }
    if (req.mode === 'navigate') { event.respondWith(navigation(req)); return; }
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }
  if (url.hostname === 'unpkg.com') { event.respondWith(cacheFirst(req, RUNTIME_CACHE)); return; }
  if (TILE_HOSTS.includes(url.hostname)) { event.respondWith(tileCacheFirst(req)); }
  // Everything else (camera JPEGs, NWS icons, external links) goes straight to the network.
});

async function dataNetworkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) {
      await cache.put(DATA_URL, res.clone()); // store under the query-less URL
      return res;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const cached = await cache.match(DATA_URL);
    if (!cached) throw err;
    // Tag it so the app can show the offline banner.
    const headers = new Headers(cached.headers);
    headers.set('x-haul-cache', 'hit');
    return new Response(await cached.blob(), { status: 200, statusText: 'OK (cached)', headers });
  }
}

async function navigation(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(INDEX_URL, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(INDEX_URL)) || (await cache.match(new URL('./', SCOPE).href)) || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req.url.split('?')[0], res.clone());
    return res;
  }).catch(() => null);
  if (cached) return cached;
  return (await network) || Response.error();
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function tileCacheFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      await cache.put(req, res.clone());
      trim(cache);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_MAX) return;
  await Promise.all(keys.slice(0, keys.length - TILE_MAX).map((k) => cache.delete(k)));
}
