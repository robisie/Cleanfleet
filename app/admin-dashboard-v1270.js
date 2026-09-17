(()=>{
  'use strict';
  const STORAGE='cf-admin-dashboard-order-v1';
  let grid=null,pressTimer=null,src=null,active=false,ghost=null,over=null,startX=0,startY=0,suppressClickUntil=0;

  function style(){
    if(document.getElementById('cfAdminDashboard1270Style'))return;
    const s=document.createElement('style');s.id='cfAdminDashboard1270Style';s.textContent=`
      @media (min-width:900px){.wrap{max-width:1120px!important}}
      #cfCompanyGrid>.cf-company-card{position:relative;transition:transform .14s ease,box-shadow .14s ease,opacity .14s ease;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
      #cfCompanyGrid>.cf-company-card.cf-sort-source{opacity:.35}
      #cfCompanyGrid>.cf-company-card.cf-sort-over{box-shadow:inset 0 0 0 2px #a6c61b!important}
      #cfCompanyGrid>.cf-company-card.cf-sort-over::after{content:'+';position:absolute;right:8px;top:8px;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#a6c61b;color:#fff;font:900 19px/1 system-ui,-apple-system,sans-serif;z-index:20;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.18)}
      .cf-admin-sort-ghost{position:fixed;z-index:500000;pointer-events:none;min-width:150px;max-width:260px;padding:12px 14px;border-radius:14px;background:#fff;color:#171a18;border:1px solid #a6c61b;box-shadow:0 18px 45px rgba(0,0,0,.25);font:800 12px/1.25 system-ui,-apple-system,sans-serif;transform:translate(-50%,-115%)}
      body.cf-photo-admin-only [data-cf-photos]{display:none!important}
    `;document.head.appendChild(s);
  }

  const key=el=>el?.id?`id:${el.id}`:(el?.dataset?.companyId?`company:${el.dataset.companyId}`:null);
  const cards=()=>grid?[...grid.children].filter(x=>x.classList?.contains('cf-company-card')):[];
  function saved(){try{const x=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
  function visualCards(){return cards().sort((a,b)=>(Number(a.style.order)||0)-(Number(b.style.order)||0))}
  function applyOrder(){
    if(!grid)return;
    const order=saved(),rank=new Map(order.map((k,i)=>[k,i]));
    cards().forEach((el,i)=>{const k=key(el);el.style.order=String(rank.has(k)?rank.get(k):10000+i);el.draggable=true});
  }
  function saveOrder(arr=visualCards()){
    arr.forEach((el,i)=>el.style.order=String(i));
    try{localStorage.setItem(STORAGE,JSON.stringify(arr.map(key).filter(Boolean)))}catch(_){}
  }
  function reorder(source,target,after){
    if(!source||!target||source===target)return;
    const arr=visualCards(),from=arr.indexOf(source);if(from<0)return;
    arr.splice(from,1);const ti=arr.indexOf(target);if(ti<0)return;
    arr.splice(ti+(after?1:0),0,source);saveOrder(arr);
  }
  function afterTarget(el,x,y){
    const r=el.getBoundingClientRect(),sr=src?.getBoundingClientRect();
    const sameRow=sr?Math.abs(sr.top-r.top)<Math.max(20,r.height*.45):true;
    return sameRow?x>r.left+r.width/2:y>r.top+r.height/2;
  }
  function clearOver(){if(over){over.classList.remove('cf-sort-over');over=null}}
  function cleanup(){clearTimeout(pressTimer);pressTimer=null;clearOver();src?.classList.remove('cf-sort-source');src=null;active=false;ghost?.remove();ghost=null}
  function beginDrag(x,y){
    if(!src)return;active=true;src.classList.add('cf-sort-source');
    ghost=document.createElement('div');ghost.className='cf-admin-sort-ghost';ghost.textContent=(src.textContent||'').trim().replace(/\s+/g,' ').slice(0,90);document.body.appendChild(ghost);moveGhost(x,y);
    if(navigator.vibrate)try{navigator.vibrate(20)}catch(_){}
  }
  function moveGhost(x,y){
    if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}
    clearOver();
    const el=document.elementFromPoint(x,y);
    const card=el?.closest?.('#cfCompanyGrid>.cf-company-card');
    if(card&&card!==src){over=card;card.classList.add('cf-sort-over')}
  }
  function interactiveTarget(target){return target?.closest?.('a,input,select,textarea,button,[data-company-edit],.cf-company-edit')}

  function onPointerDown(e){
    if(e.pointerType==='mouse'||!grid)return;
    const item=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!item||interactiveTarget(e.target))return;
    src=item;startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>beginDrag(e.clientX,e.clientY),240);
  }
  function onPointerMove(e){
    if(!src)return;
    if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)>9){clearTimeout(pressTimer);pressTimer=null;src=null}return}
    e.preventDefault();moveGhost(e.clientX,e.clientY);
  }
  function onPointerUp(e){
    if(!src){cleanup();return}
    clearTimeout(pressTimer);if(!active){cleanup();return}
    e.preventDefault();e.stopPropagation();suppressClickUntil=Date.now()+650;
    const source=src,target=over,x=e.clientX,y=e.clientY;
    cleanup();if(target)reorder(source,target,afterTarget(target,x,y));
  }
  function onPointerCancel(){cleanup()}

  function bindDesktop(){
    if(!grid||grid.dataset.cfSort1274==='1')return;
    grid.dataset.cfSort1274='1';
    grid.addEventListener('dragstart',e=>{const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el)return;src=el;el.classList.add('cf-sort-source');e.dataTransfer?.setData('text/plain',key(el)||'');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});
    grid.addEventListener('dragover',e=>{if(!src)return;const t=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!t||t===src)return;e.preventDefault();clearOver();over=t;t.classList.add('cf-sort-over')});
    grid.addEventListener('drop',e=>{if(!src)return;const t=e.target.closest?.('#cfCompanyGrid>.cf-company-card')||over;e.preventDefault();const source=src;if(t&&t!==source)reorder(source,t,afterTarget(t,e.clientX,e.clientY));cleanup()});
    grid.addEventListener('dragend',cleanup);
  }

  function bindGrid(g){grid=g;applyOrder();bindDesktop();if(g.dataset.cfOrderObserver!=='1'){g.dataset.cfOrderObserver='1';new MutationObserver(()=>setTimeout(applyOrder,0)).observe(g,{childList:true})}}
  function findGrid(){const g=document.getElementById('cfCompanyGrid');if(g){bindGrid(g);return true}return false}

  function isAdmin(){try{return typeof cfIsAdmin==='function'&&!!cfIsAdmin()}catch(_){return false}}
  function applyPhotoAccess(){const allowed=isAdmin();document.body?.classList.toggle('cf-photo-admin-only',!allowed);if(!allowed){const o=document.getElementById('cfPhotoOverlay');if(o?.classList.contains('open'))o.classList.remove('open')}}
  function ensureAttentionVisible(){
    const panel=document.getElementById('attentionPanel');if(!panel)return;
    let activeCompany=null;try{activeCompany=typeof window.cfGetActiveCompanyId==='function'?window.cfGetActiveCompanyId():null}catch(_){activeCompany=null}
    if(!activeCompany)return;if(panel.classList.contains('show')&&panel.innerHTML.trim())return;
    panel.classList.add('show');panel.innerHTML='<div class="attention-head"><div class="attention-title">Wymaga uwagi</div></div><div class="attention-grid"><button type="button" class="attention-card"><div class="attention-label">Do wykonania</div><div class="attention-value">0</div></button><button type="button" class="attention-card"><div class="attention-label">Dawno nie prane</div><div class="attention-value">0</div></button><button type="button" class="attention-card"><div class="attention-label">Niezatwierdzone</div><div class="attention-value">0</div></button><button type="button" class="attention-card"><div class="attention-label">Faktury do zapłaty</div><div class="attention-value">0</div></button></div>';
  }
  function refreshAux(){applyPhotoAccess();ensureAttentionVisible()}
  function boot(){
    style();findGrid();refreshAux();
    new MutationObserver(()=>{findGrid();setTimeout(refreshAux,0)}).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('pointerdown',onPointerDown,{capture:true,passive:true});
    document.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
    document.addEventListener('pointerup',onPointerUp,{capture:true,passive:false});
    document.addEventListener('pointercancel',onPointerCancel,{capture:true,passive:true});
    document.addEventListener('click',e=>{if(!isAdmin()&&e.target.closest?.('[data-cf-photos]')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();return}if(Date.now()<suppressClickUntil&&e.target.closest?.('#cfCompanyGrid>.cf-company-card')){e.preventDefault();e.stopImmediatePropagation()}},true);
    let n=0;const t=setInterval(()=>{refreshAux();if(++n>80)clearInterval(t)},250);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAux()},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();