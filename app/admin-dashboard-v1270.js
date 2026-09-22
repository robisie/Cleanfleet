(()=>{
  'use strict';

  const STORAGE='cf-admin-dashboard-grid-v1';
  const VIEW_STORAGE='cf-last-main-view-v1290';
  const GAP=12;
  let grid=null,pressTimer=null,src=null,active=false,ghost=null,placeholder=null,startX=0,startY=0,suppressClickUntil=0,lastCell=null;
  let viewReady=false,viewBusy=false,viewSaveTimer=null;

  function columns(){
    const w=window.innerWidth||document.documentElement.clientWidth||1024;
    return w>=900?6:(w>=600?4:2);
  }

  function style(){
    if(document.getElementById('cfAdminDashboard1270Style'))return;
    const s=document.createElement('style');
    s.id='cfAdminDashboard1270Style';
    s.textContent=`
      @media (min-width:900px){.wrap{max-width:1120px!important}}
      #cfCompanyGrid{
        --cf-grid-gap:12px;
        --cf-row-h:168px;
        display:grid!important;
        grid-template-columns:repeat(6,minmax(0,1fr))!important;
        grid-auto-rows:var(--cf-row-h)!important;
        gap:var(--cf-grid-gap)!important;
        align-items:stretch!important;
        position:relative!important;
      }
      #cfCompanyGrid>.cf-company-card{
        position:relative!important;
        width:auto!important;max-width:none!important;min-width:0!important;
        height:auto!important;min-height:0!important;margin:0!important;
        align-self:stretch!important;justify-self:stretch!important;
        transition:box-shadow .14s ease,opacity .14s ease,transform .14s ease;
        user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;
      }
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile{
        padding:10px 13px!important;
        overflow:hidden!important;
        box-sizing:border-box!important;
      }
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile>:not(button){zoom:.88}
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile h1,
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile h2,
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile h3,
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile p{
        margin-top:0!important;margin-bottom:3px!important;line-height:1.08!important;
      }
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile hr{margin:6px 0!important}
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile [class*="stat"],
      #cfCompanyGrid>.cf-company-card.cf-grid-company-tile [class*="metric"]{
        row-gap:4px!important;column-gap:8px!important;line-height:1.05!important;
      }
      .cf-grid-drag-handle{
        display:none;position:absolute;z-index:12;border:1px solid #cdd2cf;background:rgba(255,255,255,.94);
        color:#68716b;border-radius:9px;width:30px;height:30px;padding:0;align-items:center;justify-content:center;
        font:900 18px/1 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08);
        -webkit-tap-highlight-color:transparent;touch-action:none!important;
      }
      #cfCompanyGrid>.cf-company-card.cf-grid-source{opacity:.28}
      #cfCompanyGrid.cf-grid-dragging{
        background-image:linear-gradient(rgba(166,198,27,.065) 1px,transparent 1px),linear-gradient(90deg,rgba(166,198,27,.065) 1px,transparent 1px);
        background-size:calc((100% - 60px)/6 + 12px) 180px;border-radius:14px;
      }
      .cf-admin-grid-placeholder{
        pointer-events:none;z-index:50;border:2px dashed #a6c61b;border-radius:14px;
        background:rgba(166,198,27,.13);box-shadow:inset 0 0 0 1px rgba(166,198,27,.12);position:relative;
      }
      .cf-admin-grid-placeholder::after{
        content:'+';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:#a6c61b;color:#fff;font:900 25px/1 system-ui,-apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.18)
      }
      .cf-admin-grid-ghost{
        position:fixed;z-index:500000;pointer-events:none;min-width:150px;max-width:280px;padding:12px 14px;
        border-radius:14px;background:#fff;color:#171a18;border:1px solid #a6c61b;
        box-shadow:0 18px 45px rgba(0,0,0,.25);font:800 12px/1.25 system-ui,-apple-system,sans-serif;
        transform:translate(-50%,-115%)
      }
      @media(max-width:899px){
        #cfCompanyGrid{grid-template-columns:repeat(4,minmax(0,1fr))!important;--cf-row-h:158px}
        #cfCompanyGrid.cf-grid-dragging{background-size:calc((100% - 36px)/4 + 12px) 170px}
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile>:not(button){zoom:.84}
      }
      @media(max-width:599px){
        #cfCompanyGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;--cf-row-h:148px}
        #cfCompanyGrid>.cf-company-card{touch-action:pan-y!important}
        #cfCompanyGrid.cf-grid-dragging{background-size:calc((100% - 12px)/2 + 12px) 160px}
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile{padding:7px 9px!important}
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile>:not(button){zoom:.72}
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile h1,
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile h2,
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile h3,
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile p{margin-bottom:2px!important;line-height:1.02!important}
        #cfCompanyGrid>.cf-company-card.cf-grid-company-tile hr{margin:4px 0!important}
        .cf-grid-drag-handle{display:flex;right:6px;bottom:6px}
      }
    `;
    document.head.appendChild(s);
  }

  const key=el=>el?.id?`id:${el.id}`:(el?.dataset?.companyId?`company:${el.dataset.companyId}`:null);
  const cards=()=>grid?[...grid.children].filter(x=>x.classList?.contains('cf-company-card')):[];

  function defaultSpan(el){
    const id=el?.id||'';
    if(id==='cfCompanyWeatherCard')return{w:2,h:columns()===2?2:1};
    if(el?.dataset?.companyId)return{w:2,h:1};
    return{w:1,h:1};
  }

  function readStore(){try{const v=JSON.parse(localStorage.getItem(STORAGE)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(_){return{}}}
  function writeStore(v){try{localStorage.setItem(STORAGE,JSON.stringify(v))}catch(_){}}
  function bpKey(){return String(columns())}
  function readLayout(){const all=readStore();return all[bpKey()]&&typeof all[bpKey()]==='object'?all[bpKey()]:{}}
  function saveLayout(layout,replace=false){const all=readStore(),bp=bpKey();const previous=all[bp]&&typeof all[bp]==='object'?all[bp]:{};all[bp]=replace?layout:{...previous,...layout};writeStore(all)}

  function overlaps(a,b){return !(a.c+a.w<=b.c||b.c+b.w<=a.c||a.r+a.h<=b.r||b.r+b.h<=a.r)}
  function fits(pos,layout,ignoreKey=null){const cols=columns();if(pos.c<1||pos.r<1||pos.w<1||pos.h<1||pos.c+pos.w-1>cols)return false;return !Object.entries(layout).some(([k,p])=>k!==ignoreKey&&p&&overlaps(pos,p))}
  function firstFree(span,layout,startRow=1,startCol=1){const cols=columns();for(let r=Math.max(1,startRow);r<200;r++){for(let c=(r===startRow?Math.max(1,startCol):1);c<=cols-span.w+1;c++){const p={c,r,w:span.w,h:span.h};if(fits(p,layout))return p}}return{c:1,r:200,w:span.w,h:span.h}}

  function normalizedLayout(){const saved=readLayout(),out={};cards().forEach(el=>{const k=key(el);if(!k)return;const span=defaultSpan(el),old=saved[k];const wanted=old?{c:Number(old.c)||1,r:Number(old.r)||1,w:span.w,h:span.h}:null;out[k]=wanted&&fits(wanted,out)?wanted:firstFree(span,out)});return out}

  function ensureHandle(el){if(!el||el.querySelector(':scope > .cf-grid-drag-handle'))return;const h=document.createElement('button');h.type='button';h.className='cf-grid-drag-handle';h.setAttribute('aria-label','Przeciągnij kafelek');h.title='Przeciągnij kafelek';h.textContent='⠿';h.addEventListener('click',e=>{e.preventDefault();e.stopPropagation()});el.appendChild(h)}

  function applyLayout(){if(!grid||active)return;const layout=normalizedLayout();cards().forEach(el=>{const p=layout[key(el)];if(!p)return;el.classList.toggle('cf-grid-company-tile',!!el.dataset.companyId);ensureHandle(el);el.style.order='';el.style.gridColumn=`${p.c} / span ${p.w}`;el.style.gridRow=`${p.r} / span ${p.h}`;el.draggable=columns()!==2});saveLayout(layout)}

  function placeAt(source,cell){if(!source||!cell)return;const sourceKey=key(source);if(!sourceKey)return;const current=normalizedLayout();const span=defaultSpan(source),cols=columns();const desired={c:Math.max(1,Math.min(cell.c,cols-span.w+1)),r:Math.max(1,cell.r),w:span.w,h:span.h};delete current[sourceKey];const colliders=Object.entries(current).filter(([,p])=>overlaps(desired,p)).map(([k])=>k);colliders.forEach(k=>delete current[k]);current[sourceKey]=desired;colliders.forEach(k=>{const el=cards().find(x=>key(x)===k);if(!el)return;current[k]=firstFree(defaultSpan(el),current,desired.r,desired.c)});saveLayout(current);active=false;applyLayout()}

  function rowHeight(){if(!grid)return 168;const v=parseFloat(getComputedStyle(grid).gridAutoRows);return Number.isFinite(v)&&v>0?v:168}
  function cellAt(x,y,source){if(!grid)return null;const rect=grid.getBoundingClientRect(),cols=columns(),gap=parseFloat(getComputedStyle(grid).gap)||GAP;const cw=(rect.width-gap*(cols-1))/cols,rh=rowHeight();let c=Math.floor((x-rect.left)/(cw+gap))+1,r=Math.floor((y-rect.top)/(rh+gap))+1;c=Math.max(1,Math.min(cols,c));r=Math.max(1,r);const sp=defaultSpan(source);c=Math.min(c,cols-sp.w+1);return{c,r,w:sp.w,h:sp.h}}

  function showPlaceholder(cell){if(!grid||!cell)return;if(!placeholder){placeholder=document.createElement('div');placeholder.className='cf-admin-grid-placeholder';grid.appendChild(placeholder)}placeholder.style.gridColumn=`${cell.c} / span ${cell.w}`;placeholder.style.gridRow=`${cell.r} / span ${cell.h}`;lastCell=cell}
  function removePlaceholder(){placeholder?.remove();placeholder=null;lastCell=null}
  function cleanup(){clearTimeout(pressTimer);pressTimer=null;src?.classList.remove('cf-grid-source');src=null;active=false;ghost?.remove();ghost=null;removePlaceholder();grid?.classList.remove('cf-grid-dragging')}
  function beginDrag(x,y){if(!src)return;active=true;src.classList.add('cf-grid-source');grid?.classList.add('cf-grid-dragging');ghost=document.createElement('div');ghost.className='cf-admin-grid-ghost';ghost.textContent=(src.textContent||'').trim().replace(/\s+/g,' ').slice(0,100);document.body.appendChild(ghost);moveGhost(x,y);if(navigator.vibrate)try{navigator.vibrate(20)}catch(_){}}
  function moveGhost(x,y){if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}const cell=cellAt(x,y,src);if(cell)showPlaceholder(cell)}
  function interactiveTarget(target,item){if(target?.closest?.('.cf-grid-drag-handle'))return false;const control=target?.closest?.('a,input,select,textarea,[data-company-edit],.cf-company-edit');if(control)return true;const button=target?.closest?.('button');return !!(button&&button!==item)}

  function onPointerDown(e){if(e.pointerType==='mouse'||!grid)return;const item=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!item)return;if(columns()===2&&!e.target.closest?.('.cf-grid-drag-handle'))return;if(interactiveTarget(e.target,item))return;src=item;startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>beginDrag(e.clientX,e.clientY),columns()===2?90:240)}
  function onPointerMove(e){if(!src)return;if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)>9){clearTimeout(pressTimer);pressTimer=null;src=null}return}e.preventDefault();moveGhost(e.clientX,e.clientY)}
  function onPointerUp(e){if(!src){cleanup();return}clearTimeout(pressTimer);if(!active){cleanup();return}e.preventDefault();e.stopPropagation();suppressClickUntil=Date.now()+650;const source=src,cell=cellAt(e.clientX,e.clientY,source)||lastCell;placeAt(source,cell);cleanup()}
  function onPointerCancel(){cleanup()}

  function bindDesktop(){if(!grid||grid.dataset.cfGridDesktop==='1')return;grid.dataset.cfGridDesktop='1';grid.addEventListener('dragstart',e=>{if(columns()===2){e.preventDefault();return}const el=e.target.closest?.('#cfCompanyGrid>.cf-company-card');if(!el)return;src=el;active=true;el.classList.add('cf-grid-source');grid.classList.add('cf-grid-dragging');e.dataTransfer?.setData('text/plain',key(el)||'');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});grid.addEventListener('dragover',e=>{if(!src)return;e.preventDefault();const cell=cellAt(e.clientX,e.clientY,src);if(cell)showPlaceholder(cell)});grid.addEventListener('drop',e=>{if(!src)return;e.preventDefault();e.stopPropagation();const source=src,cell=cellAt(e.clientX,e.clientY,source)||lastCell;placeAt(source,cell);cleanup()});grid.addEventListener('dragend',cleanup)}

  function bindGrid(g){grid=g;applyLayout();bindDesktop();if(g.dataset.cfGridObserver!=='1'){g.dataset.cfGridObserver='1';new MutationObserver(m=>{if(active)return;if(m.some(x=>[...x.addedNodes,...x.removedNodes].some(n=>n?.classList?.contains?.('cf-company-card'))))setTimeout(applyLayout,0)}).observe(g,{childList:true})}}
  function findGrid(){const g=document.getElementById('cfCompanyGrid');if(g){bindGrid(g);return true}return false}

  function isAdmin(){try{return typeof cfIsAdmin==='function'&&!!cfIsAdmin()}catch(_){return false}}
  function companyId(){try{return typeof window.cfGetActiveCompanyId==='function'?(window.cfGetActiveCompanyId()||null):(window.cfActiveCompanyId||null)}catch(_){return null}}
  function dashboardVisible(){const g=document.getElementById('cfCompanyGrid');if(!g||!g.isConnected)return false;const cs=getComputedStyle(g);return cs.display!=='none'&&cs.visibility!=='hidden'&&!!(g.offsetWidth||g.offsetHeight||g.getClientRects().length)}
  function readView(){try{const v=JSON.parse(localStorage.getItem(VIEW_STORAGE)||'null');return v&&typeof v==='object'?v:null}catch(_){return null}}
  function writeView(v){try{localStorage.setItem(VIEW_STORAGE,JSON.stringify(v))}catch(_){}}
  function saveView(){if(!viewReady||viewBusy)return;if(isAdmin()&&dashboardVisible()){writeView({view:'admin'});return}const cid=companyId();if(cid)writeView({view:'company',companyId:String(cid)})}
  function scheduleSave(){clearTimeout(viewSaveTimer);viewSaveTimer=setTimeout(saveView,120)}
  async function restoreView(){if(viewBusy||!isAdmin())return;const saved=readView();if(!saved)return;viewBusy=true;try{if(saved.view==='admin'){if(!dashboardVisible()&&typeof cfShowCompanyChooser==='function')await cfShowCompanyChooser()}else if(saved.view==='company'&&saved.companyId&&typeof cfEnterCompany==='function'){const current=companyId();if(dashboardVisible()||String(current||'')!==String(saved.companyId))await cfEnterCompany(saved.companyId)}}catch(e){console.warn('[CleanFleet] restore view failed',e)}finally{viewBusy=false}}

  function applyPhotoAccess(){const allowed=window.cfCanUseRecordPhotos?.()===true;document.body?.classList.remove('cf-photo-admin-only');if(!allowed){const o=document.getElementById('cfPhotoOverlay');if(o?.classList.contains('open'))o.classList.remove('open')}}
  function ensureAttentionVisible(){const panel=document.getElementById('attentionPanel');if(!panel)return;let activeCompany=null;try{activeCompany=typeof window.cfGetActiveCompanyId==='function'?window.cfGetActiveCompanyId():null}catch(_){activeCompany=null}if(!activeCompany)return;if(panel.classList.contains('show')&&panel.innerHTML.trim())return;panel.classList.add('show');panel.innerHTML='<div class="attention-head"><div class="attention-title">Wymaga uwagi</div></div><div class="attention-grid"><button type="button" class="attention-card"><div class="attention-label">Do wykonania</div><div class="attention-value">0</div></button><button type="button" class="attention-card"><div class="attention-label">Dawno nie prane</div><div class="attention-value">0</div></button><button type="button" class="attention-card"><div class="attention-label">Niezatwierdzone</div><div class="attention-value">0</div></button><button type="button" class="attention-card"><div class="attention-label">Faktury do zapłaty</div><div class="attention-value">0</div></button></div>'}
  function refreshAux(){applyPhotoAccess();ensureAttentionVisible()}

  function boot(){
    style();findGrid();refreshAux();
    new MutationObserver(()=>{findGrid();setTimeout(refreshAux,0);scheduleSave()}).observe(document.body,{childList:true,subtree:true});
    document.addEventListener('pointerdown',onPointerDown,{capture:true,passive:true});
    document.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
    document.addEventListener('pointerup',onPointerUp,{capture:true,passive:false});
    document.addEventListener('pointercancel',onPointerCancel,{capture:true,passive:true});
    document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest?.('#cfCompanyGrid>.cf-company-card')){e.preventDefault();e.stopImmediatePropagation()}},true);
    let lastCols=columns();
    window.addEventListener('resize',()=>{const c=columns();if(c!==lastCols){lastCols=c;setTimeout(applyLayout,50)}},{passive:true});
    let n=0;const t=setInterval(()=>{refreshAux();if(++n>80)clearInterval(t)},250);

    const startup=readView();
    [120,500,1200].forEach(ms=>setTimeout(()=>{if(startup)restoreView()},ms));
    setTimeout(()=>{viewReady=true;saveView()},1500);

    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)saveView();
      else{refreshAux();setTimeout(applyLayout,80);setTimeout(restoreView,100)}
    },{passive:true});
    window.addEventListener('pagehide',saveView,{passive:true});
    window.addEventListener('pageshow',()=>setTimeout(restoreView,100),{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
