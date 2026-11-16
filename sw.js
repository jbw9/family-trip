// Network first so changes show up right away; the saved copy is used only with no connection.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
    e.respondWith(fetch(e.request).then(r => {
        if (r.ok) {
            const copy = r.clone();
            caches.open('trip').then(c => c.put(e.request, copy));
        }
        return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
