self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return;

  event.respondWith((async () => {
    const response = await fetch(req);
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('text/html')) return response;

    let html = await response.text();
    if (!html.includes('/app/reminder-fix.js')) {
      html = html.replace('</body>', '<script src="/app/reminder-fix.js?v=2"></script></body>');
    } else {
      html = html.replace('/app/reminder-fix.js?v=1', '/app/reminder-fix.js?v=2');
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '💬 CleanFleet';
  const appUrl = data.url || '/app/';

  const options = {
    body: data.body || 'Nowa wiadomość w chacie CleanFleet',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || ('cleanfleet-chat-' + Date.now()),
    renotify: true,
    data: {
      url: appUrl,
      washRecordId: data.washRecordId || null,
      plate: data.plate || ''
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || '/app/', self.location.origin);

  if (data.washRecordId) {
    targetUrl.searchParams.set('cfOpenRecord', data.washRecordId);
  }

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    const targetPath = targetUrl.pathname;

    for (const client of clientsList) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === targetUrl.origin && clientUrl.pathname.startsWith(targetPath)) {
          if (client.url !== targetUrl.href && 'navigate' in client) {
            await client.navigate(targetUrl.href);
          }
          if ('focus' in client) {
            await client.focus();
          }
          return;
        }
      } catch (_) {}
    }

    for (const client of clientsList) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === targetUrl.origin) {
          if ('navigate' in client) {
            await client.navigate(targetUrl.href);
          }
          if ('focus' in client) {
            await client.focus();
          }
          return;
        }
      } catch (_) {}
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl.href);
    }
  })());
});
