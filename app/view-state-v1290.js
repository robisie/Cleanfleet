(()=>{
  'use strict';

  const STORAGE='cf-last-active-view-v1';
  let restoring=false;
  let restoreTried=false;
  let lastSaved='';

  function read(){
    try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch(_){return null}
  }
  function write(state){
    if(!state||restoring)return;
    const sig=JSON.stringify(state);
    if(sig===lastSaved)return;
    lastSaved=sig;
    try{localStorage.setItem(STORAGE,sig)}catch(_){}
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden')return false;
    return !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  }
  function isAdmin(){
    try{return typeof cfIsAdmin==='function'&&!!cfIsAdmin()}catch(_){return false}
  }
  function companyId(){
    try{
      if(typeof window.cfGetActiveCompanyId==='function')return window.cfGetActiveCompanyId()||null;
      return window.cfActiveCompanyId||null;
    }catch(_){return null}
  }
  function detect(){
    if(location.pathname==='/app/weather.html')return{view:'weather',path:location.pathname+location.search+location.hash};
    if(location.pathname==='/app/calendar.html')return{view:'calendar',path:location.pathname+location.search+location.hash};
    if(location.pathname!=='/app/'&&location.pathname!=='/app/index.html')return null;

    const grid=document.getElementById('cfCompanyGrid');
    if(isAdmin()&&visible(grid))return{view:'admin'};

    const cid=companyId();
    if(cid)return{view:'company',companyId:String(cid)};
    return null;
  }
  function saveCurrent(){
    const state=detect();
    if(state)write(state);
  }

  async function restoreMain(){
    if(restoring||restoreTried||!isAdmin())return;
    const saved=read();
    if(!saved||!saved.view)return;
    restoreTried=true;
    restoring=true;
    try{
      if(saved.view==='admin'){
        if(typeof cfShowCompanyChooser==='function')await cfShowCompanyChooser();
      }else if(saved.view==='company'&&saved.companyId){
        const current=companyId();
        if(String(current||'')!==String(saved.companyId)&&typeof cfEnterCompany==='function')await cfEnterCompany(saved.companyId);
      }else if((saved.view==='calendar'||saved.view==='weather')&&saved.path&&location.pathname==='/app/'){
        location.replace(saved.path);
        return;
      }
    }catch(e){console.warn('[CleanFleet view state] restore failed',e)}
    finally{restoring=false;setTimeout(saveCurrent,80)}
  }

  function boot(){
    if(location.pathname==='/app/weather.html'||location.pathname==='/app/calendar.html'){
      saveCurrent();
      document.addEventListener('visibilitychange',()=>{if(document.hidden)saveCurrent()},{passive:true});
      window.addEventListener('pagehide',saveCurrent,{passive:true});
      return;
    }

    const observer=new MutationObserver(()=>{
      if(!restoring)saveCurrent();
      if(!restoreTried)setTimeout(restoreMain,0);
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});

    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)saveCurrent();
      else{
        restoreTried=false;
        setTimeout(restoreMain,80);
      }
    },{passive:true});
    window.addEventListener('pagehide',saveCurrent,{passive:true});
    window.addEventListener('pageshow',()=>{restoreTried=false;setTimeout(restoreMain,80)},{passive:true});

    let tries=0;
    const t=setInterval(()=>{
      saveCurrent();
      restoreMain();
      if(++tries>40)clearInterval(t);
    },250);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
