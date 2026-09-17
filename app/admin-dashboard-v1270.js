(()=>{
  'use strict';
  const STORAGE='cf-admin-dashboard-order-v1';
  let grid=null,dragEl=null,ghost=null,pressTimer=null,startX=0,startY=0,active=false,suppressClickUntil=0;

  function style(){
    if(document.getElementById('cfAdminDashboard1270Style'))return;
    const s=document.createElement('style');s.id='cfAdminDashboard1270Style';s.textContent=`
      @media (min-width:900px){.wrap{max-width:1120px!important}}
      #cfCompanyGrid>.cf-company-card{transition:transform .14s ease,box-shadow .14s ease,opacity .14s ease}
      #cfCompanyGrid>.cf-company-card.cf-sort-source{opacity:.35}
      #cfCompanyGrid>.cf-company-card.cf-sort-over{box-shadow:inset 0 0 0 2px #a6c61b!important}
      .cf-admin-sort-ghost{position:fixed;z-index:500000;pointer-events:none;min-width:150px;max-width:260px;padding:12px 14px;border-radius:14px;background:#fff;color:#171a18;border:1px solid #a6c61b;box-shadow:0 18px 45px rgba(0,0,0,.25);font:800 12px/1.25 system-ui,-apple-system,sans-serif;transform:translate(-50%,-115%)}
    `;document.head.appendChild(s);
  }
  const key=el=>el?.id?`id:${el.id}`:(el?.dataset?.companyId?`company:${el.dataset.companyId}`:null);
  const cards=()=>grid?[...grid.children].filter(x=>x.classList?.contains('cf-company-card')):[];
  function saved(){try{const x=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
  function applyOrder(){
    if(!grid)return;
    const order=saved(),rank=new Map(order.map((k,i)=>[k,i]));
    cards().forEach((el,i)=>{const k=key(el);el.style.order=String(rank.has(k)?rank.get(k):10000+i);el.draggable=true});
  }
  function saveOrder(){
    if(!grid)return;
    const list=cards().sort((a,b)=>(Number(a.style.order)||0)-(Number(b.style.order)||0)).map(key).filter(Boolean);
    try{localStorage.setItem(STORAGE,JSON.stringify(list))}catch(_){}
    list.forEach((k,i)=>{const el=cards().find(x=>key(x)===k);if(el)el.style.order=String(i)});
  }
  function reorder(src,target,after){
    if(!src||!target||src===target)return;
    const arr=cards().sort((a,b)=>(Number(a.style.order)||0)-(Number(b.style.order)||0));
    const from=arr.indexOf(src),to0=arr.indexOf(target);if(from<0||to0<0)return;
    arr.splice(from,1);const to=arr.indexOf(target)+(after?1:0);arr.splice(to,0,src);
    arr.forEach((el,i)=>el.style.order=String(i));saveOrder();
  }
  function afterTarget(el,y){const r=el.getBoundingClientRect();return y>r.top+r.height/2}
  function clearOver(){grid?.querySelectorAll('.cf-sort-over').forEach(x=>x.classList.remove('cf-sort-over'))}
  function clean(){clearTimeout(pressTimer);pressTimer=null;clearOver();dragEl?.classList.remove('cf-sort-source');dragEl=null;active=false;ghost?.remove();ghost=null}
  function moveGhost(x,y){if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}clearOver();const t=document.elementFromPoint(x,y)?.closest?.('#cfCompanyGrid>.cf-company-card');if(t&&t!==dragEl)t.classList.add('cf-sort-over')}
  function beginTouch(x,y){if(!dragEl)return;active=true;dragEl.classList.add('cf-sort-source');ghost=document.createElement('div');ghost.className='cf-admin-sort-ghost';ghost.textContent=(dragEl.textContent||'').trim().replace(/\s+/g,' ').slice(0,90);document.body.appendChild(ghost);moveGhost(x,y);if(navigator.vibrate)try{navigator.vibrate(18)}catch(_){}}

  function bindGrid(g){
    if(g.dataset.cfSort1270==='1'){grid=g;applyOrder();return}g.dataset.cfSort1270='1';grid=g;applyOrder();
    new MutationObserver(()=>setTimeout(applyOrder,0)).observe(g,{childList:true});
    g.addEventListener('dragstart',e=>{const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el)return;dragEl=el;el.classList.add('cf-sort-source');e.dataTransfer?.setData('text/plain',key(el)||'');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});
    g.addEventListener('dragover',e=>{if(!dragEl)return;const t=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!t||t===dragEl)return;e.preventDefault();clearOver();t.classList.add('cf-sort-over')});
    g.addEventListener('drop',e=>{if(!dragEl)return;const t=e.target.closest?.('#cfCompanyGrid>.cf-company-card');e.preventDefault();if(t&&t!==dragEl)reorder(dragEl,t,afterTarget(t,e.clientY));clean()});
    g.addEventListener('dragend',clean);
  }
  function onDown(e){
    if(e.pointerType==='mouse'||!grid)return;
    const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el)return;
    const interactive=e.target.closest?.('a,input,select,textarea,[data-company-edit],.cf-company-edit');if(interactive&&interactive!==el)return;
    dragEl=el;startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>beginTouch(e.clientX,e.clientY),260);
  }
  function onMove(e){if(!dragEl)return;if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)>9)clean();return}e.preventDefault();moveGhost(e.clientX,e.clientY)}
  function onUp(e){if(!dragEl){clean();return}clearTimeout(pressTimer);if(!active){clean();return}e.preventDefault();e.stopPropagation();const t=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('#cfCompanyGrid>.cf-company-card');const src=dragEl;if(t&&t!==src)reorder(src,t,afterTarget(t,e.clientY));suppressClickUntil=Date.now()+650;clean()}

  function findGrid(){const g=document.getElementById('cfCompanyGrid');if(g){bindGrid(g);return true}return false}
  function boot(){
    style();findGrid();new MutationObserver(()=>findGrid()).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('pointerdown',onDown,{capture:true,passive:true});
    document.addEventListener('pointermove',onMove,{capture:true,passive:false});
    document.addEventListener('pointerup',onUp,{capture:true,passive:false});
    document.addEventListener('pointercancel',clean,{capture:true,passive:true});
    document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest?.('#cfCompanyGrid>.cf-company-card')){e.preventDefault();e.stopImmediatePropagation()}},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
