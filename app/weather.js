(() => {
  'use strict';

  const CF_WEATHER = {
    latitude: 50.018386,
    longitude: 18.982804,
    timezone: 'Europe/Warsaw',
    days: 7,
    models: [
      { id: 'ecmwf_ifs025', label: 'ECMWF' },
      { id: 'icon_seamless', label: 'ICON' },
      { id: 'gfs_seamless', label: 'GFS' },
      { id: 'metno_seamless', label: 'MET Norway' }
    ]
  };

  const DAY_NAMES = ['ND','PN','WT','ŚR','CZ','PT','SO'];
  const LONG_DAY_NAMES = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
  const avg = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
  const median = a => {
    if(!a.length) return null;
    const x=[...a].sort((m,n)=>m-n), i=Math.floor(x.length/2);
    return x.length%2 ? x[i] : (x[i-1]+x[i])/2;
  };
  const stdev = a => {
    if(a.length<2) return 0;
    const m=avg(a);
    return Math.sqrt(avg(a.map(v=>(v-m)**2)));
  };
  const val=(x,f=null)=>Number.isFinite(Number(x))?Number(x):f;
  const round1=x=>Math.round((x||0)*10)/10;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function statusFrom(score,rain,gust){
    if(score>=82 && rain<0.6 && gust<35) return {key:'very-good',color:'#48a868',label:'Bardzo dobre warunki'};
    if(score>=67) return {key:'good',color:'#65ad58',label:'Dobre warunki'};
    if(score>=48) return {key:'uncertain',color:'#d9b62f',label:'Warunki niepewne'};
    if(score>=30) return {key:'poor',color:'#e18a32',label:'Słabe warunki'};
    return {key:'bad',color:'#d95757',label:'Złe warunki'};
  }

  function weatherText(d){
    if(d.rain>=5) return 'Wyraźny sygnał deszczu';
    if(d.rain>=1.5) return 'Prawdopodobne opady';
    if(d.wetModels>=Math.ceil(d.modelCount/2) && d.rain>=0.5) return 'Możliwy przelotny deszcz';
    if(d.gust>=50) return 'Silniejsze porywy wiatru';
    if(d.gust>=35) return 'Umiarkowany wiatr';
    return 'Przeważnie sucho';
  }

  function buildUrl(modelId){
    const p=new URLSearchParams({
      latitude:String(CF_WEATHER.latitude),
      longitude:String(CF_WEATHER.longitude),
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
      timezone:CF_WEATHER.timezone,
      forecast_days:String(CF_WEATHER.days),
      models:modelId
    });
    return `https://api.open-meteo.com/v1/forecast?${p}`;
  }

  async function fetchModel(model){
    const c=new AbortController(), t=setTimeout(()=>c.abort(),9000);
    try{
      const r=await fetch(buildUrl(model.id),{cache:'no-store',signal:c.signal});
      if(!r.ok) throw new Error(String(r.status));
      const j=await r.json();
      if(!j?.daily?.time?.length) throw new Error('Brak danych');
      return {model,daily:j.daily};
    } finally { clearTimeout(t); }
  }

  async function fetchFallback(){
    const p=new URLSearchParams({
      latitude:String(CF_WEATHER.latitude),longitude:String(CF_WEATHER.longitude),
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
      timezone:CF_WEATHER.timezone,forecast_days:String(CF_WEATHER.days)
    });
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store'});
    if(!r.ok) throw new Error('Brak prognozy');
    const j=await r.json();
    return [{model:{id:'best_match',label:'Open-Meteo Best Match'},daily:j.daily}];
  }

  function combine(models){
    const dates=models[0]?.daily?.time||[];
    return dates.map((date,i)=>{
      const rows=models.map(m=>({
        label:m.model.label,
        tmax:val(m.daily.temperature_2m_max?.[i]),
        tmin:val(m.daily.temperature_2m_min?.[i]),
        rain:val(m.daily.precipitation_sum?.[i],0),
        pop:val(m.daily.precipitation_probability_max?.[i]),
        wind:val(m.daily.wind_speed_10m_max?.[i],0),
        gust:val(m.daily.wind_gusts_10m_max?.[i],0)
      }));
      const rainVals=rows.map(r=>r.rain).filter(Number.isFinite);
      const gustVals=rows.map(r=>r.gust).filter(Number.isFinite);
      const windVals=rows.map(r=>r.wind).filter(Number.isFinite);
      const tmaxVals=rows.map(r=>r.tmax).filter(Number.isFinite);
      const tminVals=rows.map(r=>r.tmin).filter(Number.isFinite);
      const popVals=rows.map(r=>r.pop).filter(Number.isFinite);
      const rain=median(rainVals)??0;
      const wind=median(windVals)??0;
      const gust=Math.max(median(gustVals)??0,wind);
      const wetModels=rows.filter(r=>r.rain>=0.5).length;
      const wetShare=rows.length?wetModels/rows.length:0;
      const wetAgreement=rows.length?Math.max(wetShare,1-wetShare):0.5;
      const spreadPenalty=clamp(stdev(rainVals)*5+stdev(gustVals)*0.6,0,28);
      const agreementPenalty=clamp((1-wetAgreement)*28,0,14);
      const confidence=Math.round(clamp(96-spreadPenalty-agreementPenalty-i*1.8,40,96));

      let rainPenalty=0;
      if(rain>=8) rainPenalty=55;
      else if(rain>=4) rainPenalty=42;
      else if(rain>=2) rainPenalty=30;
      else if(rain>=0.8) rainPenalty=18;
      else if(rain>=0.3) rainPenalty=9;
      if(wetShare>=0.75) rainPenalty+=6;

      let windPenalty=0;
      if(gust>=65) windPenalty=35;
      else if(gust>=50) windPenalty=25;
      else if(gust>=40) windPenalty=16;
      else if(gust>=30) windPenalty=8;

      const score=Math.round(clamp(100-rainPenalty-windPenalty-Math.max(0,(72-confidence)*0.35),0,100));
      return {
        date,rows,modelCount:rows.length,wetModels,
        tmax:round1(avg(tmaxVals)),tmin:round1(avg(tminVals)),
        rain:round1(rain),pop:popVals.length?Math.round(avg(popVals)):null,
        wind:Math.round(wind),gust:Math.round(gust),confidence,score,
        status:statusFrom(score,rain,gust)
      };
    });
  }

  function dayInfo(dateStr){
    const d=new Date(`${dateStr}T12:00:00`);
    return {
      short:DAY_NAMES[d.getDay()],
      long:LONG_DAY_NAMES[d.getDay()],
      date:d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})
    };
  }

  function injectStyles(){
    if(document.getElementById('cfWeatherStyles')) return;
    const s=document.createElement('style');
    s.id='cfWeatherStyles';
    s.textContent=`
      .cf-weather-card{margin:4px 0 10px;background:#fff;border:1px solid #e6e9e7;border-radius:13px;box-shadow:0 4px 14px rgba(0,0,0,.035);overflow:hidden}
      .cf-weather-days{display:grid;grid-template-columns:repeat(7,1fr);min-height:46px}
      .cf-weather-day{appearance:none;border:0;border-right:1px solid #edf0ee;background:#fff;padding:7px 2px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;color:var(--ink,#111);font:800 10px/1.05 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .cf-weather-day:last-child{border-right:0}.cf-weather-day:active{background:#f6f8f6}.cf-weather-day:hover{background:#fafbfa}
      .cf-weather-dot{width:8px;height:8px;border-radius:50%;display:block;box-shadow:0 0 0 2px rgba(0,0,0,.035)}
      .cf-weather-loading{height:46px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#7a837d}
      .cf-weather-error{min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:11px;color:#7a514d}.cf-weather-retry{border:0;background:none;color:#536126;font-weight:800;padding:4px;cursor:pointer}
      .cf-weather-modal-backdrop{position:fixed;inset:0;z-index:99998;background:rgba(15,18,16,.42);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}
      .cf-weather-modal{position:relative;width:min(390px,100%);background:#fff;border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.28);padding:20px;color:var(--ink,#111)}
      .cf-weather-close{position:absolute;right:12px;top:10px;width:34px;height:34px;border:0;border-radius:50%;background:#f2f4f2;color:#333;font-size:22px;line-height:1;cursor:pointer}
      .cf-weather-modal-day{font-size:12px;font-weight:800;color:#768078;text-transform:uppercase;letter-spacing:.06em}
      .cf-weather-modal-title{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;margin:7px 40px 3px 0}.cf-weather-modal-title .cf-weather-dot{width:10px;height:10px;flex:none}
      .cf-weather-summary{font-size:13px;color:#646d67;margin-bottom:16px}
      .cf-weather-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cf-weather-metric{background:#f7f8f7;border:1px solid #ecefec;border-radius:12px;padding:11px 12px}.cf-weather-metric span{display:block;font-size:10px;color:#818983;margin-bottom:3px}.cf-weather-metric strong{font-size:15px}
      .cf-weather-confidence{margin-top:12px;padding-top:12px;border-top:1px solid #edf0ee;display:flex;justify-content:space-between;gap:14px;font-size:11px;color:#747d77}.cf-weather-confidence strong{color:#343b36}
      .cf-weather-models{font-size:10px;color:#959c97;margin-top:8px;line-height:1.4}
      @media(max-width:520px){.cf-weather-card{border-radius:11px}.cf-weather-days{min-height:43px}.cf-weather-day{font-size:9px;padding:6px 1px}.cf-weather-dot{width:7px;height:7px}.cf-weather-modal{padding:18px}}
    `;
    document.head.appendChild(s);
  }

  function renderLoading(host){ host.innerHTML='<div class="cf-weather-loading">Ładowanie pogody…</div>'; }

  function closeModal(){
    document.getElementById('cfWeatherModalBackdrop')?.remove();
    document.body.style.overflow='';
  }

  function openDayModal(day,modelLabels,fallback){
    closeModal();
    const di=dayInfo(day.date);
    const el=document.createElement('div');
    el.id='cfWeatherModalBackdrop';
    el.className='cf-weather-modal-backdrop';
    el.innerHTML=`<div class="cf-weather-modal" role="dialog" aria-modal="true" aria-label="Pogoda ${esc(di.long)}">
      <button type="button" class="cf-weather-close" aria-label="Zamknij">×</button>
      <div class="cf-weather-modal-day">${esc(di.long)} · ${di.date}</div>
      <div class="cf-weather-modal-title"><span class="cf-weather-dot" style="background:${day.status.color}"></span>${esc(day.status.label)}</div>
      <div class="cf-weather-summary">${esc(weatherText(day))}</div>
      <div class="cf-weather-grid">
        <div class="cf-weather-metric"><span>Temperatura</span><strong>${Math.round(day.tmin)}–${Math.round(day.tmax)}°C</strong></div>
        <div class="cf-weather-metric"><span>Opad</span><strong>${day.rain.toFixed(1)} mm${day.pop==null?'':` · ${day.pop}%`}</strong></div>
        <div class="cf-weather-metric"><span>Wiatr</span><strong>${day.wind} km/h</strong></div>
        <div class="cf-weather-metric"><span>Porywy</span><strong>${day.gust} km/h</strong></div>
      </div>
      <div class="cf-weather-confidence"><span>Pewność prognozy</span><strong>${day.confidence}%</strong></div>
      <div class="cf-weather-models">${fallback?'Tryb zapasowy':'Analiza modeli'}: ${esc(modelLabels.join(' • '))}</div>
    </div>`;
    el.addEventListener('click',e=>{ if(e.target===el) closeModal(); });
    el.querySelector('.cf-weather-close')?.addEventListener('click',closeModal);
    document.addEventListener('keydown',function escClose(e){ if(e.key==='Escape'){closeModal();document.removeEventListener('keydown',escClose);} });
    document.body.appendChild(el);
    document.body.style.overflow='hidden';
  }

  function render(host,days,modelLabels,fallback=false){
    host.innerHTML=`<div class="cf-weather-days">${days.map((d,i)=>{
      const di=dayInfo(d.date);
      return `<button type="button" class="cf-weather-day" data-weather-day="${i}" aria-label="${esc(di.long)}: ${esc(d.status.label)}" title="${esc(weatherText(d))}"><span>${di.short}</span><span class="cf-weather-dot" style="background:${d.status.color}"></span></button>`;
    }).join('')}</div>`;
    host.querySelectorAll('[data-weather-day]').forEach(btn=>btn.addEventListener('click',()=>{
      const i=Number(btn.dataset.weatherDay||0);
      openDayModal(days[i],modelLabels,fallback);
    }));
  }

  function renderError(host){
    host.innerHTML='<div class="cf-weather-error">Nie udało się pobrać pogody.<button type="button" class="cf-weather-retry">Ponów</button></div>';
    host.querySelector('.cf-weather-retry')?.addEventListener('click',()=>load(host));
  }

  async function load(host){
    renderLoading(host);
    try{
      const settled=await Promise.allSettled(CF_WEATHER.models.map(fetchModel));
      let models=settled.filter(x=>x.status==='fulfilled').map(x=>x.value), fallback=false;
      if(models.length<2){ models=await fetchFallback(); fallback=true; }
      const days=combine(models);
      if(!days.length) throw new Error('Brak dni');
      render(host,days,models.map(m=>m.model.label),fallback);
    }catch(e){ console.warn('CleanFleet weather:',e); renderError(host); }
  }

  function mount(){
    if(document.getElementById('cfWeatherCard')) return;
    const anchor=document.querySelector('.active-section-head');
    const wrap=anchor?.parentElement||document.querySelector('.wrap');
    if(!anchor||!wrap) return;
    injectStyles();
    const host=document.createElement('section');
    host.id='cfWeatherCard';
    host.className='cf-weather-card';
    host.setAttribute('aria-label','Prognoza pogody');
    wrap.insertBefore(host,anchor);
    load(host);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
