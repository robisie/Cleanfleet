(() => {
  'use strict';

  function findSearchButton(){
    return [...document.querySelectorAll('button,input[type="button"],input[type="submit"]')].find(el => {
      const text = ((el.textContent || el.value || '') + '').trim().toUpperCase();
      return text === 'SZUKAJ';
    }) || null;
  }

  function findSearchInputNear(button){
    if(!button) return null;
    let node = button.parentElement;
    for(let i=0; i<5 && node; i++, node=node.parentElement){
      const input = node.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
      if(input) return input;
    }
    return null;
  }

  function findSearchRow(button,input){
    if(!button) return null;
    let node = button.parentElement;
    for(let i=0; i<6 && node; i++, node=node.parentElement){
      if(input && node.contains(input) && node.contains(button)) {
        const r=node.getBoundingClientRect();
        if(r.width>250 && r.height<180) return node;
      }
    }
    return button.parentElement;
  }

  function moveWeather(){
    const weather=document.getElementById('cfWeatherCard');
    const button=findSearchButton();
    const input=findSearchInputNear(button);
    const row=findSearchRow(button,input);
    if(!weather || !row || !row.parentElement) return false;

    if(weather.nextElementSibling===row) return true;

    row.parentElement.insertBefore(weather,row);
    weather.style.margin='8px 0 10px';
    weather.style.width='100%';
    return true;
  }

  function boot(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(moveWeather() || tries>=40) clearInterval(timer);
    },250);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
