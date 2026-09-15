(()=>{
  'use strict';

  let photoTimer=null;
  let photoBusy=false;
  let photoAgain=false;

  function ensureStyles(){
    if(document.getElementById('cfUi1209Styles'))return;
    const s=document.createElement('style');
    s.id='cfUi1209Styles';
    s.textContent=`
      .cf-photo-btn.cf-photo-icon-btn{
        margin-left:6px;
        border:0;
        background:transparent;
        padding:2px 5px;
        min-width:28px;
        font:400 18px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI Emoji","Apple Color Emoji",sans-serif;
        color:var(--ink,#16150f);
        cursor:pointer;
        text-decoration:none;
        vertical-align:middle;
      }
      .cf-photo-btn.cf-photo-icon-btn:active{transform:scale(.94)}
    `;
    document.head.appendChild(s);
  }

  function photoButtons(){
    return [...document.querySelectorAll('#recordsList [data-cf-photos]')];
  }

  async function refreshPhotoIcons(){
    if(photoBusy){photoAgain=true;return;}
    const buttons=photoButtons();
    if(!buttons.length||typeof cfSupabase==='undefined')return;
    const ids=[...new Set(buttons.map(b=>b.dataset.cfPhotos).filter(Boolean))];
    if(!ids.length)return;
    photoBusy=true;
    try{
      const {data,error}=await cfSupabase.from('wash_record_photos').select('wash_record_id').in('wash_record_id',ids);
      if(error)throw error;
      const withPhotos=new Set((data||[]).map(r=>String(r.wash_record_id)));
      buttons.forEach(b=>{
        const has=withPhotos.has(String(b.dataset.cfPhotos||''));
        const icon=has?'📁':'📷';
        b.classList.add('cf-photo-icon-btn');
        if(b.textContent!==icon)b.textContent=icon;
        const label=has?'Otwórz zdjęcia wpisu':'Dodaj zdjęcia do wpisu';
        b.title=label;
        b.setAttribute('aria-label',label);
      });
    }catch(e){
      console.warn('CleanFleet photo icons:',e);
      buttons.forEach(b=>{
        b.classList.add('cf-photo-icon-btn');
        if(b.textContent!=='📷')b.textContent='📷';
        b.title='Zdjęcia wpisu';
        b.setAttribute('aria-label','Zdjęcia wpisu');
      });
    }finally{
      photoBusy=false;
      if(photoAgain){photoAgain=false;schedulePhotoRefresh(120);}
    }
  }

  function schedulePhotoRefresh(delay=80){
    clearTimeout(photoTimer);
    photoTimer=setTimeout(refreshPhotoIcons,delay);
  }

  function watchPhotoButtons(){
    const list=document.getElementById('recordsList');
    if(!list)return false;
    schedulePhotoRefresh(60);
    const obs=new MutationObserver(()=>schedulePhotoRefresh(100));
    obs.observe(list,{childList:true,subtree:true});
    return true;
  }

  function restoreCalendarBehindForm(){
    const cal=document.getElementById('cfCalMini');
    if(!cal)return;
    let tries=0;
    const restore=()=>{
      tries++;
      const form=document.querySelector('#modalRoot > .overlay');
      if(form){
        cal.style.zIndex='15000';
        cal.style.display='flex';
        return;
      }
      if(tries<30)setTimeout(restore,50);
    };
    setTimeout(restore,0);
  }

  function initCalendarFix(){
    document.addEventListener('click',e=>{
      if(e.target.closest('#cfCalMini [data-add-date],#cfCalMini [data-company-id]')){
        restoreCalendarBehindForm();
      }
    },true);
  }

  function initPhotoRefreshHooks(){
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-photo-save]')){
        schedulePhotoRefresh(700);
        setTimeout(()=>schedulePhotoRefresh(0),1700);
      }else if(e.target.closest('[data-photo-close]')){
        schedulePhotoRefresh(150);
      }
    },true);
  }

  function start(){
    ensureStyles();
    initCalendarFix();
    initPhotoRefreshHooks();
    if(!watchPhotoButtons()){
      const t=setInterval(()=>{if(watchPhotoButtons())clearInterval(t)},120);
      setTimeout(()=>clearInterval(t),15000);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();