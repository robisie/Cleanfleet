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
    const response = await fetch(req, { cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('text/html')) return response;

    let html = await response.text();

    // Patch the reminder bucket function BEFORE the application code executes.
    // This avoids the previous timing issue where a late hotfix ran only after
    // the reminders view had already been rendered using remind_at.
    const originalBucket = `function cfReminderBucket(r, now=new Date()){
  if(r.status==='done' || r.status==='cancelled') return 'done';
  const at=new Date(cfReminderEffectiveAt(r));
  if(Number.isNaN(at.getTime())) return 'upcoming';
  const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const nextDay=new Date(dayStart); nextDay.setDate(nextDay.getDate()+1);
  if(at < now) return 'overdue';
  if(at < nextDay) return 'today';
  return 'upcoming';
}`;

    const fixedBucket = `function cfReminderBucket(r, now=new Date()){
  if(r.status==='done' || r.status==='cancelled') return 'done';
  const raw=r.due_at || ((r.status==='snoozed' && r.snoozed_until) ? r.snoozed_until : r.remind_at);
  const at=new Date(raw);
  if(Number.isNaN(at.getTime())) return 'upcoming';
  const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const nextDay=new Date(dayStart); nextDay.setDate(nextDay.getDate()+1);
  const dueDay=new Date(at.getFullYear(),at.getMonth(),at.getDate());
  if(dueDay < dayStart) return 'overdue';
  if(dueDay < nextDay) return 'today';
  return 'upcoming';
}`;

    if (html.includes(originalBucket)) {
      html = html.replace(originalBucket, fixedBucket);
    } else {
      // Fallback for formatting differences in index.html.
      html = html.replace(
        /function cfReminderBucket\(r, now=new Date\(\)\)\{[\s\S]*?\n\}/,
        fixedBucket
      );
    }

    // Remove the old late-running hotfix if it was previously injected.
    html = html.replace(/<script src="\/app\/reminder-fix\.js\?v=\d+"><\/script>/g, '');

    // Inject the lightweight weather module. Keep it separate from index.html so
    // weather logic can evolve without touching the main 1 MB application file.
    html = html.replace(/<script src="\/app\/weather\.js\?v=[^"]+"><\/script>/g, '');
    const weatherScript = '<script src="/app/weather.js?v=20260915-1"></script>';
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${weatherScript}\n</body>`);
    } else {
      html += weatherScript;
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store, no-cache, must-revalidate');
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
