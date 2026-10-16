export const deviceClass=width=>width<600?'phone':width<1100?'tablet':'desktop';
export function normalizedOrder(saved,ids){const allowed=new Set(ids),seen=new Set();return [...(Array.isArray(saved)?saved:[]),...ids].filter(id=>allowed.has(id)&&!seen.has(id)&&seen.add(id));}
export function mountTiles(grid,userId){
 const ids=[...grid.children].map(tile=>tile.dataset.tile);let device=deviceClass(innerWidth),drag=null;
 const storageKey=()=>`robisie-pack-tiles-v1:${userId}:${device}`;
 const apply=()=>{let saved;try{saved=JSON.parse(localStorage.getItem(storageKey()));}catch{}for(const id of normalizedOrder(saved,ids))grid.append([...grid.children].find(tile=>tile.dataset.tile===id));};
 const save=()=>{try{localStorage.setItem(storageKey(),JSON.stringify([...grid.children].map(tile=>tile.dataset.tile)));}catch{};};
 function move(tile,target){if(!target||target===tile||target.parentElement!==grid)return;const all=[...grid.children];if(all.indexOf(tile)<all.indexOf(target))target.after(tile);else target.before(tile);}
 function start(event){const handle=event.target.closest('[data-drag]');if(!handle||event.button>0)return;event.preventDefault();drag=handle.closest('[data-tile]');drag.classList.add('dragging');handle.setPointerCapture?.(event.pointerId);}
 function moving(event){if(!drag)return;event.preventDefault();move(drag,document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-tile]'));}
 function stop(){if(!drag)return;drag.classList.remove('dragging');drag=null;save();}
 function key(event){const handle=event.target.closest('[data-drag]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const tile=handle.closest('[data-tile]'),all=[...grid.children],i=all.indexOf(tile),offset=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;move(tile,all[i+offset]);save();handle.focus({preventScroll:true});}
 const resize=()=>{const next=deviceClass(innerWidth);if(next!==device){stop();device=next;apply();}};
 grid.addEventListener('pointerdown',start);grid.addEventListener('pointermove',moving);grid.addEventListener('pointerup',stop);grid.addEventListener('pointercancel',stop);grid.addEventListener('keydown',key);window.addEventListener('resize',resize);apply();
 return ()=>{stop();grid.removeEventListener('pointerdown',start);grid.removeEventListener('pointermove',moving);grid.removeEventListener('pointerup',stop);grid.removeEventListener('pointercancel',stop);grid.removeEventListener('keydown',key);window.removeEventListener('resize',resize);};
}
