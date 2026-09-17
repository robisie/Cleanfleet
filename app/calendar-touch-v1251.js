(()=>{
  'use strict';
  let pressTimer=null,src=null,active=false,ghost=null,over=null,startX=0,startY=0,suppressClickUntil=0;

  function ensureStyle(){
    if(document.getElementById('cfCalTouch1251Style'))return;
    const s=document.createElement('style');s.id='cfCalTouch1251Style';s.textContent=`
      #calendarBody .event{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
      #calendarBody .event.cf-touch-source{opacity:.35}
      .cf-touch-drag-ghost{position:fixed;z-index:400000;pointer-events:none;min-width:150px;max-width:260px;padding:9px 11px;border-radius:10px;background:#213028;color:#fff;border:1px solid #4b7058;border-left:5px solid #48a868;box-shadow:0 12px 35px rgba(0,0,0,.45);font:800 12px/1.2 system-ui,-apple-system,sans-serif;transform:translate(-50%,-115%)}
      #calendarBody [data-date].cf-touch-over{background:#23402d!important;box-shadow:inset 0 0 0 2px #5cc47b!important}
    `;document.head.appendChild(s);
  }

  function toast(msg){const h=document.getElementById('toastHost');if(!h)return;h.innerHTML=`<div class="toast">${String(msg).replace(/[&<>]/g,'')}</div>`;setTimeout(()=>h.innerHTML='',2100)}
  function clearOver(){if(over){over.classList.remove('cf-touch-over');over=null}}
  function cleanup(){clearTimeout(pressTimer);pressTimer=null;clearOver();src?.classList.remove('cf-touch-source');src=null;active=false;ghost?.remove();ghost=null}
  function beginDrag(x,y){if(!src)return;active=true;src.classList.add('cf-touch-source');ghost=document.createElement('div');ghost.className='cf-touch-drag-ghost';ghost.textContent=(src.textContent||'').trim().replace(/\s+/g,' ');document.body.appendChild(ghost);moveGhost(x,y);if(navigator.vibrate)try{navigator.vibrate(20)}catch(_){}}
  function moveGhost(x,y){if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}clearOver();const el=document.elementFromPoint(x,y);const cell=el?.closest?.('#calendarBody [data-date]');if(cell){over=cell;cell.classList.add('cf-touch-over')}}

  async function moveEntry(kind,id,date){
    if(!id||!date)return;
    try{
      if(kind==='reminder')await window.CFCalendarEngine.moveReminder(id,date);
      else await window.CFCalendarEngine.moveWash(id,date);
      toast(kind==='reminder'?'Przypomnienie przeniesione.':'Termin przeniesiony.');
      document.getElementById('refresh')?.click();
    }catch(err){console.error('CleanFleet calendar touch move:',err);toast('Nie udało się przenieść wpisu.')}
  }

  function onPointerDown(e){
    if(e.pointerType==='mouse')return;
    const item=e.target.closest?.('#calendarBody .event[data-id]');if(!item)return;
    src=item;startX=e.clientX;startY=e.clientY;
    pressTimer=setTimeout(()=>beginDrag(e.clientX,e.clientY),240);
  }
  function onPointerMove(e){
    if(!src)return;
    if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)>9){clearTimeout(pressTimer);pressTimer=null;src=null}return}
    e.preventDefault();moveGhost(e.clientX,e.clientY);
  }
  function onPointerUp(e){
    if(!src){cleanup();return}
    clearTimeout(pressTimer);
    if(!active){cleanup();return}
    e.preventDefault();e.stopPropagation();suppressClickUntil=Date.now()+650;
    const kind=src.dataset.kind||'wash',id=src.dataset.id,date=over?.dataset?.date||null;
    cleanup();if(date)moveEntry(kind,id,date);
  }
  function onPointerCancel(){cleanup()}

  function bindDesktopReminderDrag(){
    document.addEventListener('dragstart',e=>{
      const item=e.target.closest?.('#calendarBody .event.reminder[data-id]');if(!item)return;
      e.dataTransfer?.setData('application/x-cf-reminder',item.dataset.id||'');
      e.dataTransfer?.setData('text/plain',item.dataset.id||'');
    },true);
    document.addEventListener('dragover',e=>{const cell=e.target.closest?.('#calendarBody [data-date]');if(cell&&e.dataTransfer?.types?.includes('application/x-cf-reminder')){e.preventDefault();cell.classList.add('dragover')}},true);
    document.addEventListener('drop',e=>{const cell=e.target.closest?.('#calendarBody [data-date]');if(!cell)return;const id=e.dataTransfer?.getData('application/x-cf-reminder');if(!id)return;e.preventDefault();e.stopPropagation();cell.classList.remove('dragover');moveEntry('reminder',id,cell.dataset.date)},true);
    const mark=()=>document.querySelectorAll('#calendarBody .event.reminder[data-id]').forEach(x=>x.setAttribute('draggable','true'));
    new MutationObserver(mark).observe(document.getElementById('calendarBody')||document.body,{childList:true,subtree:true});mark();
  }

  function bindSharedReminder(){
    const btn=document.getElementById('addReminder');if(!btn||!window.CFReminderForm)return;
    btn.onclick=()=>{
      const dayView=document.querySelector('#calendarBody .day-view[data-date]');
      const prefill=dayView?.dataset?.date||null;
      window.CFReminderForm.open(null,async()=>document.getElementById('refresh')?.click(),{prefillDate:prefill});
    };
  }

  function start(){
    ensureStyle();bindSharedReminder();bindDesktopReminderDrag();
    document.addEventListener('pointerdown',onPointerDown,{capture:true,passive:true});
    document.addEventListener('pointermove',onPointerMove,{capture:true,passive:false});
    document.addEventListener('pointerup',onPointerUp,{capture:true,passive:false});
    document.addEventListener('pointercancel',onPointerCancel,{capture:true,passive:true});
    document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest?.('#calendarBody .event')){e.preventDefault();e.stopImmediatePropagation()}},true);
    setTimeout(bindSharedReminder,500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
