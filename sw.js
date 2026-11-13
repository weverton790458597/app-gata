const V = 'psi-v5';
const ASSETS = ['./', 'index.html', 'style.css', 'desktop.css', 'fonts.css', 'app.js', 'storage.js', 'cloud.js', 'push.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit || c.match('index.html'));
    return hit || net;
  }));
});
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data.json(); } catch (x) { p = { title: 'Consultório', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(p.title || 'Consultório', {
    body: p.body || '', tag: p.tag, renotify: !!p.tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    silent: p.sound === false, vibrate: p.vibrate === false ? undefined : [200, 100, 200, 100, 300],
    data: { url: p.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs[0];
    if (c) { c.postMessage({ type: 'nav', url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
