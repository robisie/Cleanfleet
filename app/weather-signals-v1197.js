(() => {
  'use strict';

  const CFG={lat:50.018386,lon:18.982804,tz:'Europe/Warsaw',days:7,models:['ecmwf_ifs025','icon_seamless','gfs_seamless','metno_seamless']};
  const GREEN='#48a868', BLUE='#3498db', RED='#d95757';
  let days=[];

  const med=a=>{if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const fmtDate=s=>new Date(`${s}T12:00:00`).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});

  function isHazardCode(code){
    // WMO: marznąca mżawka/deszcz, śnieg/śnieżyca, burza/grad.
    return [56,57,66,67,71,73,75,77,85,86,95,96,99].includes(code);
  }

  function classify(d){
    const hazard=d.gust>=55 || d.hazardShare>=0.5;
    if(hazard) return {dots:[RED],label:'Niebezpieczne warunki',desc:'Możliwe niebezpieczne zjawiska pogodowe'};
    if(d.rain>=4 || (d.rain>=2 && d.pop>=70)) return {dots:[BLUE,RED],label:'Słabe warunki',desc:'Mocne lub intensywne opady'};
    if(d.rain>=0.2 || d.pop>=25) return {dots:[GREEN,BLUE],label:'Dobre warunki',desc:'Możliwe drobne lub przelotne opady'};
    if(d.gust<20) return {dots:[GREEN],label:'Wzorowe warunki',desc:'Sucho i spokojnie'};
    return {dots:[GREEN],label:'Bardzo dobre warunki',desc:'Sucho, możliwy lekki lub umiarkowany wiatr'};
  }

  function dotsHtml(c){
    return `<span class="cf-signal-dots" aria-label="${c.label}">${c.dots.map(x=>`<span class="cf-signal-dot" style="background:${x}"></span>`).join('')}</span>`;
  }

  function ensureStyles(){
    if(document.getElementById('cfWeatherSignals1197Styles'))return;
    const s=document.createElement('style');s.id='cfWeatherSignals1197Styles';s.textContent=`
      .cf-signal-dots{display:inline-flex;align-items:center;gap:3px;vertical-align:middle;margin-left:4px}
      .cf-signal-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}
      .cf-w-title .cf-signal-dots{margin-left:0;margin-right:2px}.cf-w-title .cf-signal-dot{width:10px;height:10px}
      .cf-weather-tile-title .cf-signal-dots{margin-left:6px}
    `;document.head.appendChild(s);
  }

  async function fetchModel(model){
    const p=new URLSearchParams({latitude:String(CFG.lat),longitude:String(CFG.lon),daily:'precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,weather_code',timezone:CFG.tz,forecast_days:String(CFG.days),models:model});
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store'});
    if(!r.ok)throw new Error(String(r.status));
    return r.json();
  }

  function combine(rows){
    const dates=rows[0]?.daily?.time||[];
    return dates.map((date,i)=>{
      const rain=med(rows.map(r=>num(r.daily?.precipitation_sum?.[i])));
      const pop=Math.round(avg(rows.map(r=>num(r.daily?.precipitation_probability_max?.[i]))));
      const gust=med(rows.map(r=>num(r.daily?.wind_gusts_10m_max?.[i])));
      const codes=rows.map(r=>num(r.daily?.weather_code?.[i]));
      const hazardShare=codes.length?codes.filter(isHazardCode).length/codes.length:0;
      return {date,rain,pop,gust,hazardShare};
    });
  }

  function dayByIndex(i){return days[Number(i)]||null;}
  function dayByVisibleDate(text){const m=String(text||'').match(/(\d{2}\.\d{2})/);return m?days.find(d=>fmtDate(d.date)===m[1]):null;}

  function replaceDots(container,d){
    if(!container||!d)return;
    const c=classify(d);
    container.querySelectorAll('.cf-w-dot,.cf-signal-dots').forEach(x=>x.remove());
    container.insertAdjacentHTML('beforeend',dotsHtml(c));
  }

  function apply(){
    if(!days.length)return;
    ensureStyles();

    // Pasek pod logo: dzień + osobne kropki.
    document.querySelectorAll('#cfWeatherSlot [data-i]').forEach(btn=>{
      const d=dayByIndex(btn.dataset.i), line=btn.querySelector('.cf-w-topline');
      if(line&&d)replaceDots(line,d);
    });

    // Pełny widok 7 dni.
    document.querySelectorAll('[data-overview-day]').forEach(btn=>{
      const d=dayByIndex(btn.dataset.overviewDay), title=btn.querySelector('strong');
      if(title&&d)replaceDots(title,d);
    });

    // Kafel pogody na ekranie firm — opis bieżącego dnia.
    const today=days[0], tc=today?classify(today):null;
    const tileDesc=document.querySelector('#cfCompanyWeatherCard .cf-weather-tile-desc');
    if(tileDesc&&tc)tileDesc.textContent=tc.label;

    // Szczegóły konkretnego dnia.
    const modal=document.getElementById('cfWeatherModal');
    const dateEl=modal?.querySelector('.cf-w-date');
    const title=modal?.querySelector('.cf-w-title');
    const summary=modal?.querySelector('.cf-w-summary');
    const d=dateEl?dayByVisibleDate(dateEl.textContent):null;
    if(title&&d){
      const c=classify(d);
      title.querySelectorAll('.cf-w-dot,.cf-signal-dots').forEach(x=>x.remove());
      title.insertAdjacentHTML('afterbegin',dotsHtml(c));
      const textNodes=[...title.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
      textNodes.forEach(n=>n.remove());
      title.append(document.createTextNode(c.label));
      if(summary){
        const ico=(summary.textContent||'').trim().split(/\s+/)[0]||'';
        summary.textContent=`${ico} ${c.desc}`.trim();
      }
    }

    // Pełny widok pogody — opis bieżącego dnia pod temperaturą.
    const overviewDesc=modal?.querySelector('.cf-overview-desc');
    if(overviewDesc&&tc)overviewDesc.textContent=tc.label;
  }

  async function load(){
    try{
      const settled=await Promise.allSettled(CFG.models.map(fetchModel));
      const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
      if(!ok.length)return;
      days=combine(ok);
      apply();
    }catch(e){console.warn('CleanFleet weather signals',e);}
  }

  const obs=new MutationObserver(()=>apply());
  const start=()=>{ensureStyles();obs.observe(document.body,{childList:true,subtree:true});load();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();