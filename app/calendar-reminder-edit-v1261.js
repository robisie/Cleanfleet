(()=>{
  'use strict';
  let currentReminderId=null;

  function toast(msg){
    const h=document.getElementById('toastHost');
    if(!h)return;
    h.innerHTML=`<div class="toast">${String(msg||'').replace(/[&<>]/g,'')}</div>`;
    setTimeout(()=>h.innerHTML='',2200);
  }

  async function editReminder(id){
    if(!id||!window.CFReminderForm?.open||!window.CFCalendarEngine?.loadSupabase)return;
    try{
      const db=await window.CFCalendarEngine.loadSupabase();
      const {data,error}=await db.from('cf_reminders').select('*').eq('id',id).single();
      if(error)throw error;
      const modalHost=document.getElementById('modalHost');
      if(modalHost)modalHost.innerHTML='';
      await window.CFReminderForm.open(data,async()=>document.getElementById('refresh')?.click());
    }catch(err){
      console.error('CleanFleet calendar reminder edit:',err);
      toast('Nie udało się otworzyć edycji przypomnienia.');
    }
  }

  function decorateModal(){
    const host=document.getElementById('modalHost');
    if(!host||!currentReminderId)return;
    const actions=host.querySelector('.modal-bg .modal .actions');
    if(!actions||actions.querySelector('[data-cf-reminder-edit]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn';
    btn.dataset.cfReminderEdit=currentReminderId;
    btn.textContent='Edytuj';
    const done=actions.querySelector('[data-done]');
    if(done)actions.insertBefore(btn,done);
    else actions.prepend(btn);
    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      editReminder(btn.dataset.cfReminderEdit);
    });
  }

  document.addEventListener('click',e=>{
    const item=e.target.closest?.('#calendarBody .event.reminder[data-id]');
    if(!item)return;
    currentReminderId=item.dataset.id||null;
    setTimeout(decorateModal,0);
    setTimeout(decorateModal,80);
  },true);

  const start=()=>{
    const host=document.getElementById('modalHost');
    if(host)new MutationObserver(decorateModal).observe(host,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
