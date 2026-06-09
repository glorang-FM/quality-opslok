const SHELL_CACHE = 'quality-opslok-shell-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try { await cache.add('/'); } catch {}
      const manifest = self.__WB_MANIFEST;
      await Promise.allSettled(
        manifest.map(entry => cache.add(typeof entry === 'string' ? entry : entry.url))
      );
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k)));
      await clients.claim();
    })()
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}

  const title = data.title || 'Quality OpsLok';
  const options = {
    body:    data.body  || '',
    icon:    data.icon  || '/icons/icon-192.png',
    badge:   data.badge || '/icons/icon-96.png',
    data:    { url: data.url || '/' },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return;
  if (request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const root = await cache.match('/') || await cache.match('/index.html');
          if (root) return root;
        }
        return Response.error();
      }
    })()
  );
});
