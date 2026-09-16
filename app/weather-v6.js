(()=>{
  'use strict';

  const CFG={lat:50.018386,lon:18.982804,tz:'Europe/Warsaw',days:7,retries:3,models:[
    {id:'ecmwf_ifs025',label:'ECMWF'},
    {id:'icon_seamless',label:'ICON'},
    {id:'gfs_seamless',label:'GFS'},
    {id:'metno_seamless',label:'MET Norway'}
  ]};
  const DS=['ND','PN','WT','ŚR','CZ','PT','SO'];
  const DL=['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
  const GREEN='#48a868',BLUE='#3498db',RED='#d95757';
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const med=a=>{if(!a.length)return null;const x=[...a].sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
  const sd=a=>{if(a.length<2)return 0;const m=avg(a);return Math.sqrt(avg(a.map(v=>(v-m)**2)));};
  const num=(x,f=null)=>Number.isFinite(Number(x))?Number(x):f;
  const r1=x=>Math.round((x||0)*10)/10;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let state={days:[],labels:[],missing:[],fallback:false,error:false,total:CFG.models.length};

  function dayInfo(s){const d=new Date(`${s}T12:00:00`);return{short:DS[d.getDay()],long:DL[d.getDay()],date:d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})};}
  function isHazardCode(code){return [56,57,66,67,71,73,75,77,85,86,95,96,99].includes(Number(code));}
  function periodForHour(h){if(h<10)return'R';if(h<17)return'P';return'W';}
  function rainPeriodDescription(periods){
    if(!periods.length)return'Możliwe drobne lub przelotne opady';
    const n={R:'rano',P:'w dzień',W:'wieczorem'};
    if(periods.length===1)return`Możliwe drobne lub przelotne opady ${n[periods[0]]}`;
    if(periods.length===2)return`Możliwe opady ${n[periods[0]]} i ${n[periods[1]]}`;
    return'Możliwe opady przez większą część dnia';
  }
  function classify(d){
    const hazard=d.gust>=55||d.hazardShare>=0.5;
    const heavy=d.rain>=4||(d.rain>=2&&d.pop>=70);
    const hasRain=d.rainPeriods.length>0||d.rain>=0.2||d.pop>=25;
    const allDayRain=d.rainPeriods.length===3;
    if(hazard)return{dot:RED,letters:d.rainPeriods,allDayRain,label:'Niebezpieczne warunki',desc:'Możliwe niebezpieczne zjawiska pogodowe'};
    if(heavy)return{dot:RED,letters:d.rainPeriods,allDayRain,label:'Słabe warunki',desc:'Mocne lub intensywne opady'};
    if(hasRain)return{dot:GREEN,letters:d.rainPeriods,allDayRain,label:'Dobre warunki',desc:rainPeriodDescription(d.rainPeriods)};
    if(d.gust<20)return{dot:GREEN,letters:[],allDayRain:false,label:'Wzorowe warunki',desc:'Sucho i spokojnie'};
    return{dot:GREEN,letters:[],allDayRain:false,label:'Bardzo dobre warunki',desc:'Sucho, możliwy lekki lub umiarkowany wiatr'};
  }
  function icon(d){
    const code=Number(d.code||0);
    if([95,96,99].includes(code))return'⛈️';
    if([71,73,75,77,85,86].includes(code))return'🌨️';
    if(d.rain>=4||[61,63,65,80,81,82].includes(code))return'🌧️';
    if(d.rain>=0.2||[51,53,55,56,57].includes(code))return'🌦️';
    if(code===0)return'☀️';
    if([1,2].includes(code))return'🌤️';
    if(code===3)return'☁️';
    if([45,48].includes(code))return'🌫️';
    if(d.gust>=45)return'💨';
    return'🌤️';
  }
  function apiUrl(model){
    const p=new URLSearchParams({
      latitude:String(CFG.lat),longitude:String(CFG.lon),timezone:CFG.tz,forecast_days:String(CFG.days),models:model,
      daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code',
      hourly:'precipitation,precipitation_probability'
    });
    return`https://api.open-meteo.com/v1/forecast?${p}`;
  }
  async function fetchOnce(m){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);
    try{
      const r=await fetch(apiUrl(m.id),{cache:'no-store',signal:c.signal});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const j=await r.json();
      if(!j?.daily?.time?.length)throw new Error('Brak danych dziennych');
      return{model:m,data:j};
    }finally{clearTimeout(t);}
  }
  async function fetchWithRetry(m){
    let last;
    for(let i=0;i<CFG.retries;i++){
      try{return await fetchOnce(m);}catch(e){last=e;if(i<CFG.retries-1)await sleep(600*(i+1));}
    }
    throw last||new Error('Błąd modelu');
  }
  async function fallback(){
    const p=new URLSearchParams({latitude:String(CFG.lat),longitude:String(CFG.lon),timezone:CFG.tz,forecast_days:String(CFG.days),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,weather_code',hourly:'precipitation,precipitation_probability'});
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store'});if(!r.ok)throw new Error('Brak prognozy');
    return[{model:{id:'best_match',label:'Open-Meteo Best Match'},data:await r.json()}];
  }
  function modelPeriods(row,date){
    const out={R:{sum:0,maxPop:0},P:{sum:0,maxPop:0},W:{sum:0,maxPop:0}};
    const times=row.data.hourly?.time||[],prec=row.data.hourly?.precipitation||[],pop=row.data.hourly?.precipitation_probability||[];
    for(let i=0;i<times.length;i++){
      const t=String(times[i]);if(!t.startsWith(date+'T'))continue;
      const key=periodForHour(Number(t.slice(11,13)));
      out[key].sum+=num(prec[i],0);out[key].maxPop=Math.max(out[key].maxPop,num(pop[i],0));
    }
    return out;
  }
  function combine(models){
    const dates=models[0]?.data?.daily?.time||[];
    return dates.map((date,i)=>{
      const rows=models.map(m=>({
        tmax:num(m.data.daily.temperature_2m_max?.[i]),tmin:num(m.data.daily.temperature_2m_min?.[i]),
        rain:num(m.data.daily.precipitation_sum?.[i],0),pop:num(m.data.daily.precipitation_probability_max?.[i],0),
        wind:num(m.data.daily.wind_speed_10m_max?.[i],0),gust:num(m.data.daily.wind_gusts_10m_max?.[i],0),code:num(m.data.daily.weather_code?.[i],0)
      }));
      const rv=rows.map(x=>x.rain).filter(Number.isFinite),gv=rows.map(x=>x.gust).filter(Number.isFinite),wv=rows.map(x=>x.wind).filter(Number.isFinite),tx=rows.map(x=>x.tmax).filter(Number.isFinite),tn=rows.map(x=>x.tmin).filter(Number.isFinite),pv=rows.map(x=>x.pop).filter(Number.isFinite),codes=rows.map(x=>x.code);
      const rain=med(rv)??0,wind=med(wv)??0,gust=Math.max(med(gv)??0,wind),wet=rows.filter(x=>x.rain>=0.5).length,share=rows.length?wet/rows.length:0,agree=rows.length?Math.max(share,1-share):0.5;
      const confidence=Math.round(clamp(96-clamp(sd(rv)*5+sd(gv)*0.6,0,28)-clamp((1-agree)*28,0,14)-i*1.8,40,96));
      const perModel=models.map(m=>modelPeriods(m,date));
      const rainPeriods=['R','P','W'].filter(key=>{
        const sums=perModel.map(x=>x[key].sum),pops=perModel.map(x=>x[key].maxPop),wetShare=sums.length?sums.filter(v=>v>=0.1).length/sums.length:0;
        return (med(sums)??0)>=0.2||((avg(pops)??0)>=40&&wetShare>=0.5);
      });
      const d={date,count:rows.length,wet,tmax:r1(avg(tx)),tmin:r1(avg(tn)),rain:r1(rain),pop:Math.round(avg(pv)??0),wind:Math.round(wind),gust:Math.round(gust),confidence,code:Math.round(med(codes)??0),hazardShare:codes.length?codes.filter(isHazardCode).length/codes.length:0,rainPeriods};
      d.signal=classify(d);return d;
    });
  }

  function signalHtml(d){
    const c=d.signal||classify(d);
    const parts=[`<span class="cf-signal-dot" style="background:${c.dot}"></span>`];
    if(c.allDayRain)parts.push(`<span class="cf-signal-dot" style="background:${BLUE}"></span>`);
    else c.letters.forEach(x=>parts.push(`<span class="cf-rain-period">${x}</span>`));
    return`<span class="cf-signal" aria-label="${esc(c.label)}">${parts.join('')}</span>`;
  }
  function modelLine(){
    if(state.fallback)return`Tryb zapasowy: ${esc(state.labels.join(' • '))}`;
    const base=`Analiza modeli: ${state.labels.length}/${state.total} · ${esc(state.labels.join(' • '))}`;
    return state.missing.length?`${base}<br><span style="color:#b26b55">Brak odpowiedzi: ${esc(state.missing.join(' • '))}</span>`:base;
  }
  function ensureStyles(){
    if(document.getElementById('cfWeatherStylesV6'))return;
    const s=document.createElement('style');s.id='cfWeatherStylesV6';s.textContent=`
      #cfWeatherSlot{margin:8px 0 12px;background:#fff;border:1px solid #e6e9e7;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.035);width:100%;box-sizing:border-box}
      .cf-w-days{display:grid;grid-template-columns:58px repeat(7,1fr);min-height:58px}.cf-w-home,.cf-w-day{border:0;border-right:1px solid #edf0ee;background:#fff;padding:7px 2px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;color:#222;font:800 10px/1 system-ui,-apple-system,sans-serif}.cf-w-day:last-child{border-right:0}.cf-w-home{font-size:22px}.cf-w-topline{display:flex;align-items:center;justify-content:center;gap:4px}.cf-w-date-small{font-size:8px;font-weight:700;color:#8b938e}.cf-w-msg{min-height:50px;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;font-size:11px;color:#727b75}.cf-w-retry{border:0;background:none;color:#68751d;font-weight:800;cursor:pointer}
      .cf-signal{display:inline-flex;align-items:center;gap:4px;vertical-align:middle}.cf-signal-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}.cf-rain-period{color:${BLUE};font-weight:900;font-size:10px;line-height:1}
      .cf-w-bg{position:fixed;inset:0;z-index:99998;background:rgba(15,18,16,.42);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}.cf-w-modal{position:relative;width:min(430px,100%);max-height:min(780px,92vh);overflow:auto;background:#fff;border-radius:20px;box-shadow:0 22px 70px rgba(0,0,0,.28);padding:20px;color:#171a18}.cf-w-close{position:absolute;right:12px;top:10px;width:34px;height:34px;border:0;border-radius:50%;background:#f2f4f2;font-size:22px;cursor:pointer}.cf-w-back{display:inline-flex;align-items:center;gap:6px;border:0;background:#f2f4f2;color:#4c554f;border-radius:999px;padding:7px 11px;margin:-2px 0 10px;font-size:11px;font-weight:800;cursor:pointer}.cf-w-date{font-size:12px;font-weight:800;color:#768078;text-transform:uppercase}.cf-w-title{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;margin:7px 40px 3px 0}.cf-w-title .cf-signal{gap:5px}.cf-w-title .cf-signal-dot{width:10px;height:10px}.cf-w-title .cf-rain-period{font-size:13px}.cf-w-summary{font-size:13px;color:#646d67;margin-bottom:16px}.cf-w-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.cf-w-metric{background:#f7f8f7;border:1px solid #ecefec;border-radius:12px;padding:11px 12px}.cf-w-metric span{display:block;font-size:10px;color:#818983;margin-bottom:3px}.cf-w-metric strong{font-size:15px}.cf-w-conf{margin-top:12px;padding-top:12px;border-top:1px solid #edf0ee;display:flex;justify-content:space-between;font-size:11px;color:#747d77}.cf-w-models{font-size:10px;color:#959c97;margin-top:8px;line-height:1.45}
      .cf-overview-now{display:flex;align-items:center;gap:14px;margin:6px 0 14px}.cf-overview-icon{font-size:46px;line-height:1}.cf-overview-temp{font-size:46px;line-height:.9;font-weight:900}.cf-overview-desc{font-size:13px;color:#646d67;line-height:1.35}.cf-overview-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.cf-overview-day{border:0;background:#f7f8f7;border-radius:12px;padding:9px 4px;cursor:pointer;color:inherit;text-align:center}.cf-overview-day strong{display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px}.cf-overview-day .ico{font-size:24px;margin:5px 0}.cf-overview-day .hi{font-size:12px;font-weight:900}.cf-overview-day .lo{font-size:10px;color:#8e9690}.cf-overview-hint{font-size:10px;color:#969e98;margin-top:10px;text-align:center}
      .cf-company-weather-card{grid-column:span 2!important;min-height:150px!important;padding:16px!important;text-align:left!important;cursor:default!important;background:#fff!important;border:1px solid var(--line,#e5e7e5)!important;color:var(--ink,#171a18)!important;display:block!important}.cf-weather-tile-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.cf-weather-tile-title{font-size:13px;font-weight:900}.cf-weather-tile-now{display:flex;align-items:flex-end;gap:8px}.cf-weather-tile-temp{font-size:40px;line-height:.95;font-weight:900}.cf-weather-tile-desc{font-size:11px;color:var(--ink-soft,#727b75);line-height:1.3;max-width:200px;padding-bottom:3px}.cf-weather-tile-days{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.cf-weather-tile-day{border:0;background:#f7f8f7;border-radius:10px;padding:8px 4px;cursor:pointer;text-align:center;color:inherit}.cf-weather-tile-day strong{display:flex;align-items:center;justify-content:center;gap:2px;font-size:10px}.cf-weather-tile-icon{font-size:20px;line-height:1.2;margin:2px 0}.cf-weather-tile-range{font-size:10px;font-weight:800}.cf-weather-tile-range span{color:#929993;font-weight:700}.cf-weather-tile-error{display:flex;align-items:center;justify-content:center;min-height:110px;font-size:12px;color:var(--ink-soft,#727b75)}
      @media(max-width:850px){.cf-company-weather-card{grid-column:1/-1!important}.cf-weather-tile-temp{font-size:36px}}@media(max-width:620px){.cf-w-days{grid-template-columns:46px repeat(7,1fr);min-height:68px}.cf-w-home{font-size:18px}.cf-w-day{font-size:9px;gap:3px}.cf-w-topline{flex-direction:column}.cf-w-date-small{font-size:7px}.cf-overview-days{grid-template-columns:repeat(4,1fr)}}
    `;document.head.appendChild(s);
  }
  function isVisible(el){if(!el)return false;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return false;return !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);}
  function close(){document.getElementById('cfWeatherModal')?.remove();}
  function dayModal(d,fromOverview=false){
    if(!d)return;close();const di=dayInfo(d.date),c=d.signal||classify(d),el=document.createElement('div');el.id='cfWeatherModal';el.className='cf-w-bg';
    el.innerHTML=`<div class="cf-w-modal"><button class="cf-w-close" type="button">×</button>${fromOverview?'<button class="cf-w-back" type="button">← Wstecz</button>':''}<div class="cf-w-date">${esc(di.long)} · ${di.date}</div><div class="cf-w-title">${signalHtml(d)}${esc(c.label)}</div><div class="cf-w-summary">${icon(d)} ${esc(c.desc)}</div><div class="cf-w-grid"><div class="cf-w-metric"><span>Temperatura</span><strong>${Math.round(d.tmin)}–${Math.round(d.tmax)}°C</strong></div><div class="cf-w-metric"><span>Opad</span><strong>${d.rain.toFixed(1)} mm · ${d.pop}%</strong></div><div class="cf-w-metric"><span>Wiatr</span><strong>${d.wind} km/h</strong></div><div class="cf-w-metric"><span>Porywy</span><strong>${d.gust} km/h</strong></div></div><div class="cf-w-conf"><span>Pewność prognozy</span><strong>${d.confidence}%</strong></div><div class="cf-w-models">${modelLine()}</div></div>`;
    el.addEventListener('click',e=>{if(e.target===el)close();});el.querySelector('.cf-w-close')?.addEventListener('click',close);el.querySelector('.cf-w-back')?.addEventListener('click',overviewModal);document.body.appendChild(el);
  }
  function overviewModal(){
    if(!state.days.length)return;close();const t=state.days[0],el=document.createElement('div');el.id='cfWeatherModal';el.className='cf-w-bg';
    el.innerHTML=`<div class="cf-w-modal"><button class="cf-w-close" type="button">×</button><div class="cf-w-date">Pogoda · Studzienice</div><div class="cf-overview-now"><div class="cf-overview-icon">${icon(t)}</div><div><div class="cf-overview-temp">${Math.round(t.tmax)}°</div><div class="cf-overview-desc">${esc(t.signal.desc)}</div></div></div><div class="cf-overview-days">${state.days.map((d,i)=>{const di=dayInfo(d.date);return`<button class="cf-overview-day" type="button" data-overview-day="${i}"><strong>${di.short}${signalHtml(d)}</strong><div class="ico">${icon(d)}</div><div class="hi">${Math.round(d.tmax)}°</div><div class="lo">${Math.round(d.tmin)}°</div><div class="lo">${di.date}</div></button>`;}).join('')}</div><div class="cf-overview-hint">Kliknij dzień, aby zobaczyć szczegóły opadów i wiatru.</div></div>`;
    el.addEventListener('click',e=>{if(e.target===el)close();});el.querySelector('.cf-w-close')?.addEventListener('click',close);el.querySelectorAll('[data-overview-day]').forEach(b=>b.addEventListener('click',()=>dayModal(state.days[Number(b.dataset.overviewDay)],true)));document.body.appendChild(el);
  }
  function renderStrip(host){
    host.innerHTML=`<div class="cf-w-days"><button class="cf-w-home" type="button" aria-label="Pełna prognoza pogody">🌤️</button>${state.days.map((d,i)=>{const di=dayInfo(d.date);return`<button class="cf-w-day" type="button" data-i="${i}"><span class="cf-w-topline"><span>${di.short}</span>${signalHtml(d)}</span><span class="cf-w-date-small">${di.date}</span></button>`;}).join('')}</div>`;
    host.querySelector('.cf-w-home')?.addEventListener('click',overviewModal);host.querySelectorAll('[data-i]').forEach(b=>b.addEventListener('click',()=>dayModal(state.days[Number(b.dataset.i)],false)));
  }
  function tileMarkup(){
    if(state.error)return'<div class="cf-weather-tile-error">Nie udało się załadować prognozy pogody.</div>';if(!state.days.length)return'<div class="cf-weather-tile-error">Ładowanie prognozy pogody…</div>';
    const t=state.days[0];return`<div class="cf-weather-tile-head"><div><div class="cf-weather-tile-title">Pogoda</div><div class="cf-weather-tile-now"><div class="cf-weather-tile-temp">${Math.round(t.tmax)}°</div><div class="cf-weather-tile-desc">${esc(t.signal.label)}</div></div></div><button type="button" class="cf-weather-tile-day" data-weather-open-overview style="font-size:22px;padding:6px 9px">${icon(t)}</button></div><div class="cf-weather-tile-days">${state.days.slice(0,5).map((d,i)=>{const di=dayInfo(d.date);return`<button type="button" class="cf-weather-tile-day" data-cf-weather-tile-day="${i}"><strong>${di.short}${signalHtml(d)}</strong><div class="cf-weather-tile-icon">${icon(d)}</div><div class="cf-weather-tile-range">${Math.round(d.tmax)}° <span>${Math.round(d.tmin)}°</span></div></button>`;}).join('')}</div>`;
  }
  function syncStripPosition(){
    const host=document.getElementById('cfWeatherSlot');if(!host)return;const grid=document.getElementById('cfCompanyGrid');if(isVisible(grid)){host.style.display='none';return;}const searchRow=[...document.querySelectorAll('.cf-main-search-row')].find(isVisible);if(searchRow?.parentElement){searchRow.insertAdjacentElement('beforebegin',host);host.style.display='block';return;}const headerTop=[...document.querySelectorAll('.header-top')].find(isVisible);if(headerTop?.parentElement){headerTop.insertAdjacentElement('afterend',host);host.style.display='block';return;}host.style.display='none';
  }
  function ensureDashboardTile(){
    const grid=document.getElementById('cfCompanyGrid');if(!isVisible(grid))return;let tile=document.getElementById('cfCompanyWeatherCard');if(!tile){tile=document.createElement('section');tile.id='cfCompanyWeatherCard';tile.className='cf-company-card cf-company-weather-card';grid.prepend(tile);}tile.innerHTML=tileMarkup();tile.querySelector('[data-weather-open-overview]')?.addEventListener('click',overviewModal);tile.querySelectorAll('[data-cf-weather-tile-day]').forEach(b=>b.addEventListener('click',()=>dayModal(state.days[Number(b.dataset.cfWeatherTileDay)],false)));
  }
  function refreshUi(){syncStripPosition();ensureDashboardTile();}
  function scheduleUi(){[0,120,350,800,1600,3000,5000].forEach(ms=>setTimeout(refreshUi,ms));}
  function expose(){
    window.cfWeatherBridge={
      getState:()=>state,
      getDay:date=>state.days.find(d=>d.date===date)||null,
      openDay:date=>dayModal(state.days.find(d=>d.date===date)||null,false),
      icon:date=>{const d=state.days.find(x=>x.date===date);return d?icon(d):'';},
      signalHtml:date=>{const d=state.days.find(x=>x.date===date);return d?signalHtml(d):'';}
    };
    window.dispatchEvent(new CustomEvent('cf-weather-updated',{detail:{ok:state.labels.length,total:state.total,missing:[...state.missing]}}));
  }
  function showError(host){state={...state,error:true};host.innerHTML='<div class="cf-w-msg">Nie udało się załadować prognozy pogody.<button type="button" class="cf-w-retry">Ponów</button></div>';host.querySelector('.cf-w-retry')?.addEventListener('click',()=>load(host));scheduleUi();expose();}
  async function load(host){
    state={days:[],labels:[],missing:[],fallback:false,error:false,total:CFG.models.length};host.innerHTML='<div class="cf-w-msg">Ładowanie prognozy pogody z 4 modeli…</div>';
    try{
      const settled=await Promise.allSettled(CFG.models.map(fetchWithRetry));
      let models=settled.filter(x=>x.status==='fulfilled').map(x=>x.value),fb=false;
      const missing=CFG.models.filter((m,i)=>settled[i].status!=='fulfilled').map(m=>m.label);
      if(models.length<2){models=await fallback();fb=true;}
      const days=combine(models);if(!days.length)throw new Error('Brak dni');
      state={days,labels:models.map(x=>x.model.label),missing:fb?CFG.models.map(x=>x.label):missing,fallback:fb,error:false,total:CFG.models.length};
      renderStrip(host);scheduleUi();expose();
    }catch(e){console.warn('CleanFleet weather v6',e);showError(host);}
  }
  function mount(){
    const host=document.getElementById('cfWeatherSlot');if(!host)return;ensureStyles();load(host);scheduleUi();document.addEventListener('click',e=>{if(e.target.closest('#cfCompanyCalendarCard,#cfCompanyGrid,[data-back],.cf-modal-back-btn,.cf-modal-close-btn'))setTimeout(refreshUi,100);},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();