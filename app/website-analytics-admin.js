(()=>{
'use strict';
const EXCLUDE_KEY='cf_website_analytics_exclude';
let overlay=null,lastTileFetch=0;

function admin(){try{return typeof cfIsAdmin==='function'&&cfIsAdmin()}catch(_){return false}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function num(v){return new Intl.NumberFormat('pl-PL').format(Number(v)||0)}
function pct(a,b){return b?((100*(Number(a)||0)/Number(b)).toFixed(1).replace('.',',')+'%'):'0%'}
function dayIso(d){return d.toISOString()}
function startOfDay(d=new Date()){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function range(kind){
  const now=new Date(),to=new Date(startOfDay(now));to.setDate(to.getDate()+1);
  let from=startOfDay(now);
  if(kind==='7')from.setDate(from.getDate()-6);
  else if(kind==='30')from.setDate(from.getDate()-29);
  else if(kind==='month')from=new Date(now.getFullYear(),now.getMonth(),1);
  return{from,to};
}
async function fetchStats(from,to){
  if(!admin()||typeof cfSupabase==='undefined'||!cfSupabase) throw new Error('Brak dostępu administratora.');
  const {data,error}=await cfSupabase.rpc('cf_admin_website_analytics',{p_from:dayIso(from),p_to:dayIso(to)});
  if(error)throw error;
  return data||{};
}
function style(){
  if(document.getElementById('cfWebsiteStatsStyle'))return;
  const s=document.createElement('style');s.id='cfWebsiteStatsStyle';s.textContent=`
  .cf-www-overlay{position:fixed;inset:0;z-index:300000;background:rgba(16,18,16,.38);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:18px}
  .cf-www-overlay.open{display:flex}
  .cf-www-sheet{width:min(1180px,96vw);max-height:94vh;overflow:auto;background:#fff;color:var(--ink,#171914);border-radius:18px;border:1px solid var(--line,#e0e2dd);box-shadow:0 24px 70px rgba(0,0,0,.22);padding:22px}
  .cf-www-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.cf-www-head h2{margin:0;font-size:25px}.cf-www-head p{margin:5px 0 0;color:var(--ink-soft,#6d736e);font-size:12px}
  .cf-www-close{width:38px;height:38px;border-radius:50%;border:1px solid var(--line-strong,#d3d7d2);background:#fff;font-size:24px;cursor:pointer}
  .cf-www-toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:18px 0 14px}.cf-www-toolbar button,.cf-www-toolbar input{border:1px solid var(--line-strong,#d3d7d2);background:#fff;border-radius:9px;padding:9px 11px;font:700 11px Inter,system-ui;cursor:pointer}.cf-www-toolbar button.active{background:var(--green-ink,#6f7d13);color:#fff;border-color:var(--green-ink,#6f7d13)}
  .cf-www-custom{display:flex;gap:6px;align-items:center}.cf-www-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.cf-www-kpi{border:1px solid var(--line,#e3e5e1);background:#fafaf7;border-radius:12px;padding:12px}.cf-www-kpi span{display:block;color:var(--ink-soft,#777);font-size:10px}.cf-www-kpi strong{display:block;font-size:23px;margin-top:3px}
  .cf-www-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:12px;margin-top:12px}.cf-www-card{border:1px solid var(--line,#e3e5e1);border-radius:13px;padding:14px;background:#fff}.cf-www-card h3{font-size:13px;margin:0 0 12px}.cf-www-card small{color:var(--ink-soft,#777)}
  .cf-www-chart{width:100%;height:190px;display:block}.cf-www-chart .axis{stroke:#e8eae7;stroke-width:1}.cf-www-chart .line{fill:none;stroke:var(--green-ink,#6f7d13);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.cf-www-chart .dot{fill:var(--green-ink,#6f7d13)}
  .cf-www-funnel{display:grid;gap:8px}.cf-www-funnel-row{display:grid;grid-template-columns:95px 1fr 55px;gap:9px;align-items:center;font-size:11px}.cf-www-bar{height:11px;border-radius:999px;background:#eef0eb;overflow:hidden}.cf-www-bar i{display:block;height:100%;background:var(--green-ink,#6f7d13);border-radius:inherit}
  .cf-www-table{width:100%;border-collapse:collapse;font-size:11px}.cf-www-table td,.cf-www-table th{padding:7px 4px;border-bottom:1px solid #eceeea;text-align:left}.cf-www-table th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#7b837d}
  .cf-www-note{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px;padding:11px 12px;border-radius:10px;background:#f7f8f3;font-size:11px}.cf-www-note button{border:1px solid var(--line-strong,#d3d7d2);background:#fff;border-radius:8px;padding:8px 10px;font-weight:800;cursor:pointer}
  .cf-www-loading{padding:35px;text-align:center;color:#777}.cf-www-error{padding:16px;border-radius:10px;background:#fff1ef;color:#9b2f24;font-size:12px}
  @media(max-width:900px){.cf-www-summary{grid-template-columns:repeat(3,1fr)}.cf-www-grid{grid-template-columns:1fr}}@media(max-width:560px){.cf-www-overlay{padding:0}.cf-www-sheet{width:100vw;max-height:100svh;height:100svh;border-radius:0;padding:16px}.cf-www-summary{grid-template-columns:repeat(2,1fr)}.cf-www-custom{width:100%}.cf-www-custom input{min-width:0;flex:1}.cf-www-funnel-row{grid-template-columns:78px 1fr 44px}}
  `;document.head.appendChild(s);
}
function makeOverlay(){
  if(overlay)return overlay;style();overlay=document.createElement('div');overlay.className='cf-www-overlay';overlay.id='cfWebsiteStatsOverlay';overlay.innerHTML=`
    <section class="cf-www-sheet" role="dialog" aria-modal="true" aria-label="Statystyki WWW">
      <div class="cf-www-head"><div><h2>Statystyki WWW</h2><p>Ruch, źródła i konwersje cleanfleet.pl</p></div><button class="cf-www-close" type="button" aria-label="Zamknij">×</button></div>
      <div class="cf-www-toolbar">
        <button data-range="today">Dziś</button><button data-range="7">7 dni</button><button class="active" data-range="30">30 dni</button><button data-range="month">Ten miesiąc</button>
        <div class="cf-www-custom"><input type="date" id="cfWwwFrom"><span>–</span><input type="date" id="cfWwwTo"><button id="cfWwwApply">Pokaż</button></div>
      </div>
      <div id="cfWwwBody" class="cf-www-loading">Pobieranie danych…</div>
      <div class="cf-www-note"><span>Twoje testowe wejścia mogą być wyłączone na tym urządzeniu.</span><button id="cfWwwExclude" type="button"></button></div>
    </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.cf-www-close').onclick=close;
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>loadPreset(b.dataset.range,b));
  overlay.querySelector('#cfWwwApply').onclick=loadCustom;
  const ex=overlay.querySelector('#cfWwwExclude');const sync=()=>ex.textContent=localStorage.getItem(EXCLUDE_KEY)==='1'?'Licz to urządzenie':'Nie licz tego urządzenia';
  ex.onclick=()=>{localStorage.setItem(EXCLUDE_KEY,localStorage.getItem(EXCLUDE_KEY)==='1'?'0':'1');sync()};sync();
  return overlay;
}
function close(){overlay?.classList.remove('open')}
function open(){if(!admin())return;makeOverlay().classList.add('open');loadPreset('30',overlay.querySelector('[data-range="30"]'))}
function datesToInputs(from,to){const f=overlay.querySelector('#cfWwwFrom'),t=overlay.querySelector('#cfWwwTo');const local=x=>{const z=new Date(x.getTime()-x.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};f.value=local(from);const inclusive=new Date(to);inclusive.setDate(inclusive.getDate()-1);t.value=local(inclusive)}
function activeBtn(btn){overlay.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('active',x===btn))}
async function loadPreset(kind,btn){const r=range(kind);activeBtn(btn);datesToInputs(r.from,r.to);await load(r.from,r.to)}
async function loadCustom(){const f=overlay.querySelector('#cfWwwFrom').value,t=overlay.querySelector('#cfWwwTo').value;if(!f||!t)return;activeBtn(null);const from=new Date(f+'T00:00:00'),to=new Date(t+'T00:00:00');to.setDate(to.getDate()+1);await load(from,to)}
function svg(daily){
  if(!daily?.length)return '<div class="cf-www-loading">Brak danych w tym okresie.</div>';
  const w=700,h=190,p=18,max=Math.max(1,...daily.map(x=>Number(x.sessions)||0));const pts=daily.map((x,i)=>{const xx=p+(w-2*p)*(daily.length===1?.5:i/(daily.length-1)),yy=h-p-(h-2*p)*(Number(x.sessions)||0)/max;return[xx,yy]}),path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return `<svg class="cf-www-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line class="axis" x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"/><path class="line" d="${path}"/>${pts.map(p=>`<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`).join('')}</svg><small>Sesje dziennie • maksimum: ${num(max)}</small>`;
}
function rows(items,key='sessions'){return(items||[]).map(x=>`<tr><td>${esc(x.source??x.device??x.page_path??'—')}</td><td><strong>${num(x[key])}</strong></td></tr>`).join('')||'<tr><td colspan="2">Brak danych</td></tr>'}
function render(data){
 const s=data.summary||{},sessions=Number(s.sessions)||0,contacts=Number(s.contact_sessions)||0;const funnel=new Map((data.funnel||[]).map(x=>[Number(x.slide),Number(x.sessions)||0]));const labels=['Start','Problem','Efekt','Usługi','Flota','System','Kontakt'],top=Math.max(1,funnel.get(1)||sessions);
 return `
 <div class="cf-www-summary">
  <div class="cf-www-kpi"><span>Sesje</span><strong>${num(sessions)}</strong></div>
  <div class="cf-www-kpi"><span>Odsłony</span><strong>${num(s.page_views)}</strong></div>
  <div class="cf-www-kpi"><span>Zaangażowane 30 s</span><strong>${num(s.engaged_sessions)}</strong></div>
  <div class="cf-www-kpi"><span>Kontakty</span><strong>${num(contacts)}</strong></div>
  <div class="cf-www-kpi"><span>Wysłane formularze</span><strong>${num(s.form_submits)}</strong></div>
  <div class="cf-www-kpi"><span>Konwersja kontaktowa</span><strong>${pct(contacts,sessions)}</strong></div>
 </div>
 <div class="cf-www-grid">
  <div class="cf-www-card"><h3>Ruch w czasie</h3>${svg(data.daily||[])}</div>
  <div class="cf-www-card"><h3>Konwersje</h3><table class="cf-www-table">
   <tr><td>Klik „Poproś o wycenę”</td><td><strong>${num(s.quote_clicks)}</strong></td></tr>
   <tr><td>Klik telefonu</td><td><strong>${num(s.phone_clicks)}</strong></td></tr>
   <tr><td>Klik e-mail</td><td><strong>${num(s.email_clicks)}</strong></td></tr>
   <tr><td>Otwarcia formularza</td><td><strong>${num(s.form_opens)}</strong></td></tr>
   <tr><td>Rozpoczęte formularze</td><td><strong>${num(s.form_starts)}</strong></td></tr>
   <tr><td>Wysłane formularze</td><td><strong>${num(s.form_submits)}</strong></td></tr>
   <tr><td>Błędy formularza</td><td><strong>${num(s.form_errors)}</strong></td></tr>
  </table></div>
  <div class="cf-www-card"><h3>Lejek strony</h3><div class="cf-www-funnel">${labels.map((l,i)=>{const v=funnel.get(i+1)||0;return`<div class="cf-www-funnel-row"><span>${i+1}. ${l}</span><div class="cf-www-bar"><i style="width:${Math.min(100,100*v/top)}%"></i></div><strong>${num(v)}</strong></div>`}).join('')}</div></div>
  <div class="cf-www-card"><h3>Źródła ruchu</h3><table class="cf-www-table"><thead><tr><th>Źródło</th><th>Sesje</th></tr></thead><tbody>${rows(data.sources||[])}</tbody></table></div>
  <div class="cf-www-card"><h3>Urządzenia</h3><table class="cf-www-table"><thead><tr><th>Urządzenie</th><th>Sesje</th></tr></thead><tbody>${rows(data.devices||[])}</tbody></table></div>
  <div class="cf-www-card"><h3>Najczęściej oglądane strony</h3><table class="cf-www-table"><thead><tr><th>Strona</th><th>Sesje</th></tr></thead><tbody>${rows(data.pages||[])}</tbody></table></div>
 </div>`;
}
async function load(from,to){const body=overlay.querySelector('#cfWwwBody');body.className='cf-www-loading';body.textContent='Pobieranie danych…';try{const data=await fetchStats(from,to);body.className='';body.innerHTML=render(data)}catch(e){console.error('CleanFleet WWW stats',e);body.className='cf-www-error';body.textContent='Nie udało się pobrać statystyk WWW.'}}
async function tileSummary(tile){
  const now=Date.now();if(now-lastTileFetch<60000)return;lastTileFetch=now;
  try{const r=range('today'),d=await fetchStats(r.from,r.to),s=d.summary||{};const span=tile.querySelector('span');if(span)span.textContent=`Dziś: ${num(s.sessions)} sesji • ${num(s.contact_sessions)} kontaktów`}catch(_){}
}
function ensureTile(){
  if(!admin())return;
  const grid=document.getElementById('cfCompanyGrid');if(!grid||grid.querySelector('#cfCompanyWebsiteStatsCard'))return;
  const tile=document.createElement('button');tile.type='button';tile.id='cfCompanyWebsiteStatsCard';tile.className='cf-company-card cf-company-utility-card cf-company-website-stats-card';tile.innerHTML='<div><strong>Statystyki WWW</strong><span>Ruch, źródła i konwersje</span></div>';tile.addEventListener('click',open);
  const add=grid.querySelector('#cfCompanyAddCard');if(add)add.before(tile);else grid.appendChild(tile);tileSummary(tile);
}
function boot(){style();ensureTile();new MutationObserver(()=>queueMicrotask(ensureTile)).observe(document.body,{childList:true,subtree:true});setInterval(ensureTile,3000);window.cfShowWebsiteStats=open}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();