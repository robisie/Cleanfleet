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

    html = html.replace(/Wersja aplikacji:\s*v\d+\.\d+\.\d+(?:\s*beta)?/g, 'Wersja aplikacji: v1.20.15');

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
      html = html.replace(/function cfReminderBucket\(r, now=new Date\(\)\)\{[\s\S]*?\n\}/, fixedBucket);
    }

    html = html.replace(/<script src="\/app\/reminder-fix\.js\?v=\d+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather(?:-position|-rescue|-v2|-v3|-v4|-v5)?\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-view-fix-v1192\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-colors-v1196\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-signals-v1197\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-signals-v1198\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-signals-v1199\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-signals-v11910\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-signals-v11911\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/layout-v11912\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/layout-v11913\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/operations-v1200\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-tile-v1201\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-tile-fix-v1202\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-v1203\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/ui-v1209\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/ui-v1212\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-progress-v1213\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-click-v1214\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-add-v1215\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<!-- CF_WEATHER_SLOT_START -->[\s\S]*?<!-- CF_WEATHER_SLOT_END -->/g, '');

    html = html.replace(
      '<div class="search-box cf-main-search-box">',
      '<div class="search-box cf-main-search-box cf-main-search-row">'
    );

    const weatherSlot = `<!-- CF_WEATHER_SLOT_START -->
<style id="cfWeatherSlotBase">
#cfWeatherSlot{margin:8px 0 10px;background:#fff;border:1px solid #e6e9e7;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.035)}
#cfWeatherSlot .cf-weather-static{min-height:44px;display:flex;align-items:center;justify-content:center;padding:8px 12px;font:500 11px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#7a837d}
</style>
<section id="cfWeatherSlot" aria-label="Prognoza pogody"><div class="cf-weather-static">Nie udało się załadować prognozy pogody.</div></section>
<!-- CF_WEATHER_SLOT_END -->`;

    const searchRowTag = /<([a-zA-Z][\w:-]*)([^>]*\bclass=["'][^"']*\bcf-main-search-row\b[^"']*["'][^>]*)>/;
    if (searchRowTag.test(html)) {
      html = html.replace(searchRowTag, `${weatherSlot}\n$&`);
    } else {
      const bodyOpen = /<body([^>]*)>/i;
      html = html.replace(bodyOpen, `$&\n${weatherSlot}`);
    }

    const injectedScripts = '<script src="/app/weather-v5.js?v=20260915-2"></script>\n<script src="/app/weather-signals-v11911.js?v=20260915-1"></script>\n<script src="/app/layout-v11913.js?v=20260915-1"></script>\n<script src="/app/operations-v1200.js?v=20260915-1"></script>\n<script src="/app/calendar-v1203.js?v=20260915-12"></script>\n<script src="/app/ui-v1209.js?v=20260915-3"></script>\n<script src="/app/photo-progress-v1213.js?v=20260915-1"></script>\n<script src="/app/calendar-add-v1215.js?v=20260915-1"></script>';
    if (html.includes('</body>')) html = html.replace('</body>', `${injectedScripts}\n</body>`);
    else html += injectedScripts;

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store, no-cache, must-revalidate');
    return new Response(html, {status:response.status,statusText:response.statusText,headers});
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { body: event.data ? event.data.text() : '' }; }

  const title = data.title || '💬 CleanFleet';
  const appUrl = data.url || '/app/';
  const options = {
    body: data.body || 'Nowa wiadomość w chacie CleanFleet',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || ('cleanfleet-chat-' + Date.now()),
    renotify: true,
    data: {url:appUrl,washRecordId:data.washRecordId||null,plate:data.plate||''}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || '/app/', self.location.origin);
  if (data.washRecordId) targetUrl.searchParams.set('cfOpenRecord', data.washRecordId);

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const targetPath = targetUrl.pathname;
    for (const client of clientsList) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === targetUrl.origin && clientUrl.pathname.startsWith(targetPath)) {
          if (client.url !== targetUrl.href && 'navigate' in client) await client.navigate(targetUrl.href);
          if ('focus' in client) await client.focus();
          return;
        }
      } catch (_) {}
    }
    for (const client of clientsList) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === targetUrl.origin) {
          if ('navigate' in client) await client.navigate(targetUrl.href);
          if ('focus' in client) await client.focus();
          return;
        }
      } catch (_) {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl.href);
  })());
});