(()=>{
  'use strict';
  const STORAGE='cf-admin-dashboard-order-v1';
  let grid=null,dragEl=null,ghost=null,pressTimer=null,startX=0,startY=0,active=false,suppressClickUntil=0,dropTarget=null,touchId=null;

  function style(){
    if(document.getElementById('cfAdminDashboard1270Style'))return;
    const s=document.createElement('style');s.id='cfAdminDashboard1270Style';s.textContent=`
      @media (min-width:900px){.wrap{max-width:1120px!important}}
      #cfCompanyGrid>.cf-company-card{position:relative;transition:transform .14s ease,box-shadow .14s ease,opacity .14s ease;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
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
    if(!grid)return;
    arr.forEach((el,i)=>el.style.order=String(i));
    const list=arr.map(key).filter(Boolean);
    try{localStorage.setItem(STORAGE,JSON.stringify(list))}catch(_){}
  }
  function reorder(src,target,after){
    if(!src||!target||src===target)return;
    const arr=visualCards();
    const from=arr.indexOf(src);if(from<0)return;
    arr.splice(from,1);
    const targetIndex=arr.indexOf(target);if(targetIndex<0)return;
    arr.splice(targetIndex+(after?1:0),0,src);
    saveOrder(arr);
  }
  function afterTarget(el,x,y){
    const r=el.getBoundingClientRect();
    const sr=dragEl?.getBoundingClientRect();
    const sameRow=sr?Math.abs(sr.top-r.top)<Math.max(20,r.height*.45):true;
    return sameRow?x>r.left+r.width/2:y>r.top+r.height/2;
  }
  function clearOver(){grid?.querySelectorAll('.cf-sort-over').forEach(x=>x.classList.remove('cf-sort-over'));dropTarget=null}
  function clean(){
    clearTimeout(pressTimer);pressTimer=null;
    clearOver();
    if(dragEl){dragEl.classList.remove('cf-sort-source');dragEl.draggable=true}
    dragEl=null;active=false;touchId=null;ghost?.remove();ghost=null;
  }
  function rectTargetAt(x,y){
    if(!grid)return null;
    const matches=cards().filter(el=>el!==dragEl).filter(el=>{
      const r=el.getBoundingClientRect();
      return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
    });
    if(matches.length)return matches[0];
    let best=null,bestDist=Infinity;
    cards().filter(el=>el!==dragEl).forEach(el=>{
      const r=el.getBoundingClientRect();
      const cx=Math.max(r.left,Math.min(x,r.right));
      const cy=Math.max(r.top,Math.min(y,r.bottom));
      const d=Math.hypot(x-cx,y-cy);
      if(d<bestDist&&d<=18){bestDist=d;best=el}
    });
    return best;
  }
  function targetAt(x,y){
    const dom=document.elementFromPoint(x,y)?.closest?.('#cfCompanyGrid>.cf-company-card')||null;
    if(dom&&dom!==dragEl)return dom;
    return rectTargetAt(x,y);
  }
  function moveGhost(x,y){
    if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}
    grid?.querySelectorAll('.cf-sort-over').forEach(x=>x.classList.remove('cf-sort-over'));
    const t=targetAt(x,y);
    dropTarget=(t&&t!==dragEl)?t:null;
    if(dropTarget)dropTarget.classList.add('cf-sort-over');
  }
  function beginTouch(x,y){
    if(!dragEl)return;
    active=true;dragEl.classList.add('cf-sort-source');dragEl.draggable=false;
    ghost=document.createElement('div');ghost.className='cf-admin-sort-ghost';ghost.textContent=(dragEl.textContent||'').trim().replace(/\s+/g,' ').slice(0,90);document.body.appendChild(ghost);moveGhost(x,y);
    if(navigator.vibrate)try{navigator.vibrate(18)}catch(_){}
  }
  function interactiveTarget(target){return target?.closest?.('a,input,select,textarea,button,[data-company-edit],.cf-company-edit')}

  function bindGrid(g){
    if(g.dataset.cfSort1270==='1'){grid=g;applyOrder();return}g.dataset.cfSort1270='1';grid=g;applyOrder();
    new MutationObserver(()=>setTimeout(applyOrder,0)).observe(g,{childList:true});
    g.addEventListener('dragstart',e=>{const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el)return;dragEl=el;el.classList.add('cf-sort-source');e.dataTransfer?.setData('text/plain',key(el)||'');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});
    g.addEventListener('dragover',e=>{if(!dragEl)return;const t=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!t||t===dragEl)return;e.preventDefault();grid.querySelectorAll('.cf-sort-over').forEach(x=>x.classList.remove('cf-sort-over'));dropTarget=t;t.classList.add('cf-sort-over')});
    g.addEventListener('drop',e=>{if(!dragEl)return;const t=e.target.closest?.('#cfCompanyGrid>.cf-company-card')||dropTarget;e.preventDefault();const src=dragEl;if(t&&t!==src)reorder(src,t,afterTarget(t,e.clientX,e.clientY));clean()});
    g.addEventListener('dragend',clean);
  }

  function onDown(e){
    if(e.pointerType==='mouse'||e.pointerType==='touch'||!grid)return;
    const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el||interactiveTarget(e.target))return;
    dragEl=el;startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>beginTouch(e.clientX,e.clientY),260);
  }
  function onMove(e){if(!dragEl||e.pointerType==='touch')return;if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)>9)clean();return}e.preventDefault();moveGhost(e.clientX,e.clientY)}
  function onUp(e){
    if(e.pointerType==='touch')return;
    if(!dragEl){clean();return}
    clearTimeout(pressTimer);if(!active){clean();return}
    e.preventDefault();e.stopPropagation();
    const src=dragEl,t=dropTarget||targetAt(e.clientX,e.clientY);
    if(t&&t!==src)reorder(src,t,afterTarget(t,e.clientX,e.clientY));
    suppressClickUntil=Date.now()+650;clean();
  }

  function touchById(list,id){for(const t of list||[]){if(t.identifier===id)return t}return null}
  function onTouchStart(e){
    if(!grid||touchId!==null||e.touches.length!==1)return;
    const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el||interactiveTarget(e.target))return;
    const t=e.touches[0];touchId=t.identifier;dragEl=el;dragEl.draggable=false;startX=t.clientX;startY=t.clientY;
    clearTimeout(pressTimer);pressTimer=setTimeout(()=>beginTouch(t.clientX,t.clientY),280);
  }
  function onTouchMove(e){
    if(touchId===null||!dragEl)return;
    const t=touchById(e.touches,touchId);if(!t)return;
    if(!active){
      if(Math.hypot(t.clientX-startX,t.clientY-startY)>10)clean();
      return;
    }
    e.preventDefault();e.stopPropagation();moveGhost(t.clientX,t.clientY);
  }
  function onTouchEnd(e){
    if(touchId===null||!dragEl){clean();return}
    const t=touchById(e.changedTouches,touchId);
    clearTimeout(pressTimer);
    if(!active){clean();return}
    if(t){e.preventDefault();e.stopPropagation()}
    const src=dragEl,x=t?.clientX??startX,y=t?.clientY??startY,target=dropTarget||targetAt(x,y);
    if(target&&target!==src)reorder(src,target,afterTarget(target,x,y));
    suppressClickUntil=Date.now()+700;clean();
  }
  function onTouchCancel(){clean()}

  function isAdmin(){try{return typeof cfIsAdmin==='function' && !!cfIsAdmin()}catch(_){return false}}
  function applyPhotoAccess(){
    const allowed=isAdmin();document.body?.classList.toggle('cf-photo-admin-only',!allowed);
    if(!allowed){const overlay=document.getElementById('cfPhotoOverlay');if(overlay?.classList.contains('open'))overlay.classList.remove('open')}
  }
  function ensureAttentionVisible(){
    const panel=document.getElementById('attentionPanel');if(!panel)return;
    let activeCompany=null;try{activeCompany=typeof window.cfGetActiveCompanyId==='function'?window.cfGetActiveCompanyId():null}catch(_){activeCompany=null}
    if(!activeCompany)return;if(panel.classList.contains('show')&&panel.innerHTML.trim())return;
    panel.classList.add('show');
    panel.innerHTML='<div class="attention-head"><div class="attention-title">Wymaga uwagi</div></div><div class="attention-grid"><button type="button" class="attention-card" data-attention-fallback="todo"><div class="attention-label">Do wykonania</div><div class="attention-value">0</div></button><button type="button" class="attention-card" data-attention-fallback="old"><div class="attention-label">Dawno nie prane</div><div class="attention-value">0</div></button><button type="button" class="attention-card" data-attention-fallback="unapproved"><div class="attention-label">Niezatwierdzone</div><div class="attention-value">0</div></button><button type="button" class="attention-card" data-attention-fallback="finance"><div class="attention-label">Faktury do zapłaty</div><div class="attention-value">0</div></button></div>';
  }

  function refreshAux(){applyPhotoAccess();ensureAttentionVisible()}
  function findGrid(){const g=document.getElementById('cfCompanyGrid');if(g){bindGrid(g);return true}return false}
  function boot(){
    style();findGrid();refreshAux();
    new MutationObserver(()=>{findGrid();setTimeout(refreshAux,0)}).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('pointerdown',onDown,{capture:true,passive:true});
    document.addEventListener('pointermove',onMove,{capture:true,passive:false});
    document.addEventListener('pointerup',onUp,{capture:true,passive:false});
    document.addEventListener('pointercancel',clean,{capture:true,passive:true});
    document.addEventListener('touchstart',onTouchStart,{capture:true,passive:true});
    document.addEventListener('touchmove',onTouchMove,{capture:true,passive:false});
    document.addEventListener('touchend',onTouchEnd,{capture:true,passive:false});
    document.addEventListener('touchcancel',onTouchCancel,{capture:true,passive:true});
    document.addEventListener('click',e=>{
      if(!isAdmin()&&e.target.closest?.('[data-cf-photos]')){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();return}
      if(Date.now()<suppressClickUntil&&e.target.closest?.('#cfCompanyGrid>.cf-company-card')){e.preventDefault();e.stopImmediatePropagation()}
    },true);
    let n=0;const t=setInterval(()=>{refreshAux();if(++n>80)clearInterval(t)},250);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAux()},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();