const RELEASE = '__TIKZ_RELEASE__';
const SHELL_CACHE = `tikz-svg-shell-${RELEASE}`;
const SHELL = ['./', 'index.html', ...['app.js', 'assets.js', 'runner.js'].map(path => `${path}?v=${RELEASE}`)];
self.addEventListener('message', event => {
  if (event.data === 'app-release') event.source?.postMessage({release: RELEASE});
});
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map(path => new Request(path, {cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('tikz-svg-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const path = url.pathname;
    const root = new URL(self.registration.scope).pathname;
    const request = event.request.mode === 'navigate' && (path === root || path === root + 'index.html')
      ? './'
      : event.request;
    return await cache.match(request) || await fetch(event.request);
  })());
});
