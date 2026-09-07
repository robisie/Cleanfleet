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

    // Najpierw próbujemy znaleźć już otwartą aplikację /app/.
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

    // Jeśli nie ma otwartej /app/, ale jest inne okno tej samej domeny,
    // nawigujemy je do właściwej aplikacji.
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

    // W przeciwnym razie otwieramy nowe okno.
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl.href);
    }
  })());
});
