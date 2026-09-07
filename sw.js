self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {
      body: event.data ? event.data.text() : ''
    };
  }

  const title = data.title || '💬 CleanFleet';

  const options = {
    body: data.body || 'Nowa wiadomość w chacie CleanFleet',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || ('cleanfleet-chat-' + Date.now()),
    renotify: true,

    data: {
      url: data.url || './index.html',
      washRecordId: data.washRecordId || null,
      plate: data.plate || ''
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});


self.addEventListener('notificationclick', event => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.url || './index.html';

  event.waitUntil(
    (async () => {

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of clients) {
        if ('focus' in client) {

          try {
            if (data.washRecordId) {
              const url = new URL(
                target,
                self.location.origin
              );

              url.searchParams.set(
                'cfOpenRecord',
                data.washRecordId
              );

              await client.navigate(url.href);
            }
          } catch (_) {}

          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {

        const url = new URL(
          target,
          self.location.origin
        );

        if (data.washRecordId) {
          url.searchParams.set(
            'cfOpenRecord',
            data.washRecordId
          );
        }

        await self.clients.openWindow(url.href);
      }

    })()
  );
});
