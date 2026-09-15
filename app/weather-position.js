(() => {
  'use strict';

  function findSearchInput(){
    return document.querySelector('input[type="search"], input[placeholder*="szukaj" i], input[placeholder*="wyszuk" i]');
  }

  function findSearchBlock(input){
    if(!input) return null;
    return input.closest('.search-wrap,.search-box,.search-container,.toolbar,.filters,.filter-bar,.top-controls,.controls') || input.parentElement;
  }

  function moveWeather(){
    const weather=document.getElementById('cfWeatherCard');
    const input=findSearchInput();
    const block=findSearchBlock(input);
    if(!weather || !block || !block.parentElement) return false;
    if(weather.nextElementSibling===block) return true;
    block.parentElement.insertBefore(weather,block);
    weather.style.margin='6px 0 10px';
    return true;
  }

  function boot(){
    if(moveWeather()) return;
    const obs=new MutationObserver(()=>{
      if(moveWeather()) obs.disconnect();
    });
    obs.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>obs.disconnect(),10000);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
