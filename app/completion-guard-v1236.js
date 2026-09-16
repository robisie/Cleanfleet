(()=>{
  'use strict';

  let bypassId=null;
  let checking=false;

  function todayLocal(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function fillEditForm(row){
    const fill=()=>{
      const date=document.getElementById('f_data_prania');
      if(date && !date.value) date.value=todayLocal();

      const performer=document.getElementById('f_kto_wykonal');
      const cost=document.getElementById('f_koszt');
      if(!String(row?.performed_by||'').trim() && performer) performer.focus();
      else if(!(Number(row?.cost)>0) && cost) cost.focus();
    };
    requestAnimationFrame(()=>requestAnimationFrame(fill));
    setTimeout(fill,120);
    setTimeout(fill,300);
  }

  function openEdit(id,row){
    try{
      if(typeof openForm==='function'){
        openForm(id);
        fillEditForm(row);
        return true;
      }
    }catch(e){ console.warn('CleanFleet completion guard openForm:',e); }

    const safe=(window.CSS&&CSS.escape)?CSS.escape(String(id)):String(id).replace(/"/g,'\\"');
    const opener=document.querySelector(`[data-open="${safe}"]`);
    if(opener){
      opener.click();
      fillEditForm(row);
      return true;
    }
    return false;
  }

  async function checkAndContinue(btn,id){
    if(checking)return;
    checking=true;
    try{
      if(typeof cfSupabase==='undefined') throw new Error('Brak połączenia z bazą.');
      const {data:row,error}=await cfSupabase
        .from('wash_records')
        .select('id,wash_date,performed_by,cost,approved')
        .eq('id',id)
        .maybeSingle();
      if(error)throw error;
      if(!row)throw new Error('Nie znaleziono wpisu.');

      if(row.approved){
        bypassId=String(id);
        btn.click();
        return;
      }

      const missingDate=!String(row.wash_date||'').trim();
      const missingPerformer=!String(row.performed_by||'').trim();
      const missingCost=!(Number(row.cost)>0);

      if(!missingDate&&!missingPerformer&&!missingCost){
        bypassId=String(id);
        btn.click();
        return;
      }

      openEdit(id,row);
      const missing=[];
      if(missingDate)missing.push('datę prania');
      if(missingPerformer)missing.push('wykonawcę');
      if(missingCost)missing.push('kwotę prania');
      try{
        if(typeof showToast==='function')showToast(`Uzupełnij ${missing.join(', ')} przed oznaczeniem jako wykonane.`);
      }catch(_){ }
    }catch(err){
      console.error('CleanFleet completion guard:',err);
      try{if(typeof showToast==='function')showToast(err?.message||'Nie udało się sprawdzić danych wpisu.');}catch(_){ }
    }finally{
      checking=false;
    }
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-toggle-zatw]');
    if(!btn)return;

    const id=String(btn.getAttribute('data-toggle-zatw')||'');
    if(!id)return;

    if(bypassId===id){
      bypassId=null;
      return;
    }

    const input=btn.querySelector('input[type="checkbox"]');
    const isCurrentlyDone=btn.classList.contains('on')||!!input?.checked;
    if(isCurrentlyDone)return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    checkAndContinue(btn,id);
  },true);
})();