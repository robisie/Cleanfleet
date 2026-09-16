(()=>{
  'use strict';

  function todayLocal(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function getRecord(id){
    try{
      if(typeof records==='undefined' || !Array.isArray(records)) return null;
      return records.find(r=>String(r.id)===String(id))||null;
    }catch(_){
      return null;
    }
  }

  function openEditWithToday(id,rec){
    try{
      if(typeof openForm!=='function') return false;
      openForm(id);
    }catch(e){
      console.error('CleanFleet completion guard: openForm',e);
      return false;
    }

    const fill=()=>{
      const date=document.getElementById('f_data_prania');
      if(date && !date.value) date.value=todayLocal();

      const performer=document.getElementById('f_kto_wykonal');
      const cost=document.getElementById('f_koszt');
      if(!String(rec?.kto_wykonal||'').trim() && performer) performer.focus();
      else if(!(Number(rec?.koszt)>0) && cost) cost.focus();
    };

    requestAnimationFrame(()=>requestAnimationFrame(fill));
    setTimeout(fill,120);
    return true;
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-toggle-zatw]');
    if(!btn) return;

    try{
      if(typeof cfIsAdmin==='function' && !cfIsAdmin()) return;
    }catch(_){ }

    const id=btn.getAttribute('data-toggle-zatw');
    const rec=getRecord(id);
    if(!rec) return;

    // Przy odznaczaniu istniejącego wykonania pozostawiamy dotychczasowe zachowanie.
    if(rec.zatwierdzone) return;

    const missingDate=!String(rec.data_prania||'').trim();
    const missingPerformer=!String(rec.kto_wykonal||'').trim();
    const missingCost=!(Number(rec.koszt)>0);
    if(!missingDate && !missingPerformer && !missingCost) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if(openEditWithToday(id,rec)){
      const missing=[];
      if(missingDate) missing.push('datę prania');
      if(missingPerformer) missing.push('wykonawcę');
      if(missingCost) missing.push('kwotę prania');
      try{
        if(typeof showToast==='function') showToast(`Uzupełnij ${missing.join(', ')} przed oznaczeniem jako wykonane.`);
      }catch(_){ }
    }
  },true);
})();