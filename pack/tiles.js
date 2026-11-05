export const deviceClass=width=>width<600?'phone':width<1100?'tablet':'desktop';
export function normalizedOrder(saved,ids){const allowed=new Set(ids),seen=new Set();return [...(Array.isArray(saved)?saved:[]),...ids].filter(id=>allowed.has(id)&&!seen.has(id)&&seen.add(id));}
export const gridColumns=width=>width<600?2:width<1100?3:6;
export function normalizedLayout(saved,ids){
 const out={},used=new Set();
 for(const id of ids){const slot=saved?.[id];if(Number.isInteger(slot)&&slot>=0&&slot<600&&!used.has(slot)){out[id]=slot;used.add(slot);}}
 for(const id of ids)if(!(id in out)){let slot=0;while(used.has(slot))slot++;out[id]=slot;used.add(slot);}
 return out;
}
export function placeTile(layout,id,slot){
 const out={...layout},previous=out[id];
 for(const other of Object.keys(out))if(other!==id&&out[other]===slot)out[other]=previous;
 out[id]=slot;return out;
}
// Resolve occupied rectangles while keeping saved preferred positions intact.
export function spanningLayout(layout,sizes,cols){
 const result={},used=new Set();
 const ids=Object.keys(layout).sort((a,b)=>(sizes[b]?.columns||1)-(sizes[a]?.columns||1));
 for(const id of ids){
  const width=Math.min(cols,sizes[id]?.columns||1),height=sizes[id]?.rows||1;
  let slot=layout[id];
  const fits=start=>{if(start%cols+width>cols)return false;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(used.has(start+y*cols+x))return false;return true;};
  if(slot%cols+width>cols)slot-=slot%cols-(cols-width);
  while(!fits(slot))slot++;
  result[id]=slot;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)used.add(slot+y*cols+x);
 }
 return result;
}
export function mountTiles(grid,userId){
 const tiles=[...grid.children],ids=tiles.map(tile=>tile.dataset.tile),touchEvents='ontouchstart' in window;
 let device=deviceClass(innerWidth),layout={},drag=null,target=null,ghost=null,marker=null,pending=null,holdTimer=null,blockClickUntil=0;
 const storageKey=()=>`robisie-pack-tiles-v2:${userId}:${device}`;
 let visible={},sizes={};
 const render=()=>{
  const cols=gridColumns(innerWidth),style=getComputedStyle(grid),height=parseFloat(style.gridAutoRows),gap=parseFloat(style.rowGap)||0;
  grid.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`;
  for(const tile of tiles){const width=Math.min(cols,Number(tile.dataset.spanColumns)||1);tile.style.gridColumn=`auto / span ${width}`;}
  for(const tile of tiles){const content=tile.querySelector?.('[data-tile-content]');sizes[tile.dataset.tile]={columns:Math.min(cols,Number(tile.dataset.spanColumns)||1),rows:content?Math.max(1,Math.ceil((content.scrollHeight+2+gap)/(height+gap))):1};}
  visible=spanningLayout(layout,sizes,cols);
  let rows=5;
  for(const tile of tiles){const id=tile.dataset.tile,slot=visible[id],size=sizes[id];tile.style.gridColumn=String(slot%cols+1)+(size.columns>1?` / span ${size.columns}`:'');tile.style.gridRow=String(Math.floor(slot/cols)+1)+(size.rows>1?` / span ${size.rows}`:'');rows=Math.max(rows,Math.floor(slot/cols)+size.rows);}
  grid.style.gridTemplateRows=`repeat(${rows},${style.gridAutoRows})`;
 };
 const apply=()=>{let saved;try{saved=JSON.parse(localStorage.getItem(storageKey()));if(!saved){const order=normalizedOrder(JSON.parse(localStorage.getItem(`robisie-pack-tiles-v1:${userId}:${device}`)),ids);saved=Object.fromEntries(order.map((id,i)=>[id,i]));}}catch{}layout=normalizedLayout(saved,ids);render();};
 const save=()=>{try{localStorage.setItem(storageKey(),JSON.stringify(layout));}catch{}};
 function move(tile,slot){layout=placeTile(visible,tile.dataset.tile,slot);render();save();}
 function cellAt(point){
  const rect=grid.getBoundingClientRect(),cols=gridColumns(innerWidth),style=getComputedStyle(grid),gap=parseFloat(style.columnGap)||0,rowGap=parseFloat(style.rowGap)||0,height=parseFloat(style.gridAutoRows),width=(rect.width-gap*(cols-1))/cols;
  if(point.clientX<rect.left||point.clientX>rect.right||point.clientY<rect.top||point.clientY>rect.bottom)return null;
  const col=Math.min(cols-1,Math.floor((point.clientX-rect.left)/(width+gap))),row=Math.floor((point.clientY-rect.top)/(height+rowGap));
  return Math.min(599,row*cols+col);
 }
 function clearHold(){clearTimeout(holdTimer);holdTimer=null;pending=null;}
 function aim(point){
  if(!drag)return;
  if(ghost)ghost.style.transform=`translate(${point.clientX-ghost.offsetX}px,${point.clientY-ghost.offsetY}px)`;
  target=cellAt(point);if(target!==null){const cols=gridColumns(innerWidth),width=sizes[drag.dataset.tile].columns;if(target%cols+width>cols)target-=target%cols-(cols-width);}
  if(marker){marker.hidden=target===null;if(target!==null){const cols=gridColumns(innerWidth);const size=sizes[drag.dataset.tile];marker.style.gridColumn=`${target%cols+1} / span ${size.columns}`;marker.style.gridRow=`${Math.floor(target/cols)+1} / span ${size.rows}`;}}
 }
 function begin(tile,point){
  clearHold();if(!tile||tile.parentElement!==grid)return;drag=tile;
  // Safari can cancel a touch when its target is moved in the DOM. Keep it in
  // place for the entire gesture; only a visual clone follows the finger.
  if(tile.cloneNode&&tile.getBoundingClientRect){const rect=tile.getBoundingClientRect();ghost=tile.cloneNode(true);ghost.removeAttribute('data-tile');ghost.setAttribute('aria-hidden','true');ghost.classList.add('tile-ghost');ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';ghost.offsetX=point.clientX-rect.left;ghost.offsetY=point.clientY-rect.top;document.body.append(ghost);}
  const cols=gridColumns(innerWidth),rows=Math.max(5,Math.floor(Math.max(...Object.values(layout))/cols)+2),style=getComputedStyle(grid);
  grid.style.minHeight=`${rows*parseFloat(style.gridAutoRows)+(rows-1)*(parseFloat(style.rowGap)||0)}px`;
  marker=document.createElement('div');marker.className='tile-slot';marker.setAttribute('aria-hidden','true');grid.append(marker);
  drag.classList.add('dragging');grid.classList?.add('reordering');aim(point);
 }
 function finish(commit=true){
  clearHold();if(!drag)return;
  const tile=drag,to=target;drag=null;target=null;tile.classList.remove('dragging');marker?.remove();marker=null;grid.style.minHeight='';grid.classList?.remove('reordering');ghost?.remove();ghost=null;blockClickUntil=Date.now()+500;
  if(commit&&to!==null)move(tile,to);
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
 function key(event){const handle=event.target.closest('[data-drag]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const tile=handle.closest('[data-tile]'),cols=gridColumns(innerWidth),slot=visible[tile.dataset.tile],offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-cols,ArrowDown:cols}[event.key];if(slot+offset>=0&&slot+offset<600)move(tile,slot+offset);handle.focus({preventScroll:true});}
 const resize=()=>{const next=deviceClass(innerWidth);finish(false);if(next!==device){device=next;apply();}else render();};
 const bindings=[[grid,'pointerdown',pointerStart,false],[document,'pointermove',pointerMove,{capture:true,passive:false}],[document,'pointerup',pointerEnd,true],[document,'pointercancel',pointerCancel,true],[grid,'touchstart',touchStart,{passive:false}],[document,'touchmove',touchMove,{capture:true,passive:false}],[document,'touchend',touchEnd,true],[document,'touchcancel',touchCancel,true],[grid,'click',click,true],[grid,'contextmenu',context,false],[grid,'keydown',key,false],[window,'blur',touchCancel,false],[window,'resize',resize,false]];
 for(const [el,type,fn,opts] of bindings)el.addEventListener(type,fn,opts);
 grid.querySelectorAll?.('img').forEach(img=>img.draggable=false);apply();
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{if(!drag)render();});for(const tile of tiles){const content=tile.querySelector?.('[data-tile-content]');if(content)observer?.observe(content);}
 return ()=>{observer?.disconnect();finish(false);for(const [el,type,fn,opts] of bindings)el.removeEventListener(type,fn,opts);};
}
