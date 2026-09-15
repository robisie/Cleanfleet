(()=>{
  'use strict';
  let progress={active:false,total:0,done:0};
  let storageWrapped=false;

  function styles(){
    if(document.getElementById('cfPhotoProgress1213Styles'))return;
    const s=document.createElement('style');
    s.id='cfPhotoProgress1213Styles';
    s.textContent=`
      .cf-photo-progress{margin:8px 0 12px}
      .cf-photo-progress-head{display:flex;justify-content:space-between;gap:10px;font-size:11px;font-weight:800;color:#555;margin-bottom:6px}
      .cf-photo-progress-track{height:9px;border-radius:999px;background:#e6e8e3;overflow:hidden}
      .cf-photo-progress-bar{height:100%;width:0;background:#9fbd17;transition:width .18s ease}
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
            if(progress.done>=progress.total){
              paintProgress('✓ Wszystkie zdjęcia zapisane');
              progress.active=false;
            }else{
              paintProgress();
            }
          }
          return result;
        };
      }
      return client;
    };
    storageWrapped=true;
    return true;
  }

  function start(){
    styles();
    const wrap=()=>{if(!wrapStorage())setTimeout(wrap,100)};wrap();
    document.addEventListener('click',e=>{if(e.target.closest('[data-photo-save]'))beginProgress();},true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();