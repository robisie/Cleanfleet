(()=>{
  'use strict';

  let progress={active:false,total:0,done:0};
  let storageWrapped=false;

  function styles(){
    if(document.getElementById('cfUi1212Styles'))return;
    const s=document.createElement('style');
    s.id='cfUi1212Styles';
    s.textContent=`
      .cf-photo-progress{margin:8px 0 12px}
      .cf-photo-progress-head{display:flex;justify-content:space-between;gap:10px;font-size:11px;font-weight:800;color:#555;margin-bottom:6px}
      .cf-photo-progress-track{height:9px;border-radius:999px;background:#e6e8e3;overflow:hidden}
      .cf-photo-progress-bar{height:100%;width:0;background:#9fbd17;transition:width .18s ease}
      .cf-cal1212-pick{position:absolute;inset:0;z-index:50;background:rgba(0,0,0,.36);display:flex;align-items:center;justify-content:center;padding:18px}
      .cf-cal1212-box{width:min(420px,92vw);background:#fff;border-radius:14px;padding:16px;box-shadow:0 12px 36px rgba(0,0,0,.2)}
      .cf-cal1212-title{font-size:16px;font-weight:900;margin-bottom:5px}
      .cf-cal1212-sub{font-size:11px;color:#777;margin-bottom:12px}
      .cf-cal1212-list{display:grid;gap:8px}
      .cf-cal1212-company{width:100%;text-align:left;border:1px solid #ddd;border-radius:10px;background:#fff;padding:11px 12px;font-size:13px;font-weight:800;cursor:pointer}
      .cf-cal1212-cancel{width:100%;margin-top:10px;border:0;background:transparent;text-decoration:underline;color:#666;padding:8px;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  function ensureProgressUi(){
    const modal=document.getElementById('cfPhotoOverlay');
    const status=modal?.querySelector('[data-photo-status]');
    if(!status)return null;
    let el=modal.querySelector('.cf-photo-progress');
    if(!el){
      el=document.createElement('div');
      el.className='cf-photo-progress';
      el.style.display='none';
      el.innerHTML='<div class="cf-photo-progress-head"><span data-cfp-label>Zapisywanie zdjęć…</span><span data-cfp-count>0 z 0</span></div><div class="cf-photo-progress-track"><div class="cf-photo-progress-bar" data-cfp-bar></div></div>';
      status.insertAdjacentElement('afterend',el);
    }
    return el;
  }

  function paintProgress(finalText=''){
    const el=ensureProgressUi();if(!el)return;
    el.style.display='block';
    const pct=progress.total?Math.round(progress.done/progress.total*100):0;
    const label=el.querySelector('[data-cfp-label]');
    const count=el.querySelector('[data-cfp-count]');
    const bar=el.querySelector('[data-cfp-bar]');
    if(label)label.textContent=finalText||'Wysyłanie zdjęć na serwer…';
    if(count)count.textContent=`${progress.done} z ${progress.total}`;
    if(bar)bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;
  }

  function beginProgress(){
    const modal=document.getElementById('cfPhotoOverlay');
    const total=modal?.querySelectorAll('[data-photo-pending] .cf-photo-thumb').length||0;
    if(!total)return;
    progress={active:true,total,done:0};
    paintProgress();
    let ticks=0;
    const watch=setInterval(()=>{
      ticks++;
      const save=modal?.querySelector('[data-photo-save]');
      const saving=!!save&&(save.disabled||/Zapisywanie/i.test(save.textContent||''));
      if(!progress.active||(!saving&&ticks>2)||ticks>1200){
        clearInterval(watch);
        if(progress.done>=progress.total){paintProgress('✓ Wszystkie zdjęcia zapisane');}
        else if(progress.done>0){paintProgress('Zapis zakończony');}
        progress.active=false;
      }
    },250);
  }

  function wrapStorage(){
    if(storageWrapped||typeof cfSupabase==='undefined'||!cfSupabase?.storage?.from)return !!storageWrapped;
    const originalFrom=cfSupabase.storage.from.bind(cfSupabase.storage);
    cfSupabase.storage.from=function(bucket){
      const client=originalFrom(bucket);
      if(bucket==='zdjecia'&&client&&typeof client.upload==='function'){
        const originalUpload=client.upload.bind(client);
        client.upload=async function(...args){
          const result=await originalUpload(...args);
          if(progress.active&&!result?.error){
            progress.done=Math.min(progress.total,progress.done+1);
            paintProgress(progress.done>=progress.total?'✓ Wszystkie zdjęcia zapisane':'');
          }
          return result;
        };
      }
      return client;
    };
    storageWrapped=true;
    return true;
  }

  function setFormDate(date){
    let tries=0;
    const apply=()=>{
      const input=document.getElementById('f_data_prania');
      if(input){
        input.value=date;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return;
      }
      if(++tries<50)setTimeout(apply,50);
    };
    apply();
  }

  async function openEntry(date,companyId){
    const cal=document.getElementById('cfCalMini');
    cal?.querySelector('.cf-cal1212-pick')?.remove();
    try{
      if(cal){cal.style.display='flex';cal.style.zIndex='15000';}
      if(typeof cfEnterCompany!=='function')throw new Error('Brak funkcji wejścia do firmy');
      await cfEnterCompany(companyId);
      if(cal){cal.style.display='flex';cal.style.zIndex='15000';}
      if(typeof openForm!=='function')throw new Error('Brak formularza wpisu');
      openForm(null);
      setFormDate(date);
    }catch(err){
      console.error('CleanFleet calendar add:',err);
      try{showToast('Nie udało się otworzyć formularza wpisu.');}catch(_){}
      if(cal){cal.style.display='flex';cal.style.zIndex='130000';}
    }
  }

  function picker(date,companies){
    const cal=document.getElementById('cfCalMini');
    const host=cal?.firstElementChild;if(!host)return;
    host.querySelector('.cf-cal1212-pick')?.remove();
    const p=document.createElement('div');p.className='cf-cal1212-pick';
    p.innerHTML=`<div class="cf-cal1212-box"><div class="cf-cal1212-title">Wybierz firmę</div><div class="cf-cal1212-sub">Nowy wpis na ${date.split('-').reverse().join('.')}</div><div class="cf-cal1212-list">${companies.map(c=>`<button type="button" class="cf-cal1212-company" data-cf1212-company="${c.id}">${c.short_name||c.name||'Firma'}</button>`).join('')}</div><button type="button" class="cf-cal1212-cancel">Anuluj</button></div>`;
    p.querySelectorAll('[data-cf1212-company]').forEach(b=>b.addEventListener('pointerup',e=>{e.preventDefault();e.stopPropagation();openEntry(date,b.dataset.cf1212Company);},{once:true}));
    p.querySelector('.cf-cal1212-cancel')?.addEventListener('pointerup',e=>{e.preventDefault();e.stopPropagation();p.remove();});
    host.appendChild(p);
  }

  async function plus(date){
    try{
      if(typeof cfSupabase==='undefined')throw new Error('Brak bazy');
      const {data,error}=await cfSupabase.from('companies').select('id,name,short_name').eq('active',true).order('name');
      if(error)throw error;
      const companies=data||[];
      if(!companies.length){try{showToast('Brak aktywnej firmy.');}catch(_){}return;}
      const active=typeof window.cfGetActiveCompanyId==='function'?window.cfGetActiveCompanyId():null;
      if(active&&companies.some(c=>c.id===active)){await openEntry(date,active);return;}
      if(companies.length===1){await openEntry(date,companies[0].id);return;}
      picker(date,companies);
    }catch(err){console.error('CleanFleet calendar plus:',err);try{showToast('Nie udało się otworzyć dodawania wpisu.');}catch(_){}}
  }

  function bindPluses(){
    document.querySelectorAll('#cfCalMini [data-add-date]').forEach(b=>{
      if(b.dataset.cf1212Bound)return;
      b.dataset.cf1212Bound='1';
      b.addEventListener('pointerup',e=>{
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
        plus(b.dataset.addDate);
      },true);
    });
  }

  function observeCalendar(){
    let tries=0;
    const attach=()=>{
      const cal=document.getElementById('cfCalMini');
      if(!cal){if(++tries<150)setTimeout(attach,100);return;}
      bindPluses();
      const target=cal.querySelector('[data-b]')||cal;
      new MutationObserver(bindPluses).observe(target,{childList:true,subtree:true});
    };
    attach();
  }

  function start(){
    styles();observeCalendar();
    const wrap=()=>{if(!wrapStorage())setTimeout(wrap,100)};wrap();
    document.addEventListener('click',e=>{if(e.target.closest('[data-photo-save]'))beginProgress();},true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
