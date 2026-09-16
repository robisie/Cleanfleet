(()=>{
  'use strict';

  const REFRESH_MS = 90 * 60 * 1000;
  let lastRefresh = Date.now();
  let refreshing = false;
  let timer = null;

  function weatherHost(){
    return document.getElementById('cfWeatherSlot');
  }

  function refreshWeather(){
    if(refreshing || document.hidden || !weatherHost()) return;
    refreshing = true;
    lastRefresh = Date.now();

    const old = document.querySelector('script[data-cf-weather-dynamic="1"]');
    if(old) old.remove();

    const script = document.createElement('script');
    script.src = `/app/weather-v6.js?v=20260916-90m-${Date.now()}`;
    script.dataset.cfWeatherDynamic = '1';
    script.async = true;
    script.onload = ()=>{ refreshing = false; };
    script.onerror = ()=>{ refreshing = false; };
    document.head.appendChild(script);
  }

  function schedule(){
    if(timer) clearInterval(timer);
    timer = setInterval(()=>{
      if(Date.now() - lastRefresh >= REFRESH_MS) refreshWeather();
    }, 60 * 1000);
  }

  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && Date.now() - lastRefresh >= REFRESH_MS){
      refreshWeather();
    }
  }, {passive:true});

  window.addEventListener('pageshow', ()=>{
    if(Date.now() - lastRefresh >= REFRESH_MS) refreshWeather();
  }, {passive:true});

  schedule();
})();