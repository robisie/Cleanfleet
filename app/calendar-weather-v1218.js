(()=>{
  'use strict';

  function ensureStyles(){
    if(document.getElementById('cfCalendarWeather1218Styles'))return;
    const s=document.createElement('style');
    s.id='cfCalendarWeather1218Styles';
    s.textContent=`
      #cfWeatherModal.cf-w-bg{z-index:140001!important}
      #cfCalMini [data-date]>.cf-cal-weather-row{display:flex;align-items:center;justify-content:flex-start;min-height:30px;margin:0 -2px 4px;padding:0 2px 5px;border-bottom:1px solid #eceee8}
      .cf-cal-weather-btn{width:100%;border:0;background:transparent;padding:5px 2px 2px;display:flex;align-items:center;justify-content:flex-start;gap:5px;color:#454945;cursor:pointer;text-align:left;font:800 10px/1 system-ui,-apple-system,sans-serif}
      .cf-cal-weather-btn:active{opacity:.65}.cf-cal-weather-ico{font-size:15px;line-height:1}.cf-cal-weather-temp{font-size:10px;font-weight:900}.cf-cal-weather-btn .cf-signal{gap:3px}.cf-cal-weather-btn .cf-signal-dot{width:6px;height:6px}.cf-cal-weather-btn .cf-rain-period{font-size:9px}
      .cf-cal-weather-loading{font:700 9px/1 system-ui,-apple-system,sans-serif;color:#9a9e99;padding:5px 2px 7px}
      @media(max-width:620px){.cf-cal-weather-btn{gap:4px}.cf-cal-weather-ico{font-size:14px}.cf-cal-weather-temp{font-size:9px}.cf-cal-weather-btn .cf-rain-period{font-size:8px}}
    `;
    document.head.appendChild(s);
  }

  function fallbackSignal(d){
    if(!d)return'';
    const sig=d.signal||{};
    const parts=[`<span class="cf-signal-dot" style="background:${sig.dot||'#48a868'}"></span>`];
    if(sig.allDayRain)parts.push('<span class="cf-signal-dot" style="background:#3498db"></span>');
    else (sig.letters||[]).forEach(x=>parts.push(`<span class="cf-rain-period">${x}</span>`));
    return `<span class="cf-signal">${parts.join('')}</span>`;
  }

  function decorate(){
    const cal=document.getElementById('cfCalMini');
    if(!cal)return;
    const bridge=window.cfWeatherBridge;
    cal.querySelectorAll('[data-date]').forEach(day=>{
      const date=day.dataset.date;
      const head=day.querySelector('.cf-cal-day-head');
      if(!head||!date)return;
      let row=day.querySelector(':scope > .cf-cal-weather-row');
      if(!row){
        row=document.createElement('div');
        row.className='cf-cal-weather-row';
        head.insertAdjacentElement('afterend',row);
      }
      const d=bridge?.getDay?.(date)||null;
      if(!d){
        row.innerHTML='<div class="cf-cal-weather-loading">Prognoza niedostępna</div>';
        return;
      }
      const ico=bridge?.icon?.(date)||'🌤️';
      const sig=bridge?.signalHtml?.(date)||fallbackSignal(d);
      const label=`${ico} ${Math.round(d.tmax)}°`;
      if(row.dataset.sig===`${date}|${label}|${d.rainPeriods?.join('')||''}|${d.signal?.label||''}`)return;
      row.dataset.sig=`${date}|${label}|${d.rainPeriods?.join('')||''}|${d.signal?.label||''}`;
      row.innerHTML=`<button type="button" class="cf-cal-weather-btn" data-cf-cal-weather-date="${date}" title="Pokaż szczegóły pogody"><span class="cf-cal-weather-ico">${ico}</span><span class="cf-cal-weather-temp">${Math.round(d.tmax)}°</span>${sig}</button>`;
    });
  }

  function schedule(){[0,100,250,600,1200,2500].forEach(ms=>setTimeout(decorate,ms));}

  function start(){
    ensureStyles();
    schedule();
    window.addEventListener('cf-weather-updated',schedule);
    document.addEventListener('click',e=>{
      const weatherBtn=e.target.closest?.('[data-cf-cal-weather-date]');
      if(weatherBtn){
        e.preventDefault();e.stopPropagation();
        window.cfWeatherBridge?.openDay?.(weatherBtn.dataset.cfCalWeatherDate);
        return;
      }
      if(e.target.closest?.('#cfCompanyCalendarCard,#cfCalMini [data-p],#cfCalMini [data-n],#cfCalMini [data-t]'))schedule();
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();