(()=>{
  'use strict';
  let data=null,pressTimer=null,src=null,active=false,ghost=null,over=null,startX=0,startY=0,suppressClickUntil=0;
  const norm=v=>String(v||'').trim().toUpperCase();
  function toast(msg){const h=document.getElementById('toastHost');if(!h)return;h.innerHTML=`<div class="toast">${String(msg).replace(/[&<>]/g,'')}</div>`;setTimeout(()=>h.innerHTML='',2600)}
  function style(){if(document.getElementById('cfAgeDnD1270Style'))return;const s=document.createElement('style');s.id='cfAgeDnD1270Style';s.textContent=`
    #ageOver .side-item[data-cf-age],#ageSoon .side-item[data-cf-age]{cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
    #ageOver .side-item.cf-age-source,#ageSoon .side-item.cf-age-source{opacity:.35}
    .cf-age-ghost{position:fixed;z-index:500000;pointer-events:none;min-width:150px;max-width:260px;padding:10px 12px;border-radius:11px;background:#213028;color:#fff;border:1px solid #5e8b6b;border-left:5px solid #dda84e;box-shadow:0 14px 38px rgba(0,0,0,.45);font:800 12px/1.25 system-ui,-apple-system,sans-serif;transform:translate(-50%,-115%)}
    #calendarBody [data-date].cf-age-over{background:#294832!important;box-shadow:inset 0 0 0 2px #75c58d!important}
  `;document.head.appendChild(s)}
  function clearOver(){if(over){over.classList.remove('cf-age-over');over=null}}
  function cleanup(){clearTimeout(pressTimer);pressTimer=null;clearOver();src?.classList.remove('cf-age-source');src=null;active=false;ghost?.remove();ghost=null}
  function moveGhost(x,y){if(ghost){ghost.style.left=x+'px';ghost.style.top=y+'px'}clearOver();const cell=document.elementFromPoint(x,y)?.closest?.('#calendarBody [data-date]');if(cell){over=cell;cell.classList.add('cf-age-over')}}
  function begin(x,y){if(!src)return;active=true;src.classList.add('cf-age-source');ghost=document.createElement('div');ghost.className='cf-age-ghost';ghost.textContent=(src.textContent||'').trim().replace(/\s+/g,' ');document.body.appendChild(ghost);moveGhost(x,y);if(navigator.vibrate)try{navigator.vibrate(18)}catch(_){}}

  async function refreshData(){try{data=await window.CFCalendarEngine.loadAll();mark()}catch(e){console.warn('CleanFleet ageing drag:',e)}}
  function findAge(plate,companyText){
    if(!data)return null;const p=norm(plate),ct=String(companyText||'').trim().toLowerCase();
    return data.ageing.find(x=>norm(x.plate)===p&&(!ct||String(x.company?.short_name||x.company?.name||'').trim().toLowerCase()===ct))||data.ageing.find(x=>norm(x.plate)===p)||null;
  }
  function mark(){
    if(!data)return;
    ['ageOver','ageSoon'].forEach(id=>document.querySelectorAll(`#${id} .side-item`).forEach(el=>{
      const strong=el.querySelector('strong')?.textContent||'',small=el.querySelector('small')?.textContent||'';
      const plate=strong.split('·')[0].trim(),company=small.split('·')[0].trim(),a=findAge(plate,company);if(!a)return;
      el.dataset.cfAge='1';el.dataset.companyId=String(a.company_id||'');el.dataset.plate=a.plate||'';el.dataset.vehicleType=a.type||'';el.draggable=true;
      el.title='Przeciągnij pojazd na dzień w kalendarzu, aby utworzyć zlecenie';
    }));
  }
  async function schedule(el,date){
    if(!el||!date)return;
    const companyId=el.dataset.companyId,plate=norm(el.dataset.plate),type=String(el.dataset.vehicleType||'');
    if(!companyId||!plate)return;
    try{
      const s=await window.CFCalendarEngine.loadSupabase();
      const {data:{user}}=await s.auth.getUser();
      const today=new Date().toISOString().slice(0,10);
      const {data:existing,error:qerr}=await s.from('wash_records').select('id').eq('company_id',companyId).eq('plate',plate).is('wash_date',null).order('created_at',{ascending:false}).limit(1);
      if(qerr)throw qerr;
      if(existing?.length){
        const {error:uerr}=await s.from('wash_records').update({ordered:true,order_date:today,order_due_date:date}).eq('id',existing[0].id);
        if(uerr)throw uerr;
      }else{
        const id=(window.crypto&&typeof window.crypto.randomUUID==='function')?window.crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const payload={
          id,
          company_id:companyId,
          created_by:user?.id||null,
          plate,
          type,
          brand:'',
          ordered:true,
          ordered_by:'Kalendarz',
          order_date:today,
          order_due_date:date,
          notes:'',
          performed_by:'',
          cost:0,
          approved:false,
          paid:false,
          created_at:new Date().toISOString()
        };
        const {error:ierr}=await s.from('wash_records').upsert([payload],{onConflict:'id'});
        if(ierr)throw ierr;
      }
      toast(`${plate} zaplanowano na ${date.split('-').reverse().join('.')}.`);
      document.getElementById('refresh')?.click();setTimeout(refreshData,500);
    }catch(e){
      console.error('CleanFleet ageing schedule:',e);
      toast(`Nie udało się utworzyć zlecenia: ${e?.message||'błąd zapisu'}`);
    }
  }
  function onDown(e){if(e.pointerType==='mouse')return;const el=e.target.closest?.('#ageOver .side-item[data-cf-age],#ageSoon .side-item[data-cf-age]');if(!el)return;src=el;startX=e.clientX;startY=e.clientY;pressTimer=setTimeout(()=>begin(e.clientX,e.clientY),260)}
  function onMove(e){if(!src)return;if(!active){if(Math.hypot(e.clientX-startX,e.clientY-startY)>9)cleanup();return}e.preventDefault();moveGhost(e.clientX,e.clientY)}
  function onUp(e){if(!src){cleanup();return}clearTimeout(pressTimer);if(!active){cleanup();return}e.preventDefault();e.stopPropagation();const el=src,date=over?.dataset?.date||null;suppressClickUntil=Date.now()+650;cleanup();if(date)schedule(el,date)}
  function desktop(){
    document.addEventListener('dragstart',e=>{const el=e.target.closest?.('#ageOver .side-item[data-cf-age],#ageSoon .side-item[data-cf-age]');if(!el)return;src=el;e.dataTransfer?.setData('application/x-cf-age',JSON.stringify({company_id:el.dataset.companyId,plate:el.dataset.plate,type:el.dataset.vehicleType}));if(e.dataTransfer)e.dataTransfer.effectAllowed='move'},true);
    document.addEventListener('dragover',e=>{const cell=e.target.closest?.('#calendarBody [data-date]');if(cell&&e.dataTransfer?.types?.includes('application/x-cf-age')){e.preventDefault();clearOver();over=cell;cell.classList.add('cf-age-over')}},true);
    document.addEventListener('drop',e=>{const cell=e.target.closest?.('#calendarBody [data-date]');if(!cell||!e.dataTransfer?.getData('application/x-cf-age'))return;e.preventDefault();e.stopPropagation();const el=src;cleanup();if(el)schedule(el,cell.dataset.date)},true);
    document.addEventListener('dragend',cleanup,true);
  }
  function boot(){style();desktop();refreshData();new MutationObserver(mark).observe(document.querySelector('.side')||document.body,{childList:true,subtree:true});document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(refreshData,350));document.addEventListener('pointerdown',onDown,{capture:true,passive:true});document.addEventListener('pointermove',onMove,{capture:true,passive:false});document.addEventListener('pointerup',onUp,{capture:true,passive:false});document.addEventListener('pointercancel',cleanup,{capture:true,passive:true});document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil&&e.target.closest?.('[data-cf-age]')){e.preventDefault();e.stopImmediatePropagation()}},true)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
