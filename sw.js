self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'CleanFleet',
      body: event.data ? event.data.text() : ''
    };
  }

  const title = data.title || 'CleanFleet';

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'cleanfleet',

    // Nie zapisujemy tutaj "/" jako adresu aplikacji.
    // Prawidłowy adres zostanie ustalony przy kliknięciu.
    data: {
      url: data.url || ''
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const scopeUrl = new URL(self.registration.scope);

      let targetUrl = scopeUrl.href;

      const notificationUrl = event.notification.data?.url;

      if (notificationUrl && notificationUrl !== '/') {
        try {
          const candidate = new URL(notificationUrl, scopeUrl);

          // Nie pozwalamy wyjść poza domenę aplikacji.
          if (candidate.origin === scopeUrl.origin) {
            targetUrl = candidate.href;
          }
        } catch (e) {
          targetUrl = scopeUrl.href;
        }
      }

      const clientList = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // Najpierw szukamy już otwartej CleanFleet.
      for (const client of clientList) {
        if (
          client.url &&
          client.url.startsWith(scopeUrl.origin) &&
          'focus' in client
        ) {
          if ('navigate' in client && client.url !== targetUrl) {
            try {
              await client.navigate(targetUrl);
            } catch (e) {
              console.error('CleanFleet notification navigation error:', e);
            }
          }

          return client.focus();
        }
      }

      // Jeżeli aplikacja nie jest otwarta — otwieramy ją.
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })()
  );
});
