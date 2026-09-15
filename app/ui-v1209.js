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
        margin-left:6px;border:0;background:transparent;padding:2px 5px;min-width:28px;
        font:400 18px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI Emoji","Apple Color Emoji",sans-serif;
        color:var(--ink,#16150f);cursor:pointer;text-decoration:none;vertical-align:middle;
      }
      .cf-photo-btn.cf-photo-icon-btn:active{transform:scale(.94)}
      .cf-ui-company-pick{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.34);display:flex;align-items:center;justify-content:center;padding:18px}
      .cf-ui-company-pick-box{width:min(420px,92vw);background:#fff;border-radius:14px;padding:16px;box-shadow:0 12px 36px rgba(0,0,0,.18)}
      .cf-ui-company-pick-title{font-size:16px;font-weight:800;margin-bottom:5px}
      .cf-ui-company-pick-sub{font-size:11px;color:#777;margin-bottom:12px}
      .cf-ui-company-pick-list{display:grid;gap:8px}
      .cf-ui-company-btn{width:100%;text-align:left;border:1px solid #ddd;border-radius:10px;background:#fff;padding:11px 12px;font-size:13px;font-weight:700;cursor:pointer}
      .cf-ui-company-cancel{margin-top:10px;width:100%;border:0;background:transparent;text-decoration:underline;color:#666;padding:7px;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  function photoButtons(){return [...document.querySelectorAll('#recordsList [data-cf-photos]')];}

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
        b.title=label;b.setAttribute('aria-label',label);
      });
    }catch(e){
      console.warn('CleanFleet photo icons:',e);
      buttons.forEach(b=>{b.classList.add('cf-photo-icon-btn');b.textContent='📷';b.title='Zdjęcia wpisu';b.setAttribute('aria-label','Zdjęcia wpisu');});
    }finally{
      photoBusy=false;
      if(photoAgain){photoAgain=false;schedulePhotoRefresh(120);}
    }
  }

  function schedulePhotoRefresh(delay=80){clearTimeout(photoTimer);photoTimer=setTimeout(refreshPhotoIcons,delay);}

  function watchPhotoButtons(){
    const list=document.getElementById('recordsList');if(!list)return false;
    schedulePhotoRefresh(60);
    const obs=new MutationObserver(()=>schedulePhotoRefresh(100));obs.observe(list,{childList:true,subtree:true});
    return true;
  }

  function setFormDate(date){
    let tries=0;
    const apply=()=>{
      const input=document.getElementById('f_data_prania');
      if(input){input.value=date;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return;}
      if(++tries<40)setTimeout(apply,50);
    };
    apply();
  }

  async function openEntryFromCalendar(date,companyId){
    const cal=document.getElementById('cfCalMini');
    cal?.querySelector('.cf-ui-company-pick')?.remove();
    if(cal){cal.style.display='flex';cal.style.zIndex='15000';}
    try{
      if(typeof cfEnterCompany!=='function')throw new Error('Brak funkcji wyboru firmy');
      await cfEnterCompany(companyId);
      if(cal){cal.style.display='flex';cal.style.zIndex='15000';}
      if(typeof openForm!=='function')throw new Error('Brak formularza wpisu');
      openForm(null);
      setFormDate(date);
    }catch(e){
      console.error('CleanFleet calendar add:',e);
      try{showToast('Nie udało się otworzyć nowego wpisu.');}catch(_){}
      if(cal){cal.style.display='flex';cal.style.zIndex='130000';}
    }
  }

  function showCompanyPicker(date,companies){
    const cal=document.getElementById('cfCalMini');if(!cal)return;
    const host=cal.firstElementChild;if(!host)return;
    host.querySelector('.cf-ui-company-pick')?.remove();
    const p=document.createElement('div');p.className='cf-ui-company-pick';
    p.innerHTML=`<div class="cf-ui-company-pick-box"><div class="cf-ui-company-pick-title">Wybierz firmę</div><div class="cf-ui-company-pick-sub">Nowy wpis na ${date.split('-').reverse().join('.')}</div><div class="cf-ui-company-pick-list">${companies.map(c=>`<button type="button" class="cf-ui-company-btn" data-ui-company="${c.id}">${c.short_name||c.name||'Firma'}</button>`).join('')}</div><button type="button" class="cf-ui-company-cancel">Anuluj</button></div>`;
    p.addEventListener('click',e=>{
      const b=e.target.closest('[data-ui-company]');
      if(b){e.preventDefault();e.stopPropagation();openEntryFromCalendar(date,b.dataset.uiCompany);return;}
      if(e.target===p||e.target.closest('.cf-ui-company-cancel'))p.remove();
    });
    host.appendChild(p);
  }

  async function handleCalendarPlus(date){
    try{
      if(typeof cfSupabase==='undefined')throw new Error('Brak połączenia z bazą');
      const {data,error}=await cfSupabase.from('companies').select('id,name,short_name').eq('active',true).order('name');
      if(error)throw error;
      const companies=data||[];
      if(!companies.length){try{showToast('Brak aktywnej firmy.');}catch(_){}return;}
      if(companies.length===1){await openEntryFromCalendar(date,companies[0].id);return;}
      showCompanyPicker(date,companies);
    }catch(e){console.error('CleanFleet calendar plus:',e);try{showToast('Nie udało się otworzyć dodawania wpisu.');}catch(_){}}
  }

  function initCalendarFix(){
    document.addEventListener('click',e=>{
      const plus=e.target.closest('#cfCalMini [data-add-date]');
      if(!plus)return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      handleCalendarPlus(plus.dataset.addDate);
    },true);
  }

  function initPhotoRefreshHooks(){
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-photo-save]')){schedulePhotoRefresh(700);setTimeout(()=>schedulePhotoRefresh(0),1700);}
      else if(e.target.closest('[data-photo-close]'))schedulePhotoRefresh(150);
    },true);
  }

  function start(){
    ensureStyles();initCalendarFix();initPhotoRefreshHooks();
    if(!watchPhotoButtons()){
      const t=setInterval(()=>{if(watchPhotoButtons())clearInterval(t)},120);setTimeout(()=>clearInterval(t),15000);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();