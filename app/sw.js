// CleanFleet v1.30.41 — monthly PDF moved out of runtime HTML patch.
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


    const cfMonthPdfReplacement = "async function cfGenerateMonthSummaryPdf(view){\n    if(!view) throw new Error('Brak danych raportu.');\n    if(!window.jspdf?.jsPDF) throw new Error('Biblioteka PDF jest niedostępna. Odśwież aplikację.');\n    const {jsPDF}=window.jspdf;\n    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});\n    if(window.CFReportFont){\n      doc.addFileToVFS('CleanFleet.ttf',window.CFReportFont);\n      doc.addFont('CleanFleet.ttf','CleanFleet','normal');\n      doc.setFont('CleanFleet');\n    }\n\n    const pageWidth=doc.internal.pageSize.getWidth(),pageHeight=doc.internal.pageSize.getHeight();\n    const margin=10,contentWidth=pageWidth-margin*2;\n    const colors={\n      green:[147,183,13], teal:[22,179,154], blue:[58,142,219], amber:[240,165,26],\n      violet:[116,88,200], red:[223,109,116], ink:[20,23,21], muted:[96,105,115],\n      line:[229,234,229], pale:[247,249,247], paleGreen:[239,246,229]\n    };\n    const palette=[colors.green,colors.teal,colors.blue,colors.amber,colors.violet,colors.red];\n\n    const rawLogo=document.querySelector('.app-logo')?.src||'';\n    const lightLogo=await (async()=>{\n      if(!rawLogo) return '';\n      try{\n        return await new Promise(resolve=>{\n          const img=new Image();img.crossOrigin='anonymous';\n          img.onload=()=>{\n            try{\n              const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;\n              const ctx=c.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);\n              const d=ctx.getImageData(0,0,c.width,c.height);\n              for(let i=0;i<d.data.length;i+=4){\n                const r=d.data[i],g=d.data[i+1],b=d.data[i+2],a=d.data[i+3];\n                if(a>20&&r>205&&g>205&&b>205&&Math.max(r,g,b)-Math.min(r,g,b)<34){\n                  d.data[i]=22;d.data[i+1]=25;d.data[i+2]=22;\n                }\n              }\n              ctx.putImageData(d,0,0);resolve(c.toDataURL('image/png'));\n            }catch(_){resolve(rawLogo);}\n          };\n          img.onerror=()=>resolve(rawLogo);img.src=rawLogo;\n        });\n      }catch(_){return rawLogo;}\n    })();\n\n    const txt=(text,x,y,size=9,color=colors.ink,align)=>{\n      doc.setTextColor(...color);doc.setFontSize(size);doc.text(String(text??''),x,y,align?{align}:undefined);\n    };\n    const card=(x,y,w,h,fill=[255,255,255],stroke=colors.line,r=3)=>{\n      doc.setFillColor(...fill);doc.setDrawColor(...stroke);doc.roundedRect(x,y,w,h,r,r,'FD');\n    };\n    const header=()=>{\n      doc.setFillColor(255,255,255);doc.rect(0,0,pageWidth,37,'F');\n      if(lightLogo){\n        try{\n          const p=doc.getImageProperties(lightLogo),ratio=p.width/p.height;let w=57,h=w/ratio;\n          if(h>22){h=22;w=h*ratio;}\n          doc.addImage(lightLogo,'PNG',margin,7,w,h,undefined,'FAST');\n        }catch(_){}\n      }\n      txt('Podsumowanie miesiąca',pageWidth-margin,15,15,colors.ink,'right');\n      txt('CleanFleet · '+cfMonthReportPdfLabel(view.month),pageWidth-margin,23,8.5,colors.muted,'right');\n      doc.setFillColor(...colors.green);doc.rect(0,36,pageWidth,1.7,'F');\n      return 44;\n    };\n    const section=(title,y,color=colors.green)=>{\n      doc.setFillColor(...color);doc.roundedRect(margin,y-3,2.2,8,1.1,1.1,'F');\n      txt(title,margin+6,y+3,11.5,colors.ink);return y+9;\n    };\n    const footer=()=>{\n      const pages=doc.getNumberOfPages();\n      for(let p=1;p<=pages;p++){\n        doc.setPage(p);doc.setDrawColor(220,226,229);doc.line(margin,pageHeight-11,pageWidth-margin,pageHeight-11);\n        txt('CleanFleet · Podsumowanie miesiąca',margin,pageHeight-6,7,colors.muted);\n        txt(p+' / '+pages,pageWidth-margin,pageHeight-6,7,colors.muted,'right');\n      }\n    };\n\n    let y=header();\n\n    const filterGap=4,filterW=(contentWidth-filterGap)/2;\n    [['Miesiąc',cfMonthReportPdfLabel(view.month)],['Wykonał',view.performerLabel||'Wszyscy']].forEach((it,i)=>{\n      const x=margin+i*(filterW+filterGap);card(x,y,filterW,18,colors.pale,colors.line,3);\n      txt(it[0],x+4,y+6,7,colors.muted);txt(it[1]||'—',x+4,y+14,10,colors.ink);\n    });\n    y+=25;\n\n    y=section('Podsumowanie',y);\n    const typeOrder=['SOLÓWKA','ZESTAW','BUS','BUS C','OSOBOWE'];\n    const typeKeys=[...typeOrder,...Object.keys(view.vehicleTypeCounts||{}).filter(type=>!typeOrder.includes(type))]\n      .filter((type,index,array)=>array.indexOf(type)===index&&Object.prototype.hasOwnProperty.call(view.vehicleTypeCounts||{},type));\n    const summaryCards=[\n      {label:'Liczba prań',value:view.baseCount,color:colors.green},\n      ...typeKeys.map((type,i)=>({label:type,value:view.vehicleTypeCounts[type],color:palette[(i+1)%palette.length]})),\n      {label:'Wartość',value:fmtMoney(view.total),color:colors.blue},\n      {label:'Do zapłaty',value:fmtMoney(view.outstanding),color:colors.amber}\n    ];\n    const cols=2,gap=4,cw=(contentWidth-gap)/2,ch=22;\n    summaryCards.forEach((it,i)=>{\n      const col=i%2,row=Math.floor(i/2),x=margin+col*(cw+gap),cy=y+row*(ch+4);\n      card(x,cy,cw,ch,[255,255,255],colors.line,3);\n      doc.setFillColor(...colors.paleGreen);doc.circle(x+9,cy+11,5.7,'F');\n      doc.setFillColor(...it.color);doc.circle(x+9,cy+11,2,'F');\n      txt(it.label,x+18,cy+8,7.3,colors.muted);\n      txt(it.value,x+18,cy+17,11.2,colors.ink);\n    });\n    y+=Math.ceil(summaryCards.length/2)*(ch+4)+3;\n\n    if(typeKeys.length){\n      if(y>210){doc.addPage();y=header();}\n      y=section('Struktura typów pojazdów',y,colors.teal);\n      const chartH=Math.min(58,18+typeKeys.length*8);\n      card(margin,y,contentWidth,chartH,[255,255,255],colors.line,3);\n      const max=Math.max(1,...typeKeys.map(k=>Number(view.vehicleTypeCounts[k])||0));\n      typeKeys.slice(0,6).forEach((type,i)=>{\n        const value=Number(view.vehicleTypeCounts[type])||0,yy=y+10+i*8,barX=margin+52,barW=contentWidth-78;\n        txt(type,margin+5,yy+2,7.4,colors.ink);\n        doc.setFillColor(237,241,239);doc.roundedRect(barX,yy-3,barW,5,2.5,2.5,'F');\n        doc.setFillColor(...palette[i%palette.length]);doc.roundedRect(barX,yy-3,Math.max(2,barW*value/max),5,2.5,2.5,'F');\n        txt(value,pageWidth-margin-5,yy+2,7.6,colors.ink,'right');\n      });\n      y+=chartH+7;\n    }\n\n    if(y>212){doc.addPage();y=header();}\n    y=section('Szczegóły usług · '+view.rows.length+' wpisów',y,colors.blue);\n\n    const tableRows=view.rows.map(r=>[\n      r.typ||'—',r.tablica||'—',fmtDate(r.data_prania),fmtMoney(r.koszt),r.zaplacone?'TAK':'NIE'\n    ]);\n    doc.autoTable({\n      head:[['Typ','Tablica','Data prania','Kwota','Rozliczone']],\n      body:tableRows,\n      startY:y,\n      margin:{top:44,bottom:18,left:margin,right:margin},\n      styles:{\n        font:window.CFReportFont?'CleanFleet':'helvetica',fontStyle:'normal',fontSize:8,\n        textColor:[35,39,36],cellPadding:2.5,lineColor:[232,236,233],lineWidth:.15,overflow:'linebreak',valign:'middle'\n      },\n      headStyles:{fillColor:[245,248,246],textColor:[31,36,32],fontStyle:'normal',lineColor:[210,221,209],lineWidth:.2},\n      alternateRowStyles:{fillColor:[250,251,250]},\n      rowPageBreak:'avoid',showHead:'everyPage',\n      didDrawPage:()=>header()\n    });\n    y=doc.lastAutoTable.finalY+7;\n\n    const busSum=view.rows.filter(r=>String(r.typ||'').trim().toUpperCase()==='BUS').reduce((sum,r)=>sum+(Number(r.koszt)||0),0);\n    const otherSum=view.rows.filter(r=>String(r.typ||'').trim().toUpperCase()!=='BUS').reduce((sum,r)=>sum+(Number(r.koszt)||0),0);\n    if(y>pageHeight-48){doc.addPage();y=header();}\n    y=section('Rozliczenie',y,colors.amber);\n    [['Suma - Bus',busSum,colors.teal],['Suma - pozostałe',otherSum,colors.blue]].forEach((it,i)=>{\n      const x=margin+i*(filterW+filterGap);card(x,y,filterW,22,[255,255,255],colors.line,3);\n      doc.setFillColor(...it[2]);doc.roundedRect(x,y,3,22,1.5,1.5,'F');\n      txt(it[0],x+8,y+8,7.5,colors.muted);txt(fmtMoney(it[1]),x+8,y+17,11,colors.ink);\n    });\n\n    footer();\n    const safePerformer=String(view.performerLabel||'wszyscy').replace(/[^a-zA-Z0-9._-]+/g,'_');\n    const safeType=view.activeType==='__ALL__'?'wszystkie':String(view.activeType).replace(/[^a-zA-Z0-9._-]+/g,'_');\n    doc.save(\\`CleanFleet-podsumowanie-\\${view.month}-\\${safePerformer}-\\${safeType}.pdf\\`);\n    return doc;\n  }\n\n  function showMonthReport(){";
    html = html.replace(
      /async function cfGenerateMonthSummaryPdf\(view\)\{[\s\S]*?\n  \}\n\n  function showMonthReport\(\)\{/,
      cfMonthPdfReplacement
    );

    html = html.replace(/Wersja aplikacji:\s*v\d+\.\d+\.\d+(?:\s*beta)?/g, 'Wersja aplikacji: v1.30.41');

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
      '<script src="/app/operations-v1200.js?v=20260919-13032"></script>\n' +
      '<script src="/app/photo-local-v1240.js?v=20260919-13032"></script>\n' +
      '<script src="/app/photo-local-ui-v1232.js?v=20260919-13032"></script>\n' +
      '<script src="/app/photo-camera-v1213.js?v=20260919-13032"></script>\n' +
      '<script src="/app/completion-guard-v1236.js?v=20260916-4"></script>\n' +
      '<script src="/app/calendar-v1203.js?v=20260917-2"></script>\n' +
      '<script src="/app/ui-v1209.js?v=20260915-3"></script>\n' +
      '<script src="/app/calendar-add-v1215.js?v=20260915-2"></script>\n' +
      '<script src="/app/calendar-weather-v1218.js?v=20260916-3"></script>\n' +
      '<script src="/app/reminder-form-v1251.js?v=20260917-3"></script>\n' +
      '<script src="/app/calendar-today-tile-v1262.js?v=20260917-5"></script>\n' +
      '<script src="/app/taxes-v1310.js?v=20260918-6"></script>\n' +
      '<script src="/app/admin-dashboard-v1270.js?v=20260919-13032"></script>';
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




