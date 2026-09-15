(()=>{
'use strict';
function nudge(){
  try{
    if(document.getElementById('cfCalendarTile')) return true;
    if(typeof cfIsAdmin!=='function' || !cfIsAdmin()) return false;
    const grid=document.getElementById('cfCompanyGrid');
    if(!grid) return false;
    const marker=document.createElement('span');
    marker.hidden=true;
    marker.setAttribute('aria-hidden','true');
    grid.appendChild(marker);
    marker.remove();
    return !!document.getElementById('cfCalendarTile');
  }catch(_){return false;}
}
function boot(){
  const delays=[0,500,1000,2000,3500,5000,8000,12000,18000,25000];
  delays.forEach(ms=>setTimeout(()=>nudge(),ms));
  document.addEventListener('click',()=>setTimeout(()=>nudge(),0),true);
  window.addEventListener('focus',()=>setTimeout(()=>nudge(),0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
