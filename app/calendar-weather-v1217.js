(()=>{
  'use strict';

  const CFG={lat:50.018386,lon:18.982804,tz:'Europe/Warsaw',days:7};
  let weather=new Map();
  let loading=false;

  const pad=n=>String(n).padStart(2,'0');
  const localYmd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  function ensureStyles(){
    if(document.getElementById('cfCalendarWeather1217Styles'))return;
    const s=document.createElement('style');
    s.id='cfCalendarWeather1217Styles';
    s.textContent=`
      .cf-cal-weather{display:inline-flex;align-items:center;justify-content:center;gap:3px;margin-left:auto;margin-right:4px;white-space:nowrap;font:800 10px/1 system-ui,-apple-system,sans-serif;color:#444}
      .cf-cal-weather-ico{font-size:14px;line-height:1}
      .cf-cal-weather-temp{font-size:10px;font-weight:900}
      .cf-cal-weather .cf-signal{margin-left:1px;gap:2px}
      .cf-cal-weather .cf-signal-dot{width:6px;height:6px}
      .cf-cal-weather .cf-rain-period{font-size:9px}
      @media(max-width:620px){.cf-cal-weather{gap:2px;margin-right:2px}.cf-cal-weather-ico{font-size:13px}.cf-cal-weather-temp{font-size:9px}.cf-cal-weather .cf-rain-period{font-size:8px}}
    `;
    document.head.appendChild(s);
  }

  function iconFor(code,rain){
    code=Number(code||0);rain=Number(rain||0);
    if([95,96,99].includes(code))return'⛈️';
    if([71,73,75,77,85,86].includes(code))return'🌨️';
    if(rain>=4||[61,63,65,80,81,82].includes(code))return'🌧️';
    if(rain>=0.2||[51,53,55,56,57].includes(code))return'🌦️';
    if(code===0)return'☀️';
    if([1,2].includes(code))return'🌤️';
    if(code===3)return'☁️';
    if([45,48].includes(code))return'🌫️';
    return'🌤️';
  }

  async function loadWeather(){
    if(loading||weather.size)return;
    loading=true;
    try{
      const p=new URLSearchParams({
        latitude:String(CFG.lat),longitude:String(CFG.lon),timezone:CFG.tz,forecast_days:String(CFG.days),
        daily:'temperature_2m_max,precipitation_sum,weather_code'
      });
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{cache:'no-store'});
      if(!r.ok)throw new Error(String(r.status));
      const j=await r.json();
      const d=j.daily||{};
      (d.time||[]).forEach((date,i)=>weather.set(date,{
        date,
        tmax:Number(d.temperature_2m_max?.[i]),
        rain:Number(d.precipitation_sum?.[i]||0),
        code:Number(d.weather_code?.[i]||0)
      }));
    }catch(e){console.warn('CleanFleet calendar weather:',e);}
    finally{loading=false;applySoon();}
  }

  function signalForDate(date){
    const target=new Date(`${date}T12:00:00`).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});
    const buttons=[...document.querySelectorAll('#cfWeatherSlot .cf-w-day[data-i]')];
    for(const b of buttons){
      if((b.querySelector('.cf-w-date-small')?.textContent||'').trim()===target){
        const sig=b.querySelector('.cf-signal');
        return sig?sig.cloneNode(true):null;
      }
    }
    return null;
  }

  function decorate(){
    const cal=document.getElementById('cfCalMini');
    if(!cal)return;
    cal.querySelectorAll('[data-date]').forEach(day=>{
      const date=day.dataset.date;
      const head=day.querySelector('.cf-cal-day-head');
      const plus=head?.querySelector('.cf-cal-add');
      if(!head||!plus||!date)return;
      let box=head.querySelector('.cf-cal-weather');
      if(!box){
        box=document.createElement('span');
        box.className='cf-cal-weather';
        plus.insertAdjacentElement('beforebegin',box);
      }
      const w=weather.get(date);
      if(w){
        const temp=Number.isFinite(w.tmax)?`${Math.round(w.tmax)}°`:'';
        const ico=iconFor(w.code,w.rain);
        if(box.dataset.base!==`${ico}|${temp}`){
          box.innerHTML=`<span class="cf-cal-weather-ico">${ico}</span><span class="cf-cal-weather-temp">${temp}</span>`;
          box.dataset.base=`${ico}|${temp}`;
        }
      }
      const old=box.querySelector('.cf-signal');
      const sig=signalForDate(date);
      if(sig){
        const a=old?.dataset?.sig||'',b=sig.dataset?.sig||'';
        if(!old||a!==b){old?.remove();box.appendChild(sig);}
      }
    });
  }

  function applySoon(){[0,120,350,800,1600,3000].forEach(ms=>setTimeout(decorate,ms));}

  function start(){
    ensureStyles();
    loadWeather();
    applySoon();
    document.addEventListener('click',e=>{
      if(e.target.closest('#cfCompanyCalendarCard,#cfCalMini [data-p],#cfCalMini [data-n],#cfCalMini [data-t]'))applySoon();
    },{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
