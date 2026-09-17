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

  if (url.pathname === '/app/weather.html') {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  if (url.pathname === '/app/calendar.html') {
    event.respondWith((async () => {
      const response = await fetch(req, { cache: 'no-store' });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('text/html')) return response;
      let html = await response.text();

      html = html.replace(/\/app\/calendar-engine\.js\?v=[^"']+/g, '/app/calendar-engine.js?v=20260917-4');

      html = html.replace(
        "if(c&&String(e.company_id||'')!==c)return false;",
        "if(c==='__PRIVATE__'){if(e.kind!=='reminder'||e.company_id)return false;}else if(c&&String(e.company_id||'')!==c)return false;"
      );
      html = html.replace(
        "$('companyFilter').innerHTML='<option value=\"\">Wszystkie firmy</option>'+data.companies.map",
        "$('companyFilter').innerHTML='<option value=\"\">Wszystkie firmy</option><option value=\"__PRIVATE__\">Prywatne</option>'+data.companies.map"
      );
      html = html.replace(
        "$('companyFilter').value=current&&data.companies.some(c=>String(c.id)===current)?current:'';",
        "$('companyFilter').value=(current==='__PRIVATE__'||(current&&data.companies.some(c=>String(c.id)===current)))?current:'';"
      );

      html = html.replace(/<script src="\/app\/reminder-form-v1251\.js\?v=[^"]+"><\/script>/g, '');
      html = html.replace(/<script src="\/app\/calendar-touch-v1251\.js\?v=[^"]+"><\/script>/g, '');
      html = html.replace(/<script src="\/app\/calendar-reminder-edit-v1261\.js\?v=[^"]+"><\/script>/g, '');
      html = html.replace(/<script src="\/app\/calendar-ageing-dnd-v1270\.js\?v=[^"]+"><\/script>/g, '');
      const calendarScripts = '<script src="/app/reminder-form-v1251.js?v=20260917-3"></script>\n' +
        '<script src="/app/calendar-touch-v1251.js?v=20260917-3"></script>\n' +
        '<script src="/app/calendar-reminder-edit-v1261.js?v=20260917-1"></script>\n' +
        '<script src="/app/calendar-ageing-dnd-v1270.js?v=20260917-2"></script>';
      if (html.includes('</body>')) html = html.replace('</body>', `${calendarScripts}\n</body>`);
      else html += calendarScripts;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.set('cache-control', 'no-store, no-cache, must-revalidate');
      return new Response(html, {status:response.status,statusText:response.statusText,headers});
    })());
    return;
  }

  event.respondWith((async () => {
    const response = await fetch(req, { cache: 'no-store' });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.includes('text/html')) return response;

    let html = await response.text();

    html = html.replace(/Wersja aplikacji:\s*v\d+\.\d+\.\d+(?:\s*beta)?/g, 'Wersja aplikacji: v1.30.2');

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

    if (html.includes(originalBucket)) html = html.replace(originalBucket, fixedBucket);
    else html = html.replace(/function cfReminderBucket\(r, now=new Date\(\)\)\{[\s\S]*?\n\}/, fixedBucket);

    html = html.replace("case 'todo': return r.zlecone && !r.data_prania;", "case 'todo': return !r.zatwierdzone;");
    html = html.replace("case 'todo': return !r.data_prania;", "case 'todo': return !r.zatwierdzone;");
    html = html.replace("const pendingOrders=records.filter(r=>r.zlecone && !r.data_prania).length;", "const pendingOrders=activeRecords().filter(r=>!r.zatwierdzone).length;");
    html = html.replace("const pendingOrders=records.filter(r=>!r.data_prania).length;", "const pendingOrders=activeRecords().filter(r=>!r.zatwierdzone).length;");

    html = html.replace(
      "if (!items.length || !items.some(x => x.value > 0)) {",
      "if (!items.length) {"
    );

    html = html.replace("let mainStatusFilter = 'all';", "let mainStatusFilter = 'todo';");
    html = html.replace('<option value="todo">Do wykonania</option>', '<option value="todo" selected>Do wykonania</option>');

    html = html.replace(
      `async function cfEnterCompany(companyId){\n  if(!companyId) return;`,
      `async function cfEnterCompany(companyId){\n  if(!companyId) return;\n  try{localStorage.setItem('cf-last-active-view-v2',JSON.stringify({view:'company',companyId:String(companyId)}));}catch(_){}\n  mainStatusFilter = 'todo';\n  const cfMainStatusSelect = document.getElementById('mainStatusFilter');\n  if(cfMainStatusSelect) cfMainStatusSelect.value = 'todo';`
    );

    html = html.replace(
      `async function cfShowCompanyChooser(){\n  if(!(cfIsAdmin() || cfIsFleetEmployee())) return;`,
      `async function cfShowCompanyChooser(){\n  if(!(cfIsAdmin() || cfIsFleetEmployee())) return;\n  if(cfIsAdmin()){try{localStorage.setItem('cf-last-active-view-v2',JSON.stringify({view:'admin'}));}catch(_){}}`
    );

    html = html.replace(
      `async function cfStartForCurrentUser(){\n  if(cfIsAdmin()){`,
      `async function cfStartForCurrentUser(){\n  if(cfIsAdmin()){\n    const cfForceCompanyChooser=new URLSearchParams(location.search).get('cfCompanyChooser')==='1';\n    let cfLastView=null;\n    try{cfLastView=JSON.parse(localStorage.getItem('cf-last-active-view-v2')||'null');}catch(_){cfLastView=null;}\n    if(cfForceCompanyChooser || cfLastView?.view==='admin'){\n      cfForgetActiveCompany();\n      cfSetCompanyContext(null);\n      try{\n        const cfUrl=new URL(location.href);\n        cfUrl.searchParams.delete('cfCompanyChooser');\n        history.replaceState(null,'',cfUrl.pathname+cfUrl.search+cfUrl.hash);\n      }catch(_){ }\n      await cfShowCompanyChooser();\n      return;\n    }\n    if(cfLastView?.view==='company' && cfLastView.companyId){\n      try{\n        await cfLoadAdminCompanies();\n        const cfLastCompany=cfCompanies.find(c=>String(c.id)===String(cfLastView.companyId));\n        if(cfLastCompany){\n          await cfEnterCompany(cfLastCompany.id);\n          return;\n        }\n      }catch(err){console.warn('CleanFleet last view:',err);}\n    }`
    );

    html = html.replace(/<script src="\/app\/reminder-fix\.js\?v=\d+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/reminder-form-v1251\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather(?:-position|-rescue|-v2|-v3|-v4|-v5|-v6)?\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/weather-refresh-v12311\.js\?v=[^"]+"><\/script>/g, '');
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
    html = html.replace(/<script src="\/app\/photo-queue-v1210\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-queue-v1211\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-queue-v1212\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-queue-v1217\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-queue-v1220\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-export-v1230\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-local-v1240\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-local-ui-v1232\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/photo-camera-v1213\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/completion-guard-v1236\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-click-v1214\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-add-v1215\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-weather-v1217\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-weather-v1218\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/calendar-today-tile-v1262\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<script src="\/app\/admin-dashboard-v1270\.js\?v=[^"]+"><\/script>/g, '');
    html = html.replace(/<!-- CF_WEATHER_SLOT_START -->[\s\S]*?<!-- CF_WEATHER_SLOT_END -->/g, '');

    html = html.replace('<div class="search-box cf-main-search-box">','<div class="search-box cf-main-search-box cf-main-search-row">');

    const weatherSlot = `<!-- CF_WEATHER_SLOT_START -->
<style id="cfWeatherSlotBase">
#cfWeatherSlot{margin:8px 0 10px;background:#fff;border:1px solid #e6e9e7;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.035)}
#cfWeatherSlot .cf-weather-static{min-height:44px;display:flex;align-items:center;justify-content:center;padding:8px 12px;font:500 11px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#7a837d}
</style>
<section id="cfWeatherSlot" aria-label="Prognoza pogody"><div class="cf-weather-static">Nie udało się załadować prognozy pogody.</div></section>
<!-- CF_WEATHER_SLOT_END -->`;

    const searchRowTag = /<([a-zA-Z][\w:-]*)([^>]*\bclass=["'][^"']*\bcf-main-search-row\b[^"']*["'][^>]*)>/;
    if (searchRowTag.test(html)) html = html.replace(searchRowTag, `${weatherSlot}\n$&`);
    else html = html.replace(/<body([^>]*)>/i, `$&\n${weatherSlot}`);

    const injectedScripts = '<script src="/app/weather-v6.js?v=20260916-1"></script>\n' +
      '<script src="/app/weather-refresh-v12311.js?v=20260916-1"></script>\n' +
      '<script src="/app/layout-v11913.js?v=20260917-2"></script>\n' +
      '<script src="/app/operations-v1200.js?v=20260915-1"></script>\n' +
      '<script src="/app/photo-local-v1240.js?v=20260916-2"></script>\n' +
      '<script src="/app/photo-local-ui-v1232.js?v=20260916-5"></script>\n' +
      '<script src="/app/photo-camera-v1213.js?v=20260916-3"></script>\n' +
      '<script src="/app/completion-guard-v1236.js?v=20260916-4"></script>\n' +
      '<script src="/app/calendar-v1203.js?v=20260917-2"></script>\n' +
      '<script src="/app/ui-v1209.js?v=20260915-3"></script>\n' +
      '<script src="/app/calendar-add-v1215.js?v=20260915-2"></script>\n' +
      '<script src="/app/calendar-weather-v1218.js?v=20260916-3"></script>\n' +
      '<script src="/app/reminder-form-v1251.js?v=20260917-3"></script>\n' +
      '<script src="/app/calendar-today-tile-v1262.js?v=20260917-5"></script>\n' +
      '<script src="/app/admin-dashboard-v1270.js?v=20260917-11"></script>';
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
