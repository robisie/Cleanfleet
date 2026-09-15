(() => {
  'use strict';

  const CFG={lat:50.018386,lon:18.982804,tz:'Europe/Warsaw',days:7,models:['ecmwf_ifs025','icon_seamless','gfs_seamless','metno_seamless']};
  const GREEN='#48a868', BLUE='#3498db', RED='#d95757';
  let days=[];

  const med=a=>{if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const fmtDate=s=>new Date(`${s}T12:00:00`).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});

  function isHazardCode(code){return [56,57,66,67,71,73,75,77,85,86,95,96,99].includes(code);}

  function periodForHour(h){if(h<10)return'R';if(h<17)return'P';return'W';}

  function classify(d){
    const hazard=d.gust>=55 || d.hazardShare>=0.5;
    const heavyRain=d.rain>=4 || (d.rain>=2 && d.pop>=70);
    const hasRain=d.rainPeriods.length>0 || d.rain>=0.2 || d.pop>=25;
    if(hazard) return {dot:RED,letters:d.rainPeriods,label:'Niebezpieczne warunki',desc:'Możliwe niebezpieczne zjawiska pogodowe'};
    if(heavyRain) return {dot:RED,letters:d.rainPeriods,label:'Słabe warunki',desc:'Mocne lub intensywne opady'};
    if(hasRain) return {dot:GREEN,letters:d.rainPeriods,label:'Dobre warunki',desc:rainPeriodDescription(d.rainPeriods)};
    if(d.gust<20) return {dot:GREEN,letters:[],label:'Wzorowe warunki',desc:'Sucho i spokojnie'};
    return {dot:GREEN,letters:[],label:'Bardzo dobre warunki',desc:'Sucho, możliwy lekki lub umiarkowany wiatr'};
  }

  function rainPeriodDescription(periods){
    if(!periods.length)return'Możliwe drobne lub przelotne opady';
    const names={R:'rano',P:'w dzień',W:'wieczorem'};
    if(periods.length===1)return`Możliwe drobne lub przelotne opady ${names[periods[0]]}`;
    if(periods.length===2)return`Możliwe opady ${names[periods[0]]} i ${names[periods[1]]}`;
    return'Możliwe opady w różnych porach dnia';
  }

  function ensureStyles(){
    if(document.getElementById('cfWeatherSignals1199Styles'))return;
    const s=document.createElement('style');s.id='cfWeatherSignals1199Styles';s.textContent=`
      .cf-signal{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin-left:4px}
      .cf-signal-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}
      .cf-rain-period{color:${BLUE};font-weight:900;font-size:10px;line-height:1;letter-spacing:.01em}
      .cf-w-title .cf-signal{margin-left:0;margin-right:4px;gap:5px}.cf-w-title .cf-signal-dot{width:10px;height:10px}.cf-w-title .cf-rain-period{font-size:13px}
      .cf-overview-day .cf-rain-period{font-size:9px}
    `;document.head.appendChild(s);
  }

  async function fetchModel(model){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);
    try{
      const p=new URLSearchParams({
        latitude:String(CFG.lat),longitude:String(CFG.lon),timezone:CFG.tz,forecast_days:String(CFG.days),models:model,
        daily:'precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,weather_code',
        hourly:'precipitation,precipitation_probability'
      });
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store',signal:c.signal});
      if(!r.ok)throw new Error(String(r.status));
      return r.json();
    } finally { clearTimeout(t); }
  }

  function modelPeriods(row,date){
    const out={R:{sum:0,maxPop:0},P:{sum:0,maxPop:0},W:{sum:0,maxPop:0}};
    const times=row.hourly?.time||[],prec=row.hourly?.precipitation||[],pop=row.hourly?.precipitation_probability||[];
    for(let i=0;i<times.length;i++){
      const t=String(times[i]);
      if(!t.startsWith(date+'T'))continue;
      const h=Number(t.slice(11,13));
      const key=periodForHour(h);
      out[key].sum+=num(prec[i]);
      out[key].maxPop=Math.max(out[key].maxPop,num(pop[i]));
    }
    return out;
  }

  function combine(rows){
    const dates=rows[0]?.daily?.time||[];
    return dates.map((date,i)=>{
      const rain=med(rows.map(r=>num(r.daily?.precipitation_sum?.[i])));
      const pop=Math.round(avg(rows.map(r=>num(r.daily?.precipitation_probability_max?.[i]))));
      const gust=med(rows.map(r=>num(r.daily?.wind_gusts_10m_max?.[i])));
      const codes=rows.map(r=>num(r.daily?.weather_code?.[i]));
      const hazardShare=codes.length?codes.filter(isHazardCode).length/codes.length:0;
      const perModel=rows.map(r=>modelPeriods(r,date));
      const rainPeriods=['R','P','W'].filter(key=>{
        const sums=perModel.map(x=>x[key].sum);
        const pops=perModel.map(x=>x[key].maxPop);
        const wetShare=sums.length?sums.filter(v=>v>=0.1).length/sums.length:0;
        const periodRain=med(sums),periodPop=avg(pops);
        return periodRain>=0.2 || (periodPop>=40 && wetShare>=0.5);
      });
      return{date,rain,pop,gust,hazardShare,rainPeriods};
    });
  }

  function dayByIndex(i){return days[Number(i)]||null;}
  function dayByVisibleDate(text){const m=String(text||'').match(/(\d{2}\.\d{2})/);return m?days.find(d=>fmtDate(d.date)===m[1]):null;}

  function signalSignature(c){return `${c.dot}|${c.letters.join('')}|${c.label}`;}
  function buildSignal(c){
    const wrap=document.createElement('span');wrap.className='cf-signal';wrap.dataset.sig=signalSignature(c);wrap.setAttribute('aria-label',c.label);
    const dot=document.createElement('span');dot.className='cf-signal-dot';dot.style.background=c.dot;wrap.appendChild(dot);
    c.letters.forEach(letter=>{const el=document.createElement('span');el.className='cf-rain-period';el.textContent=letter;wrap.appendChild(el);});
    return wrap;
  }
  function replaceSignal(container,d){
    if(!container||!d)return;
    const c=classify(d),sig=signalSignature(c),existing=container.querySelector('.cf-signal');
    if(existing?.dataset.sig===sig)return;
    container.querySelectorAll('.cf-w-dot,.cf-signal-dots,.cf-signal').forEach(x=>x.remove());
    container.appendChild(buildSignal(c));
  }

  function apply(){
    if(!days.length)return;
    ensureStyles();
    document.querySelectorAll('#cfWeatherSlot [data-i]').forEach(btn=>{const d=dayByIndex(btn.dataset.i),line=btn.querySelector('.cf-w-topline');if(line&&d)replaceSignal(line,d);});
    document.querySelectorAll('[data-overview-day]').forEach(btn=>{const d=dayByIndex(btn.dataset.overviewDay),title=btn.querySelector('strong');if(title&&d)replaceSignal(title,d);});

    const today=days[0],tc=today?classify(today):null;
    const tileDesc=document.querySelector('#cfCompanyWeatherCard .cf-weather-tile-desc');
    if(tileDesc&&tc&&tileDesc.textContent!==tc.label)tileDesc.textContent=tc.label;

    const modal=document.getElementById('cfWeatherModal'),dateEl=modal?.querySelector('.cf-w-date'),title=modal?.querySelector('.cf-w-title'),summary=modal?.querySelector('.cf-w-summary'),d=dateEl?dayByVisibleDate(dateEl.textContent):null;
    if(title&&d){
      const c=classify(d);replaceSignal(title,d);
      const text=[...title.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
      if(!text||text.textContent!==c.label){[...title.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());title.append(document.createTextNode(c.label));}
      if(summary){const ico=(summary.textContent||'').trim().split(/\s+/)[0]||'';const val=`${ico} ${c.desc}`.trim();if(summary.textContent!==val)summary.textContent=val;}
    }
    const overviewDesc=modal?.querySelector('.cf-overview-desc');
    if(overviewDesc&&tc&&overviewDesc.textContent!==tc.label)overviewDesc.textContent=tc.label;
  }

  function scheduleApply(){[0,250,700,1500,3000,5000].forEach(ms=>setTimeout(apply,ms));}
  async function load(){
    try{
      const settled=await Promise.allSettled(CFG.models.map(fetchModel));
      const ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
      if(!ok.length)return;
      days=combine(ok);scheduleApply();
    }catch(e){console.warn('CleanFleet weather signals',e);}
  }
  function start(){
    ensureStyles();load();
    document.addEventListener('click',e=>{if(e.target.closest('#cfWeatherSlot,[data-overview-day],[data-cf-weather-tile-day],[data-weather-open-overview],.cf-w-back'))setTimeout(apply,80);},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
