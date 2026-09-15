(() => {
  'use strict';

  const CFG={lat:50.018386,lon:18.982804,tz:'Europe/Warsaw',days:7,models:[
    {id:'ecmwf_ifs025',label:'ECMWF'},{id:'icon_seamless',label:'ICON'},
    {id:'gfs_seamless',label:'GFS'},{id:'metno_seamless',label:'MET Norway'}
  ]};
  const DS=['ND','PN','WT','ŚR','CZ','PT','SO'];
  const DL=['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const med=a=>{if(!a.length)return null;const x=[...a].sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
  const sd=a=>{if(a.length<2)return 0;const m=avg(a);return Math.sqrt(avg(a.map(v=>(v-m)**2)));};
  const num=(x,f=null)=>Number.isFinite(Number(x))?Number(x):f;
  const r1=x=>Math.round((x||0)*10)/10;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function status(score,rain,gust){
    if(score>=82&&rain<0.6&&gust<35)return{color:'#48a868',label:'Bardzo dobre warunki'};
    if(score>=67)return{color:'#65ad58',label:'Dobre warunki'};
    if(score>=48)return{color:'#d9b62f',label:'Warunki niepewne'};
    if(score>=30)return{color:'#e18a32',label:'Słabe warunki'};
    return{color:'#d95757',label:'Złe warunki'};
  }
  function text(d){
    if(d.rain>=5)return'Wyraźny sygnał deszczu';
    if(d.rain>=1.5)return'Prawdopodobne opady';
    if(d.wet>=Math.ceil(d.count/2)&&d.rain>=0.5)return'Możliwy przelotny deszcz';
    if(d.gust>=50)return'Silniejsze porywy wiatru';
    if(d.gust>=35)return'Umiarkowany wiatr';
    return'Przeważnie sucho';
  }
  function dayInfo(s){const d=new Date(`${s}T12:00:00`);return{short:DS[d.getDay()],long:DL[d.getDay()],date:d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})};}

  function url(model){const p=new URLSearchParams({latitude:String(CFG.lat),longitude:String(CFG.lon),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',timezone:CFG.tz,forecast_days:String(CFG.days),models:model});return`https://api.open-meteo.com/v1/forecast?${p}`;}
  async function getModel(m){const c=new AbortController(),t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(url(m.id),{cache:'no-store',signal:c.signal});if(!r.ok)throw new Error(String(r.status));const j=await r.json();if(!j?.daily?.time?.length)throw new Error('Brak danych');return{model:m,daily:j.daily};}finally{clearTimeout(t);}}
  async function fallback(){const p=new URLSearchParams({latitude:String(CFG.lat),longitude:String(CFG.lon),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',timezone:CFG.tz,forecast_days:String(CFG.days)});const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store'});if(!r.ok)throw new Error('Brak prognozy');const j=await r.json();return[{model:{label:'Open-Meteo Best Match'},daily:j.daily}];}

  function combine(models){const dates=models[0]?.daily?.time||[];return dates.map((date,i)=>{const rows=models.map(m=>({label:m.model.label,tmax:num(m.daily.temperature_2m_max?.[i]),tmin:num(m.daily.temperature_2m_min?.[i]),rain:num(m.daily.precipitation_sum?.[i],0),pop:num(m.daily.precipitation_probability_max?.[i]),wind:num(m.daily.wind_speed_10m_max?.[i],0),gust:num(m.daily.wind_gusts_10m_max?.[i],0)}));const rv=rows.map(x=>x.rain).filter(Number.isFinite),gv=rows.map(x=>x.gust).filter(Number.isFinite),wv=rows.map(x=>x.wind).filter(Number.isFinite),tx=rows.map(x=>x.tmax).filter(Number.isFinite),tn=rows.map(x=>x.tmin).filter(Number.isFinite),pv=rows.map(x=>x.pop).filter(Number.isFinite);const rain=med(rv)??0,wind=med(wv)??0,gust=Math.max(med(gv)??0,wind),wet=rows.filter(x=>x.rain>=0.5).length,share=rows.length?wet/rows.length:0,agree=rows.length?Math.max(share,1-share):0.5;const conf=Math.round(clamp(96-clamp(sd(rv)*5+sd(gv)*0.6,0,28)-clamp((1-agree)*28,0,14)-i*1.8,40,96));let rp=rain>=8?55:rain>=4?42:rain>=2?30:rain>=0.8?18:rain>=0.3?9:0;if(share>=0.75)rp+=6;const wp=gust>=65?35:gust>=50?25:gust>=40?16:gust>=30?8:0;const score=Math.round(clamp(100-rp-wp-Math.max(0,(72-conf)*0.35),0,100));return{date,count:rows.length,wet,tmax:r1(avg(tx)),tmin:r1(avg(tn)),rain:r1(rain),pop:pv.length?Math.round(avg(pv)):null,wind:Math.round(wind),gust:Math.round(gust),confidence:conf,status:status(score,rain,gust)};});}

  function styles(){if(document.getElementById('cfWeatherStylesV2'))return;const s=document.createElement('style');s.id='cfWeatherStylesV2';s.textContent=`
    #cfWeatherSlot{margin:10px 0 10px;background:#fff;border:1px solid #e6e9e7;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.035);width:100%;box-sizing:border-box}
    .cf-w-days{display:grid;grid-template-columns:repeat(7,1fr);min-height:44px}.cf-w-day{border:0;border-right:1px solid #edf0ee;background:#fff;padding:7px 2px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;color:#222;font:800 10px/1 system-ui,-apple-system,sans-serif}.cf-w-day:last-child{border-right:0}.cf-w-day:active{background:#f6f8f6}.cf-w-dot{width:8px;height:8px;border-radius:50%;display:block}.cf-w-msg{min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;font-size:11px;color:#727b75}.cf-w-retry{border:0;background:none;color:#68751d;font-weight:800;cursor:pointer}
    .cf-w-bg{position:fixed;inset:0;z-index:99998;background:rgba(15,18,16,.42);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}.cf-w-modal{position:relative;width:min(390px,100%);background:#fff;border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.28);padding:20px;color:#171a18}.cf-w-close{position:absolute;right:12px;top:10px;width:34px;height:34px;border:0;border-radius:50%;background:#f2f4f2;font-size:22px;cursor:pointer}.cf-w-date{font-size:12px;font-weight:800;color:#768078;text-transform:uppercase;letter-spacing:.06em}.cf-w-title{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;margin:7px 40px 3px 0}.cf-w-title .cf-w-dot{width:10px;height:10px}.cf-w-summary{font-size:13px;color:#646d67;margin-bottom:16px}.cf-w-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cf-w-metric{background:#f7f8f7;border:1px solid #ecefec;border-radius:12px;padding:11px 12px}.cf-w-metric span{display:block;font-size:10px;color:#818983;margin-bottom:3px}.cf-w-metric strong{font-size:15px}.cf-w-conf{margin-top:12px;padding-top:12px;border-top:1px solid #edf0ee;display:flex;justify-content:space-between;font-size:11px;color:#747d77}.cf-w-models{font-size:10px;color:#959c97;margin-top:8px}
    @media(max-width:520px){#cfWeatherSlot{border-radius:10px}.cf-w-day{font-size:9px;padding:6px 1px}.cf-w-dot{width:7px;height:7px}}
  `;document.head.appendChild(s);}

  function placeUnderHeader(host){
    const headerTop=document.querySelector('.header-top');
    if(headerTop && headerTop.parentElement){
      headerTop.insertAdjacentElement('afterend',host);
      return true;
    }
    return false;
  }

  function close(){document.getElementById('cfWeatherModal')?.remove();}
  function modal(d,labels,fallbackMode){close();const di=dayInfo(d.date),el=document.createElement('div');el.id='cfWeatherModal';el.className='cf-w-bg';el.innerHTML=`<div class="cf-w-modal" role="dialog" aria-modal="true"><button class="cf-w-close" type="button">×</button><div class="cf-w-date">${esc(di.long)} · ${di.date}</div><div class="cf-w-title"><span class="cf-w-dot" style="background:${d.status.color}"></span>${esc(d.status.label)}</div><div class="cf-w-summary">${esc(text(d))}</div><div class="cf-w-grid"><div class="cf-w-metric"><span>Temperatura</span><strong>${Math.round(d.tmin)}–${Math.round(d.tmax)}°C</strong></div><div class="cf-w-metric"><span>Opad</span><strong>${d.rain.toFixed(1)} mm${d.pop==null?'':` · ${d.pop}%`}</strong></div><div class="cf-w-metric"><span>Wiatr</span><strong>${d.wind} km/h</strong></div><div class="cf-w-metric"><span>Porywy</span><strong>${d.gust} km/h</strong></div></div><div class="cf-w-conf"><span>Pewność prognozy</span><strong>${d.confidence}%</strong></div><div class="cf-w-models">${fallbackMode?'Tryb zapasowy':'Analiza modeli'}: ${esc(labels.join(' • '))}</div></div>`;el.addEventListener('click',e=>{if(e.target===el)close();});el.querySelector('.cf-w-close')?.addEventListener('click',close);document.body.appendChild(el);}
  function render(host,days,labels,fb){host.innerHTML=`<div class="cf-w-days">${days.map((d,i)=>{const di=dayInfo(d.date);return`<button class="cf-w-day" type="button" data-i="${i}" title="${esc(text(d))}"><span>${di.short}</span><span class="cf-w-dot" style="background:${d.status.color}"></span></button>`;}).join('')}</div>`;host.querySelectorAll('[data-i]').forEach(b=>b.addEventListener('click',()=>modal(days[Number(b.dataset.i)],labels,fb)));}
  function error(host){host.innerHTML='<div class="cf-w-msg">Nie udało się załadować prognozy pogody.<button type="button" class="cf-w-retry">Ponów</button></div>';host.querySelector('.cf-w-retry')?.addEventListener('click',()=>load(host));}
  async function load(host){host.innerHTML='<div class="cf-w-msg">Ładowanie prognozy pogody…</div>';try{const settled=await Promise.allSettled(CFG.models.map(getModel));let models=settled.filter(x=>x.status==='fulfilled').map(x=>x.value),fb=false;if(models.length<2){models=await fallback();fb=true;}const days=combine(models);if(!days.length)throw new Error('Brak dni');render(host,days,models.map(x=>x.model.label),fb);}catch(e){console.warn('CleanFleet weather',e);error(host);}}
  function mount(){const host=document.getElementById('cfWeatherSlot');if(!host)return;styles();placeUnderHeader(host);load(host);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();