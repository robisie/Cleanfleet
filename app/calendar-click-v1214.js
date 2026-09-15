(()=>{
  'use strict';

  function handleCalendarAdd(event){
    const button=event.target?.closest?.('#cfCalMini .cf-cal-add');
    if(!button)return;
    const day=button.closest('[data-date]');
    const date=day?.dataset?.date;
    if(!date)return;
    event.preventDefault();
    event.stopPropagation();
    try{
      if(typeof window.cfCalendarChooseCompany!=='function'){
        console.error('CleanFleet: cfCalendarChooseCompany is unavailable');
        try{showToast('Nie udało się otworzyć wyboru firmy.');}catch(_){}
        return;
      }
      window.cfCalendarChooseCompany(date);
    }catch(error){
      console.error('CleanFleet calendar add:',error);
      try{showToast('Nie udało się otworzyć wyboru firmy.');}catch(_){}
    }
  }

  document.addEventListener('click',handleCalendarAdd,true);
  document.addEventListener('touchend',event=>{
    const button=event.target?.closest?.('#cfCalMini .cf-cal-add');
    if(!button)return;
    const day=button.closest('[data-date]');
    const date=day?.dataset?.date;
    if(!date)return;
    event.preventDefault();
    event.stopPropagation();
    try{
      if(typeof window.cfCalendarChooseCompany==='function')window.cfCalendarChooseCompany(date);
    }catch(error){console.error('CleanFleet calendar touch add:',error);}
  },{capture:true,passive:false});
})();
