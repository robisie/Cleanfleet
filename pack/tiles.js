export const deviceClass=width=>width<600?'phone':width<1100?'tablet':'desktop';
export function normalizedOrder(saved,ids){const allowed=new Set(ids),seen=new Set();return [...(Array.isArray(saved)?saved:[]),...ids].filter(id=>allowed.has(id)&&!seen.has(id)&&seen.add(id));}
export function mountTiles(grid,userId){
 const ids=[...grid.children].map(tile=>tile.dataset.tile),touchEvents='ontouchstart' in window;
 let device=deviceClass(innerWidth),drag=null,target=null,ghost=null,pending=null,holdTimer=null,blockClickUntil=0;
 const storageKey=()=>`robisie-pack-tiles-v1:${userId}:${device}`;
 const apply=()=>{let saved;try{saved=JSON.parse(localStorage.getItem(storageKey()));}catch{}for(const id of normalizedOrder(saved,ids))grid.append([...grid.children].find(tile=>tile.dataset.tile===id));};
 const save=()=>{try{localStorage.setItem(storageKey(),JSON.stringify([...grid.children].map(tile=>tile.dataset.tile)));}catch{}};
 function move(tile,to){if(!to||to===tile||to.parentElement!==grid)return;const all=[...grid.children];if(all.indexOf(tile)<all.indexOf(to))to.after(tile);else to.before(tile);}
 function clearHold(){clearTimeout(holdTimer);holdTimer=null;pending=null;}
 function aim(point){
  if(!drag)return;
  if(ghost)ghost.style.transform=`translate(${point.clientX-ghost.offsetX}px,${point.clientY-ghost.offsetY}px)`;
  const hit=document.elementFromPoint(point.clientX,point.clientY)?.closest('[data-tile]');
  const next=hit&&hit!==drag&&hit.parentElement===grid?hit:null;
  if(next!==target){target?.classList.remove('drop-target');target=next;target?.classList.add('drop-target');}
 }
 function begin(tile,point){
  clearHold();if(!tile||tile.parentElement!==grid)return;drag=tile;
  // Safari can cancel a touch when its target is moved in the DOM. Keep it in
  // place for the entire gesture; only a visual clone follows the finger.
  if(tile.cloneNode&&tile.getBoundingClientRect){const rect=tile.getBoundingClientRect();ghost=tile.cloneNode(true);ghost.removeAttribute('data-tile');ghost.setAttribute('aria-hidden','true');ghost.classList.add('tile-ghost');ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';ghost.offsetX=point.clientX-rect.left;ghost.offsetY=point.clientY-rect.top;document.body.append(ghost);}
  drag.classList.add('dragging');grid.classList?.add('reordering');aim(point);
 }
 function finish(commit=true){
  clearHold();if(!drag)return;
  const tile=drag,to=target;drag=null;target=null;tile.classList.remove('dragging');to?.classList.remove('drop-target');grid.classList?.remove('reordering');ghost?.remove();ghost=null;blockClickUntil=Date.now()+500;
  if(commit&&to){move(tile,to);save();}
 }
 function pointerStart(event){if(touchEvents&&event.pointerType==='touch')return;const handle=event.target.closest('[data-drag]');if(!handle||event.button>0)return;event.preventDefault();begin(handle.closest('[data-tile]'),event);}
 function pointerMove(event){if(touchEvents&&event.pointerType==='touch')return;if(drag){event.preventDefault();aim(event);}}
 function pointerEnd(event){if(touchEvents&&event.pointerType==='touch')return;finish(true);}
 function pointerCancel(event){if(touchEvents&&event.pointerType==='touch')return;finish(false);}
 function touchStart(event){
  if(event.touches.length!==1){finish(false);return;}const tile=event.target.closest('[data-tile]');if(!tile||tile.parentElement!==grid)return;
  const point=event.touches[0];if(event.target.closest('[data-drag]')){event.preventDefault();begin(tile,point);return;}
  clearHold();pending={tile,x:point.clientX,y:point.clientY,id:point.identifier};
  holdTimer=setTimeout(()=>{if(pending)begin(pending.tile,{clientX:pending.x,clientY:pending.y});},350);
 }
 function touchMove(event){
  if(event.touches.length!==1){finish(false);return;}const point=event.touches[0];
  if(drag){event.preventDefault();aim(point);}else if(pending&&Math.hypot(point.clientX-pending.x,point.clientY-pending.y)>10)clearHold();
 }
 function touchEnd(){finish(true);}
 function touchCancel(){finish(false);}
 function click(event){if(Date.now()<blockClickUntil){event.preventDefault();event.stopImmediatePropagation();}}
 function context(event){if(drag||pending)event.preventDefault();}
 function key(event){const handle=event.target.closest('[data-drag]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const tile=handle.closest('[data-tile]'),all=[...grid.children],offset=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;move(tile,all[all.indexOf(tile)+offset]);save();handle.focus({preventScroll:true});}
 const resize=()=>{const next=deviceClass(innerWidth);if(next!==device){finish(false);device=next;apply();}};
 const bindings=[[grid,'pointerdown',pointerStart,false],[document,'pointermove',pointerMove,{capture:true,passive:false}],[document,'pointerup',pointerEnd,true],[document,'pointercancel',pointerCancel,true],[grid,'touchstart',touchStart,{passive:false}],[document,'touchmove',touchMove,{capture:true,passive:false}],[document,'touchend',touchEnd,true],[document,'touchcancel',touchCancel,true],[grid,'click',click,true],[grid,'contextmenu',context,false],[grid,'keydown',key,false],[window,'resize',resize,false]];
 for(const [el,type,fn,opts] of bindings)el.addEventListener(type,fn,opts);
 grid.querySelectorAll?.('img').forEach(img=>img.draggable=false);apply();
 return ()=>{finish(false);for(const [el,type,fn,opts] of bindings)el.removeEventListener(type,fn,opts);};
}
