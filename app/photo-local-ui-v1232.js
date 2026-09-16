(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-local-v1';
  const DB_VERSION=1;
  const STORE='photos';
  let dbPromise=null;
  let refreshTimer=null;
  let refreshing=false;

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Błąd lokalnej bazy zdjęć'));
    });
    return dbPromise;
  }

  async function allPhotos(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error||new Error('Błąd odczytu zdjęć'));
    });
  }

  async function deleteRecordPhotos(recordId){
    const rows=(await allPhotos()).filter(x=>String(x.recordId)===String(recordId));
    if(!rows.length)return 0;
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      const store=tx.objectStore(STORE);
      rows.forEach(x=>store.delete(x.id));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Błąd czyszczenia zdjęć'));
      tx.onabort=()=>reject(tx.error||new Error('Przerwano czyszczenie'));
    });
    return rows.length;
  }

  function ensureStyles(){
    if(document.getElementById('cfPhotoLocalUi1232Style'))return;
    const s=document.createElement('style');
    s.id='cfPhotoLocalUi1232Style';
    s.textContent=`
      .cf-photo-btn{font-size:18px!important;text-decoration:none!important;padding:2px 5px!important;line-height:1!important}
      .cf-photo-local-actions [data-local-clear]{background:#fff!important;color:#b42318!important;border-color:#e2b8b4!important}
    `;
    document.head.appendChild(s);
  }

  async function refreshIcons(){
    if(refreshing)return;
    refreshing=true;
    try{
      const rows=await allPhotos();
      const ids=new Set(rows.map(x=>String(x.recordId)));
      document.querySelectorAll('[data-cf-photos]').forEach(btn=>{
        const has=ids.has(String(btn.dataset.cfPhotos||''));
        const state=has?'ready':'empty';
        const text=has?'📁':'📷';
        const title=has?'Zdjęcia zapisane lokalnie — otwórz':'Dodaj zdjęcia PRZED / PO';
        if(btn.dataset.localPhotoState!==state)btn.dataset.localPhotoState=state;
        if(btn.textContent!==text)btn.textContent=text;
        if(btn.title!==title)btn.title=title;
        if(btn.getAttribute('aria-label')!==title)btn.setAttribute('aria-label',title);
      });
    }finally{refreshing=false;}
  }

  function scheduleRefresh(delay=80){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>refreshIcons().catch(()=>{}),delay);
  }

  function markOpenedButton(id){
    document.querySelectorAll('[data-cf-photos][data-local-photo-open]').forEach(x=>delete x.dataset.localPhotoOpen);
    const btn=[...document.querySelectorAll('[data-cf-photos]')].find(x=>String(x.dataset.cfPhotos)===String(id));
    if(btn)btn.dataset.localPhotoOpen='1';
  }

  function ensureClearButton(){
    const box=document.querySelector('#cfPhotoOverlay .cf-photo-local');
    if(!box)return;
    const actions=box.querySelector('.cf-photo-local-actions');
    if(!actions||actions.querySelector('[data-local-clear]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.dataset.localClear='1';
    btn.textContent='Wyczyść zdjęcia lokalne';
    actions.appendChild(btn);
  }

  async function clearCurrent(){
    const btn=document.querySelector('[data-cf-photos][data-local-photo-open="1"]');
    const recordId=btn?.dataset.cfPhotos||null;
    if(!recordId)return;
    const rows=(await allPhotos()).filter(x=>String(x.recordId)===String(recordId));
    if(!rows.length){
      if(typeof showToast==='function')showToast('Brak lokalnych zdjęć do usunięcia.');
      scheduleRefresh();
      return;
    }
    if(!confirm(`Usunąć wszystkie lokalne zdjęcia tego wpisu?\n\nPRZED + PO: ${rows.length} zdjęć\n\nTej operacji nie można cofnąć.`))return;
    const n=await deleteRecordPhotos(recordId);
    const box=document.querySelector('#cfPhotoOverlay .cf-photo-local');
    if(box){
      const counts=box.querySelector('[data-local-counts]');if(counts)counts.textContent='PRZED 0 · PO 0';
      const meta=box.querySelector('[data-local-meta]');if(meta)meta.textContent='Zdjęcia są przechowywane tylko na tym urządzeniu.';
      const grid=box.querySelector('[data-local-grid]');if(grid)grid.innerHTML='';
      const exp=box.querySelector('[data-local-export]');if(exp)exp.style.display='none';
    }
    if(typeof showToast==='function')showToast(`Usunięto lokalnie ${n} zdjęć.`);
    scheduleRefresh(0);
  }

  function events(){
    document.addEventListener('click',e=>{
      const opener=e.target.closest?.('[data-cf-photos]');
      if(opener){markOpenedButton(opener.dataset.cfPhotos);setTimeout(()=>{ensureClearButton();scheduleRefresh(0)},220);return;}
      if(e.target.closest?.('[data-local-clear]')){e.preventDefault();e.stopPropagation();clearCurrent().catch(err=>{console.error(err);if(typeof showToast==='function')showToast('Nie udało się wyczyścić zdjęć lokalnych.');});return;}
      if(e.target.closest?.('.cf-photo-local-thumb button'))scheduleRefresh(250);
    },true);

    const obs=new MutationObserver(mutations=>{
      let relevant=false;
      for(const m of mutations){
        for(const node of m.addedNodes){
          if(node.nodeType!==1)continue;
          const el=node;
          if(el.matches?.('.record-card,[data-cf-photos],#cfPhotoOverlay,.cf-photo-local,.cf-photo-local-thumb')||el.querySelector?.('.record-card,[data-cf-photos],#cfPhotoOverlay,.cf-photo-local,.cf-photo-local-thumb')){relevant=true;break;}
        }
        if(!relevant){
          for(const node of m.removedNodes){
            if(node.nodeType!==1)continue;
            const el=node;
            if(el.matches?.('.cf-photo-local-thumb')||el.querySelector?.('.cf-photo-local-thumb')){relevant=true;break;}
          }
        }
        if(relevant)break;
      }
      if(relevant){ensureClearButton();scheduleRefresh(40);}
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  function start(){
    ensureStyles();
    events();
    scheduleRefresh(0);
    setTimeout(()=>scheduleRefresh(0),500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();