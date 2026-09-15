(() => {
  'use strict';

  function norm(s){ return String(s || '').replace(/\s+/g,' ').trim().toUpperCase(); }

  function findSearchButton(){
    return [...document.querySelectorAll('button,input[type="button"],input[type="submit"]')]
      .find(el => norm(el.textContent || el.value) === 'SZUKAJ');
  }

  function findSearchRow(btn){
    if(!btn) return null;
    let el = btn.parentElement;
    for(let i=0; el && i<7; i++, el=el.parentElement){
      const hasInput = !!el.querySelector('input');
      const hasButton = [...el.querySelectorAll('button,input[type="button"],input[type="submit"]')]
        .some(x => norm(x.textContent || x.value) === 'SZUKAJ');
      if(hasInput && hasButton) return el;
    }
    return btn.parentElement;
  }

  function ensureMountAnchor(){
    if(document.getElementById('cfWeatherCard')) return true;
    if(document.querySelector('.cf-weather-mount-anchor')) return true;

    const btn = findSearchButton();
    const row = findSearchRow(btn);
    if(!row || !row.parentElement) return false;

    const anchor = document.createElement('div');
    anchor.className = 'active-section-head cf-weather-mount-anchor';
    anchor.setAttribute('aria-hidden','true');
    anchor.style.display = 'none';
    row.parentElement.insertBefore(anchor, row);
    return true;
  }

  function loadWeatherAgain(){
    if(document.getElementById('cfWeatherCard')) return;
    const s = document.createElement('script');
    s.src = '/app/weather.js?v=20260915-4';
    s.async = false;
    document.body.appendChild(s);
  }

  function boot(){
    if(document.getElementById('cfWeatherCard')) return;
    if(ensureMountAnchor()){
      loadWeatherAgain();
      return;
    }

    const obs = new MutationObserver(() => {
      if(ensureMountAnchor()){
        obs.disconnect();
        loadWeatherAgain();
      }
    });
    obs.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(() => obs.disconnect(),15000);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
