// Daybook service worker.
//  - App shell: cache-first, refreshed in the background (so a deploy shows up on the next launch).
//  - /api/* and Supabase REST: network-first, cached copy only when offline.
//  - Supabase Auth and Storage (signed URLs): never cached.
// Bump VERSION when the shell file list changes; old caches are deleted on activate.
const VERSION = 'v1';
const SHELL_CACHE = `daybook-shell-${VERSION}`;
const DATA_CACHE = `daybook-data-${VERSION}`;
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js';
const SHELL = [
  '/', '/index.html', '/styles.css', '/app.js', '/lib.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png',
  SUPABASE_JS,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-data') event.waitUntil(caches.delete(DATA_CACHE));
});

async function shellFirst(request, cacheKey) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(cacheKey || request);
  const refresh = fetch(request).then((res) => {
    if (res.ok) cache.put(cacheKey || request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await refresh) || new Response('Offline', { status: 503 });
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache auth or storage (signed URLs are short-lived and private).
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.pathname.startsWith('/rest/v1/')) event.respondWith(networkFirst(request));
    return;
  }
  if (url.href === SUPABASE_JS) { event.respondWith(shellFirst(request)); return; }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // OAuth callback and other navigations must hit the network; data GETs are network-first.
    if (request.mode === 'navigate') return;
    event.respondWith(networkFirst(request));
    return;
  }
  if (request.mode === 'navigate') { event.respondWith(shellFirst(request, '/')); return; }
  if (SHELL.includes(url.pathname)) event.respondWith(shellFirst(request, url.pathname));
});
