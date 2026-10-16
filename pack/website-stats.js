/* Existing website analytics; admin RPC remains authoritative. */
function cfWwwStatsEsc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function cfWwwStatsNum(v){ return new Intl.NumberFormat('pl-PL').format(Number(v)||0); }
function cfWwwStatsPct(a,b){ return b ? ((100*(Number(a)||0)/(Number(b)||1)).toFixed(1).replace('.',',')+'%') : '0%'; }
function cfWwwStatsRange(kind){
  const now=new Date();
  const to=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  let from=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(kind==='7') from.setDate(from.getDate()-6);
  else if(kind==='30') from.setDate(from.getDate()-29);
  else if(kind==='month') from=new Date(now.getFullYear(),now.getMonth(),1);
  return {from,to};
}
function cfWwwStatsDateInput(d){
  const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
}
function cfWwwStatsEnsureStyle(){
  if(document.getElementById('cfWwwStatsDirectStyle')) return;
  const st=document.createElement('style');
  st.id='cfWwwStatsDirectStyle';
  st.textContent=`
    .cf-www-stats-sheet{width:min(1120px,calc(100vw - 28px))!important;max-width:1120px!important;max-height:92vh!important;overflow:auto!important;padding:22px!important}
    .cf-www-stats-head{display:block;margin-bottom:14px;padding-right:96px!important}
    .cf-www-stats-head h2{margin:0;font-size:24px}.cf-www-stats-head p{margin:4px 0 0;color:var(--ink-soft);font-size:11px}
    .cf-www-stats-toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0 14px}
    .cf-www-stats-toolbar button,.cf-www-stats-toolbar input,.cf-www-stats-toolbar select{border:1px solid var(--line-strong);background:#fff;border-radius:8px;padding:8px 10px;font:700 11px Inter,sans-serif}
    .cf-www-stats-toolbar button{cursor:pointer}.cf-www-stats-toolbar button.active{background:var(--green-ink);border-color:var(--green-ink);color:#fff}
    .cf-www-stats-custom{display:flex;gap:6px;align-items:center}
    .cf-www-stats-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
    .cf-www-stats-kpi{border:1px solid var(--line);border-radius:10px;background:#f8f8f5;padding:11px}
    .cf-www-stats-kpi span{display:block;color:var(--ink-soft);font-size:9px;line-height:1.2}.cf-www-stats-kpi strong{display:block;font-size:22px;margin-top:4px}
    .cf-www-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .cf-www-stats-card{border:1px solid var(--line);border-radius:11px;padding:13px;background:#fff}.cf-www-stats-card h3{font-size:12px;margin:0 0 10px}
    .cf-www-stats-table{width:100%;border-collapse:collapse;font-size:11px}.cf-www-stats-table td,.cf-www-stats-table th{padding:7px 4px;border-bottom:1px solid #eceeea;text-align:left}.cf-www-stats-table th{font-size:9px;text-transform:uppercase;color:var(--ink-soft)}
    .cf-www-funnel-row{display:grid;grid-template-columns:82px 1fr 46px;gap:8px;align-items:center;margin:7px 0;font-size:10px}
    .cf-www-funnel-bar{height:10px;background:#ecefe9;border-radius:999px;overflow:hidden}.cf-www-funnel-bar i{display:block;height:100%;background:var(--green-ink);border-radius:inherit}
    .cf-www-stats-status{padding:30px 10px;text-align:center;color:var(--ink-soft);font-size:12px}
    .cf-www-device-toggle{margin-top:12px;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 11px;background:#f7f8f3;border-radius:9px;font-size:10px}
    .cf-www-device-toggle button{border:1px solid var(--line-strong);background:#fff;border-radius:8px;padding:7px 9px;font-weight:800;cursor:pointer}
    @media(max-width:900px){.cf-www-stats-summary{grid-template-columns:repeat(3,1fr)}.cf-www-stats-grid{grid-template-columns:1fr}}
    @media(max-width:560px){.cf-www-stats-sheet{width:100vw!important;max-height:calc(100dvh - 70px - env(safe-area-inset-bottom))!important;border-radius:16px 16px 0 0!important;padding:15px!important}.cf-www-stats-head{padding-right:88px!important}.cf-www-stats-summary{grid-template-columns:repeat(2,1fr)}.cf-www-stats-custom{width:100%}.cf-www-stats-custom input{min-width:0;flex:1}}
  `;
  document.head.appendChild(st);
}
function cfWwwStatsRows(items,labelKey){
  if(!items?.length) return '<tr><td colspan="2">Brak danych</td></tr>';
  return items.map(x=>`<tr><td>${cfWwwStatsEsc(x[labelKey]||'—')}</td><td><strong>${cfWwwStatsNum(x.sessions)}</strong></td></tr>`).join('');
}
function cfWwwStatsRender(data){
  const body=document.getElementById('cfWwwStatsBody');
  if(!body) return;
  const sm=data?.summary||{};
  const sessions=Number(sm.sessions)||0;
  const contacts=Number(sm.contact_sessions)||0;
  const funnel=new Map((data?.funnel||[]).map(x=>[Number(x.slide),Number(x.sessions)||0]));
  const labels=['Start','Problem','Efekt','Usługi','Flota','System','Kontakt'];
  const top=Math.max(1,funnel.get(1)||sessions);
  body.innerHTML=`
    <div class="cf-www-stats-summary">
      <div class="cf-www-stats-kpi"><span>Sesje</span><strong>${cfWwwStatsNum(sessions)}</strong></div>
      <div class="cf-www-stats-kpi"><span>Odsłony</span><strong>${cfWwwStatsNum(sm.page_views)}</strong></div>
      <div class="cf-www-stats-kpi"><span>Zaangażowane 30 s</span><strong>${cfWwwStatsNum(sm.engaged_sessions)}</strong></div>
      <div class="cf-www-stats-kpi"><span>Kontakty</span><strong>${cfWwwStatsNum(contacts)}</strong></div>
      <div class="cf-www-stats-kpi"><span>Formularze</span><strong>${cfWwwStatsNum(sm.form_submits)}</strong></div>
      <div class="cf-www-stats-kpi"><span>Konwersja</span><strong>${cfWwwStatsPct(contacts,sessions)}</strong></div>
    </div>
    <div class="cf-www-stats-grid">
      <section class="cf-www-stats-card"><h3>Lejek strony</h3>${labels.map((l,i)=>{const v=funnel.get(i+1)||0;return `<div class="cf-www-funnel-row"><span>${i+1}. ${l}</span><div class="cf-www-funnel-bar"><i style="width:${Math.min(100,100*v/top)}%"></i></div><strong>${cfWwwStatsNum(v)}</strong></div>`}).join('')}</section>
      <section class="cf-www-stats-card"><h3>Działania kontaktowe</h3><table class="cf-www-stats-table"><tbody>
        <tr><td>Poproś o wycenę</td><td><strong>${cfWwwStatsNum(sm.quote_clicks)}</strong></td></tr>
        <tr><td>Klik telefonu</td><td><strong>${cfWwwStatsNum(sm.phone_clicks)}</strong></td></tr>
        <tr><td>Klik e-mail</td><td><strong>${cfWwwStatsNum(sm.email_clicks)}</strong></td></tr>
        <tr><td>Otwarcie formularza</td><td><strong>${cfWwwStatsNum(sm.form_opens)}</strong></td></tr>
        <tr><td>Rozpoczęcie formularza</td><td><strong>${cfWwwStatsNum(sm.form_starts)}</strong></td></tr>
        <tr><td>Wysłanie formularza</td><td><strong>${cfWwwStatsNum(sm.form_submits)}</strong></td></tr>
        <tr><td>Błąd formularza</td><td><strong>${cfWwwStatsNum(sm.form_errors)}</strong></td></tr>
      </tbody></table></section>
      <section class="cf-www-stats-card"><h3>Źródła ruchu</h3><table class="cf-www-stats-table"><thead><tr><th>Źródło</th><th>Sesje</th></tr></thead><tbody>${cfWwwStatsRows(data?.sources||[],'source')}</tbody></table></section>
      <section class="cf-www-stats-card"><h3>Urządzenia</h3><table class="cf-www-stats-table"><thead><tr><th>Urządzenie</th><th>Sesje</th></tr></thead><tbody>${cfWwwStatsRows(data?.devices||[],'device')}</tbody></table></section>
      <section class="cf-www-stats-card"><h3>Strony</h3><table class="cf-www-stats-table"><thead><tr><th>Adres</th><th>Sesje</th></tr></thead><tbody>${cfWwwStatsRows(data?.pages||[],'page_path')}</tbody></table></section>
      <section class="cf-www-stats-card"><h3>Ruch dzienny</h3><table class="cf-www-stats-table"><thead><tr><th>Dzień</th><th>Sesje</th></tr></thead><tbody>${(data?.daily||[]).map(x=>`<tr><td>${cfWwwStatsEsc(x.day)}</td><td><strong>${cfWwwStatsNum(x.sessions)}</strong></td></tr>`).join('')||'<tr><td colspan="2">Brak danych</td></tr>'}</tbody></table></section>
    </div>
  `;
}
async function cfWwwStatsLoad(from,to){
  const body=document.getElementById('cfWwwStatsBody');
  if(body){body.className='cf-www-stats-status';body.textContent='Pobieranie danych…';}
  try{
    const {data,error}=await cfSupabase.rpc('cf_admin_website_analytics',{p_from:from.toISOString(),p_to:to.toISOString()});
    if(error) throw error;
    if(body) body.className='';
    cfWwwStatsRender(data||{});
  }catch(err){
    console.error('CleanFleet WWW stats:',err);
    if(body){body.className='cf-www-stats-status';body.textContent='Nie udało się pobrać statystyk WWW.';}
  }
}
function cfWwwStatsSetRange(kind){
  const mode=document.getElementById('cfWwwStatsMonthMode');if(mode){mode.value='custom';mode._cfMonthPicker?.sync();}
  const r=cfWwwStatsRange(kind);
  document.querySelectorAll('#cfWebsiteStatsOverlay [data-www-range]').forEach(b=>b.classList.toggle('active',b.dataset.wwwRange===kind));
  const f=document.getElementById('cfWwwStatsFrom'),t=document.getElementById('cfWwwStatsTo');
  if(f)f.value=cfWwwStatsDateInput(r.from);
  if(t){const inc=new Date(r.to);inc.setDate(inc.getDate()-1);t.value=cfWwwStatsDateInput(inc);}
  cfWwwStatsLoad(r.from,r.to);
}
function cfWwwStatsCustom(keepMonth=false){
  const mode=document.getElementById('cfWwwStatsMonthMode');if(mode&&!keepMonth){mode.value='custom';mode._cfMonthPicker?.sync();}
  const fv=document.getElementById('cfWwwStatsFrom')?.value;
  const tv=document.getElementById('cfWwwStatsTo')?.value;
  if(!fv||!tv) return;
  const from=new Date(fv+'T00:00:00'),to=new Date(tv+'T00:00:00');to.setDate(to.getDate()+1);
  document.querySelectorAll('#cfWebsiteStatsOverlay [data-www-range]').forEach(b=>b.classList.remove('active'));
  cfWwwStatsLoad(from,to);
}
function cfWwwStatsSyncExclude(){
  const b=document.getElementById('cfWwwStatsExclude');
  if(b)b.textContent=localStorage.getItem('cf_website_analytics_exclude')==='1'?'Licz to urządzenie':'Nie licz tego urządzenia';
}
function cfWwwStatsToggleExclude(){
  localStorage.setItem('cf_website_analytics_exclude',localStorage.getItem('cf_website_analytics_exclude')==='1'?'0':'1');
  cfWwwStatsSyncExclude();
}
function cfCloseWebsiteStatsPanel(){
  const o=document.getElementById('cfWebsiteStatsOverlay');
  if(o)o.remove();
}
function cfOpenWebsiteStatsPanel(){
  if(!cfIsAdmin()) return;
  cfWwwStatsEnsureStyle();
  cfCloseWebsiteStatsPanel();
  const root=document.getElementById('modalRoot')||document.body;
  const o=document.createElement('div');
  o.id='cfWebsiteStatsOverlay';
  o.className='overlay';
  o.innerHTML=`
    <div class="sheet cf-www-stats-sheet">
      <button class="close" data-close type="button">&times;</button>
      <div class="cf-www-stats-head"><div><h2>Statystyki WWW</h2><p>Ruch, źródła i konwersje cleanfleet.pl</p></div></div>
      <div class="cf-www-stats-toolbar">
        <button type="button" data-www-range="today">Dziś</button><button type="button" data-www-range="7">7 dni</button><button type="button" data-www-range="30">30 dni</button><button type="button" data-www-range="month">Ten miesiąc</button>
        <select id="cfWwwStatsMonthMode" aria-label="Wybór miesiąca"><option value="custom">Wybierz okres</option><option value="selected_month">Miesiąc</option></select>
        <div class="cf-www-stats-custom"><input id="cfWwwStatsFrom" type="date"><span>–</span><input id="cfWwwStatsTo" type="date"><button id="cfWwwStatsApply" type="button">Pokaż</button></div>
      </div>
      <div id="cfWwwStatsBody" class="cf-www-stats-status">Pobieranie danych…</div>
      <div class="cf-www-device-toggle"><span>Możesz wyłączyć własne testowe wejścia z przyszłych statystyk na tym urządzeniu.</span><button id="cfWwwStatsExclude" type="button"></button></div>
    </div>`;
  root.appendChild(o);
  o.querySelector('[data-close]')?.addEventListener('click',cfCloseWebsiteStatsPanel);
  o.addEventListener('click',e=>{if(e.target===o)cfCloseWebsiteStatsPanel();});
  o.querySelectorAll('[data-www-range]').forEach(b=>b.addEventListener('click',()=>cfWwwStatsSetRange(b.dataset.wwwRange)));
  const monthMode=document.getElementById('cfWwwStatsMonthMode');
  const monthPicker=window.CFPeriods.attach(monthMode,()=>{if(monthMode.value==='selected_month'){const b=monthPicker.bounds();document.getElementById('cfWwwStatsFrom').value=b.from;document.getElementById('cfWwwStatsTo').value=b.to;cfWwwStatsCustom(true);}});
  document.getElementById('cfWwwStatsApply')?.addEventListener('click',()=>cfWwwStatsCustom());
  document.getElementById('cfWwwStatsExclude')?.addEventListener('click',cfWwwStatsToggleExclude);
  cfWwwStatsSyncExclude();
  cfWwwStatsSetRange('30');
}

