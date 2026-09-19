(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-local-v1';
  const DB_VERSION=1;
  const STORE='photos';
  let dbPromise=null;
  let currentRecordId=null;
  let refreshTimer=null;

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Błąd lokalnej bazy zdjęć'));
    });
    return dbPromise;
  }

  async function allPhotos(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const rows=[];const req=tx.objectStore(STORE).openCursor();
      req.onsuccess=()=>{const c=req.result;if(!c)return;rows.push({id:c.value.id,recordId:c.value.recordId});c.continue()};
      tx.oncomplete=()=>resolve(rows);
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
    if(document.getElementById('cfPhotoLocalUi1235Style'))return;
    const s=document.createElement('style');
    s.id='cfPhotoLocalUi1235Style';
    s.textContent=`
      [data-cf-photos][data-local-has="1"]{font-size:0!important}
      [data-cf-photos][data-local-has="1"]>*{display:none!important}
      [data-cf-photos][data-local-has="1"]::after{content:"📁";display:inline-block;font-size:18px!important;line-height:1!important}
      .cf-photo-local-actions [data-local-clear]{background:#fff!important;color:#b42318!important;border-color:#e2b8b4!important}
    `;
    document.head.appendChild(s);
  }

  let refreshing=false;
  async function refreshStates(){
    if(refreshing){scheduleRefresh(100);return;}refreshing=true;
    try{
    const rows=await allPhotos();
    const ids=new Set(rows.map(x=>String(x.recordId)));
    document.querySelectorAll('[data-cf-photos]').forEach(btn=>{
      const has=ids.has(String(btn.dataset.cfPhotos||''));
      if(has){
        btn.dataset.localHas='1';
        btn.title='Zdjęcia zapisane lokalnie — otwórz';
        btn.setAttribute('aria-label','Zdjęcia zapisane lokalnie — otwórz');
      }else{
        delete btn.dataset.localHas;
        btn.title='Dodaj zdjęcia PRZED / PO';
        btn.setAttribute('aria-label','Dodaj zdjęcia PRZED / PO');
      }
    });
    }finally{refreshing=false;}
  }

  function scheduleRefresh(delay=50){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>refreshStates().catch(()=>{}),delay);
  }

  function ensureClearButton(){
    const actions=document.querySelector('#cfPhotoOverlay .cf-photo-local-actions');
    if(!actions||actions.querySelector('[data-local-clear]'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.dataset.localClear='1';
    btn.textContent='Wyczyść zdjęcia lokalne';
    btn.addEventListener('click',async e=>{
      e.preventDefault();e.stopPropagation();
      if(!currentRecordId||window.cfPhotoSession?.get()?.busy)return;
      const rows=(await allPhotos()).filter(x=>String(x.recordId)===String(currentRecordId));
      if(!rows.length){scheduleRefresh(0);return;}
      if(!confirm(`Usunąć wszystkie lokalne zdjęcia tego wpisu?\n\nPRZED + PO: ${rows.length} zdjęć\n\nTej operacji nie można cofnąć.`))return;
      const n=await deleteRecordPhotos(currentRecordId);
      const box=document.querySelector('#cfPhotoOverlay .cf-photo-local');
      if(box){
        const counts=box.querySelector('[data-local-counts]');if(counts)counts.textContent='PRZED 0 · PO 0';
        const meta=box.querySelector('[data-local-meta]');if(meta)meta.textContent='Zdjęcia są przechowywane tylko na tym urządzeniu.';
        const grid=box.querySelector('[data-local-grid]');if(grid)grid.innerHTML='';
        const exp=box.querySelector('[data-local-export]');if(exp)exp.style.display='none';
      }
      if(typeof showToast==='function')showToast(`Usunięto lokalnie ${n} zdjęć.`);
      document.dispatchEvent(new CustomEvent('cf:photos-render'));
      scheduleRefresh(0);
    });
    actions.appendChild(btn);
  }

  function events(){
    document.addEventListener('cf:photos-open',e=>{currentRecordId=e.detail.recordId;ensureClearButton();scheduleRefresh(0);});
    document.addEventListener('cf:photos-saved',()=>scheduleRefresh(0));
    document.addEventListener('click',e=>{
      const opener=e.target.closest?.('[data-cf-photos]');
      if(opener){
        currentRecordId=opener.dataset.cfPhotos||null;
        setTimeout(()=>{ensureClearButton();scheduleRefresh(0)},220);
      }
    },true);

    const obs=new MutationObserver(mutations=>{
      let refresh=false,clear=false;
      for(const m of mutations){
        for(const node of m.addedNodes){
          if(node.nodeType!==1)continue;
          const el=node;
          if(el.matches?.('[data-cf-photos],.record-card,.cf-photo-local-thumb')||el.querySelector?.('[data-cf-photos],.record-card,.cf-photo-local-thumb'))refresh=true;
          if(el.matches?.('.cf-photo-local,.cf-photo-local-actions')||el.querySelector?.('.cf-photo-local,.cf-photo-local-actions'))clear=true;
        }
        for(const node of m.removedNodes){
          if(node.nodeType!==1)continue;
          const el=node;
          if(el.matches?.('.cf-photo-local-thumb')||el.querySelector?.('.cf-photo-local-thumb'))refresh=true;
        }
      }
      if(clear)ensureClearButton();
      if(refresh)scheduleRefresh(40);
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  function start(){
    ensureStyles();
    events();
    scheduleRefresh(0);
    setTimeout(()=>scheduleRefresh(0),400);
    setTimeout(()=>scheduleRefresh(0),1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

