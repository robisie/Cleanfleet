(() => {
  'use strict';

  const CFG={lat:50.018386,lon:18.982804,tz:'Europe/Warsaw',days:7,models:['ecmwf_ifs025','icon_seamless','gfs_seamless','metno_seamless']};
  const GREEN='#48a868', BLUE='#3498db', RED='#d95757';
  let days=[];

  const med=a=>{if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
  const num=v=>Number.isFinite(Number(v))?Number(v):0;

  function styleFor(d){
    // Najpierw deszcz: mocny deszcz ma zawsze priorytet nad oceną ogólną.
    if(d.rain>=4 || (d.rain>=2 && d.pop>=70)) return `linear-gradient(90deg,${BLUE} 0 50%,${RED} 50% 100%)`;
    // Silne porywy bez dużych opadów = czerwony sygnał wiatrowy.
    if(d.gust>=55) return RED;
    // Nawet drobne/przelotne opady = zielono-niebieska kropka.
    if(d.rain>=0.2 || d.pop>=25) return `linear-gradient(90deg,${GREEN} 0 50%,${BLUE} 50% 100%)`;
    // Sucho i bez wichury.
    return GREEN;
  }

  async function fetchModel(model){
    const p=new URLSearchParams({latitude:String(CFG.lat),longitude:String(CFG.lon),daily:'precipitation_sum,precipitation_probability_max,wind_gusts_10m_max',timezone:CFG.tz,forecast_days:String(CFG.days),models:model});
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store'});
    if(!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  function combine(rows){
    const dates=rows[0]?.daily?.time||[];
    return dates.map((date,i)=>{
      const rain=med(rows.map(r=>num(r.daily?.precipitation_sum?.[i])));
      const pops=rows.map(r=>num(r.daily?.precipitation_probability_max?.[i])).filter(Number.isFinite);
      const gust=med(rows.map(r=>num(r.daily?.wind_gusts_10m_max?.[i])));
      const pop=pops.length?Math.round(pops.reduce((a,b)=>a+b,0)/pops.length):0;
      return {date,rain,pop,gust};
    });
  }

  function applyDot(dot,d){if(dot&&d)dot.style.background=styleFor(d);}

  function apply(){
    if(!days.length)return;
    document.querySelectorAll('#cfWeatherSlot [data-i]').forEach(btn=>applyDot(btn.querySelector('.cf-w-dot'),days[Number(btn.dataset.i)]));
    document.querySelectorAll('[data-overview-day]').forEach(btn=>applyDot(btn.querySelector('.cf-w-dot'),days[Number(btn.dataset.overviewDay)]));

    // Szczegóły dnia: dopasowanie po dacie dd.mm widocznej w nagłówku modala.
    const modal=document.getElementById('cfWeatherModal');
    const dateEl=modal?.querySelector('.cf-w-date');
    const titleDot=modal?.querySelector('.cf-w-title .cf-w-dot');
    if(dateEl&&titleDot){
      const m=dateEl.textContent.match(/(\d{2}\.\d{2})/);
      if(m){
        const d=days.find(x=>{const dt=new Date(`${x.date}T12:00:00`);return dt.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})===m[1];});
        applyDot(titleDot,d);
      }
    }
  }

  async function load(){
    try{
      const s=await Promise.allSettled(CFG.models.map(fetchModel));
      const ok=s.filter(x=>x.status==='fulfilled').map(x=>x.value);
      if(!ok.length)return;
      days=combine(ok);
      apply();
    }catch(e){console.warn('CleanFleet weather colors',e);}
  }

  const obs=new MutationObserver(()=>apply());
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{obs.observe(document.body,{childList:true,subtree:true});load();},{once:true});
  }else{
    obs.observe(document.body,{childList:true,subtree:true});
    load();
  }
})();