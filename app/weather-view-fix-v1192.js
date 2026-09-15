(() => {
  'use strict';

  function isVisible(el){
    if(!el) return false;
    const cs=getComputedStyle(el);
    return cs.display!=='none' && cs.visibility!=='hidden' && el.getClientRects().length>0;
  }

  function syncWeatherView(){
    const host=document.getElementById('cfWeatherSlot');
    if(!host) return;

    const companyGrid=document.getElementById('cfCompanyGrid');
    const companyDashboardVisible=isVisible(companyGrid);
    document.body.classList.toggle('cf-company-dashboard-visible', companyDashboardVisible);

    if(companyDashboardVisible){
      return;
    }

    const headerTop=[...document.querySelectorAll('.header-top')].find(isVisible);
    if(headerTop && headerTop.parentElement && host.previousElementSibling!==headerTop){
      headerTop.insertAdjacentElement('afterend',host);
    }
  }

  function injectCss(){
    if(document.getElementById('cfWeatherViewFix1192')) return;
    const s=document.createElement('style');
    s.id='cfWeatherViewFix1192';
    s.textContent=`
      body.cf-company-dashboard-visible #cfWeatherSlot{display:none!important}
      body:not(.cf-company-dashboard-visible) #cfWeatherSlot{display:block!important}
    `;
    document.head.appendChild(s);
  }

  function boot(){
    injectCss();
    let queued=false;
    const schedule=()=>{
      if(queued) return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;syncWeatherView();});
    };
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
    window.addEventListener('pageshow',schedule);
    window.addEventListener('focus',schedule);
    schedule();
    setTimeout(schedule,250);
    setTimeout(schedule,1000);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();