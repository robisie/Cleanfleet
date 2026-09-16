(() => {
  'use strict';

  function moveSyncBar(){
    const bar=document.querySelector('.cf-syncbar');
    const activeHead=document.querySelector('.active-section-head');
    if(!bar||!activeHead||!activeHead.parentElement)return;
    if(bar.parentElement===activeHead.parentElement && bar.nextElementSibling===activeHead)return;
    activeHead.insertAdjacentElement('beforebegin',bar);
    bar.classList.add('cf-syncbar-after-attention');
  }

  function ensureStyles(){
    if(document.getElementById('cfLayout11913Styles'))return;
    const style=document.createElement('style');
    style.id='cfLayout11913Styles';
    style.textContent=`
      .cf-syncbar.cf-syncbar-after-attention{margin:12px 0 12px;padding:0;border:0;background:transparent}
      .cf-weather-full-btn{border:1px solid #dfe7e2;background:#f5f8f6;color:#31483a;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850;cursor:pointer;white-space:nowrap}
      .cf-weather-full-btn:active{transform:scale(.98)}
      @media(max-width:520px){.cf-syncbar.cf-syncbar-after-attention{margin:10px 0 10px}.cf-weather-full-btn{padding:6px 8px;font-size:9px}}
    `;
    document.head.appendChild(style);
  }

  function isVisible(el){
    if(!el)return false;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden')return false;
    return !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  }

  function dayInfo(s){
    const d=new Date(`${s}T12:00:00`);
    const names=['ND','PN','WT','ŚR','CZ','PT','SO'];
    return{short:names[d.getDay()],date:d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})};
  }

  function ensureWeatherTile(){
    const grid=document.getElementById('cfCompanyGrid');
    if(!isVisible(grid))return;
    const bridge=window.cfWeatherBridge;
    if(!bridge?.getState)return;
    const state=bridge.getState();
    let tile=document.getElementById('cfCompanyWeatherCard');
    if(!tile){
      tile=document.createElement('section');
      tile.id='cfCompanyWeatherCard';
      tile.className='cf-company-card cf-company-weather-card';
      grid.prepend(tile);
    }
    const days=state?.days||[];
    if(!days.length){
      if(tile.dataset.cfWeatherSig!=='loading'){
        tile.dataset.cfWeatherSig='loading';
        tile.innerHTML='<div class="cf-weather-tile-error">Ładowanie prognozy pogody…</div>';
      }
      return;
    }
    const sig=days.slice(0,5).map(d=>`${d.date}:${d.tmax}:${d.tmin}:${d.rain}:${d.pop}`).join('|');
    if(tile.dataset.cfWeatherSig===sig&&tile.querySelector('[data-weather-full]'))return;
    tile.dataset.cfWeatherSig=sig;
    const t=days[0];
    tile.innerHTML=`<div class="cf-weather-tile-head"><div><div class="cf-weather-tile-title">Pogoda</div><div class="cf-weather-tile-now"><div class="cf-weather-tile-temp">${Math.round(t.tmax)}°</div><div class="cf-weather-tile-desc">${t.signal?.label||''}</div></div></div><div style="display:flex;align-items:center;gap:7px"><button type="button" class="cf-weather-full-btn" data-weather-full>Pełna prognoza</button><button type="button" class="cf-weather-tile-day" data-layout-weather-day="${t.date}" style="font-size:22px;padding:6px 9px">${bridge.icon(t.date)||'🌤️'}</button></div></div><div class="cf-weather-tile-days">${days.slice(0,5).map(d=>{const di=dayInfo(d.date);return`<button type="button" class="cf-weather-tile-day" data-layout-weather-day="${d.date}"><strong>${di.short}${bridge.signalHtml(d.date)||''}</strong><div class="cf-weather-tile-icon">${bridge.icon(d.date)||'🌤️'}</div><div class="cf-weather-tile-range">${Math.round(d.tmax)}° <span>${Math.round(d.tmin)}°</span></div></button>`;}).join('')}</div>`;
    tile.querySelector('[data-weather-full]')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();location.href='/app/weather.html';});
    tile.querySelectorAll('[data-layout-weather-day]').forEach(b=>b.addEventListener('click',()=>bridge.openDay?.(b.dataset.layoutWeatherDay)));
  }

  function ensureCalendarFullLink(){
    const tile=document.getElementById('cfCompanyCalendarCard');
    if(!tile||tile.dataset.cfFullCalendar==='1')return;
    tile.dataset.cfFullCalendar='1';
    tile.onclick=e=>{
      e?.preventDefault?.();
      e?.stopPropagation?.();
      location.href='/app/calendar.html';
    };
  }

  function applyAdminMonthPerformerDefault(){
    const select=document.getElementById('monthPerformerFilter');
    if(!select||select.dataset.cfAdminDefaultApplied==='1')return;
    const isAdmin=document.body?.getAttribute('data-cf-role')==='admin';
    if(!isAdmin)return;
    const target=[...select.options].find(opt=>{
      const value=String(opt.value||'').trim().toLocaleLowerCase('pl-PL');
      const text=String(opt.textContent||'').replace(/^Wykonał:\s*/i,'').trim().toLocaleLowerCase('pl-PL');
      return value==='michał'||text==='michał';
    });
    if(!target)return;
    select.value=target.value;
    select.dataset.cfAdminDefaultApplied='1';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function refresh(){
    moveSyncBar();
    ensureWeatherTile();
    ensureCalendarFullLink();
    applyAdminMonthPerformerDefault();
  }

  function start(){
    ensureStyles();
    refresh();
    window.addEventListener('cf-weather-updated',refresh);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(refresh,100);});
    document.addEventListener('click',()=>setTimeout(refresh,80),{passive:true});
    setInterval(refresh,1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
