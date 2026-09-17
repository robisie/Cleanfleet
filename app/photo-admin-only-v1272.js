(()=>{
  'use strict';

  let timer=null;

  function admin(){
    try{return typeof cfIsAdmin==='function' && !!cfIsAdmin();}
    catch(_){return false;}
  }

  function ensureStyle(){
    if(document.getElementById('cfPhotoAdminOnly1272Style'))return;
    const s=document.createElement('style');
    s.id='cfPhotoAdminOnly1272Style';
    s.textContent=`body.cf-photo-admin-only [data-cf-photos]{display:none!important}`;
    document.head.appendChild(s);
  }

  function apply(){
    ensureStyle();
    const allowed=admin();
    document.body?.classList.toggle('cf-photo-admin-only',!allowed);
    if(!allowed){
      const overlay=document.getElementById('cfPhotoOverlay');
      if(overlay?.classList.contains('open'))overlay.classList.remove('open');
    }
  }

  function boot(){
    apply();
    const observer=new MutationObserver(()=>apply());
    observer.observe(document.body,{childList:true,subtree:true});
    let n=0;
    timer=setInterval(()=>{
      apply();
      if(++n>=80){clearInterval(timer);timer=null;}
    },250);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)apply()},{passive:true});
    document.addEventListener('click',e=>{
      if(admin())return;
      if(e.target.closest?.('[data-cf-photos]')){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
