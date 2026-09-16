(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-local-v1';
  const DB_VERSION=1;
  const STORE='photos';
  const READY_KEY='cf-local-photo-ready-ids-v1';
  let dbPromise=null;
  let refreshTimer=null;
  let refreshing=false;

  function readySet(){try{return new Set(JSON.parse(localStorage.getItem(READY_KEY)||'[]').map(String))}catch(_){return new Set()}}
  function saveReadySet(set){try{localStorage.setItem(READY_KEY,JSON.stringify([...set]))}catch(_){}}
  function setReady(id,ready){if(!id)return;const s=readySet();ready?s.add(String(id)):s.delete(String(id));saveReadySet(s)}

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
    s.textContent=`.cf-photo-btn{font-size:18px!important;text-decoration:none!important;padding:2px 5px!important;line-height:1!important}.cf-photo-local-actions [data-local-clear]{background:#fff!important;color:#b42318!important;border-color:#e2b8b4!important}`;
    document.head.appendChild(s);
  }

  function paintButton(btn,has){
    if(!btn)return;
    const text=has?'📁':'📷';
    const title=has?'Zdjęcia zapisane lokalnie — otwórz':'Dodaj zdjęcia PRZED / PO';
    btn.dataset.localPhotoState=has?'ready':'empty';
    if(btn.textContent!==text)btn.textContent=text;
    btn.title=title;
    btn.setAttribute('aria-label',title);
  }

  function syncOpenedFromModal(){
    const btn=document.querySelector('[data-cf-photos][data-local-photo-open="1"]');
    if(!btn)return;
    const counts=document.querySelector('#cfPhotoOverlay [data-local-counts]')?.textContent||'';
    const nums=[...counts.matchAll(/\d+/g)].map(m=>Number(m[0]));
    if(nums.length>=2){const has=(nums[0]+nums[1])>0;setReady(btn.dataset.cfPhotos,has);paintButton(btn,has)}
  }

  async function refreshIcons(){
    if(refreshing)return;
    refreshing=true;
    try{
      const rows=await allPhotos();
      const dbIds=new Set(rows.map(x=>String(x.recordId)));
      const remembered=readySet();
      for(const id of dbIds)remembered.add(id);
      saveReadySet(remembered);
      document.querySelectorAll('[data-cf-photos]').forEach(btn=>{
        const id=String(btn.dataset.cfPhotos||'');
        paintButton(btn,dbIds.has(id)||remembered.has(id));
      });
      syncOpenedFromModal();
    }catch(e){
      const remembered=readySet();
      document.querySelectorAll('[data-cf-photos]').forEach(btn=>paintButton(btn,remembered.has(String(btn.dataset.cfPhotos||''))));
      syncOpenedFromModal();
    }finally{refreshing=false}
  }

  function scheduleRefresh(delay=80){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refreshIcons().catch(()=>{}),delay)}

  function markOpenedButton(id){
    document.querySelectorAll('[data-cf-photos][data-local-photo-open]').forEach(x=>delete x.dataset.localPhotoOpen);
    const btn=[...document.querySelectorAll('[data-cf-photos]')].find(x=>String(x.dataset.cfPhotos)===String(id));
    if(btn)btn.dataset.localPhotoOpen='1';
  }

  function ensureClearButton(){
    const box=document.querySelector('#cfPhotoOverlay .cf-photo-local');if(!box)return;
    const actions=box.querySelector('.cf-photo-local-actions');if(!actions||actions.querySelector('[data-local-clear]'))return;
    const btn=document.createElement('button');btn.type='button';btn.dataset.localClear='1';btn.textContent='Wyczyść zdjęcia lokalne';actions.appendChild(btn);
  }

  async function clearCurrent(){
    const btn=document.querySelector('[data-cf-photos][data-local-photo-open="1"]');
    const recordId=btn?.dataset.cfPhotos||null;if(!recordId)return;
    const rows=(await allPhotos()).filter(x=>String(x.recordId)===String(recordId));
    if(!rows.length){setReady(recordId,false);paintButton(btn,false);if(typeof showToast==='function')showToast('Brak lokalnych zdjęć do usunięcia.');return}
    if(!confirm(`Usunąć wszystkie lokalne zdjęcia tego wpisu?\n\nPRZED + PO: ${rows.length} zdjęć\n\nTej operacji nie można cofnąć.`))return;
    const n=await deleteRecordPhotos(recordId);setReady(recordId,false);paintButton(btn,false);
    const box=document.querySelector('#cfPhotoOverlay .cf-photo-local');
    if(box){const counts=box.querySelector('[data-local-counts]');if(counts)counts.textContent='PRZED 0 · PO 0';const meta=box.querySelector('[data-local-meta]');if(meta)meta.textContent='Zdjęcia są przechowywane tylko na tym urządzeniu.';const grid=box.querySelector('[data-local-grid]');if(grid)grid.innerHTML='';const exp=box.querySelector('[data-local-export]');if(exp)exp.style.display='none'}
    if(typeof showToast==='function')showToast(`Usunięto lokalnie ${n} zdjęć.`);
  }

  function events(){
    document.addEventListener('click',e=>{
      const opener=e.target.closest?.('[data-cf-photos]');
      if(opener){markOpenedButton(opener.dataset.cfPhotos);setTimeout(()=>{ensureClearButton();syncOpenedFromModal();scheduleRefresh(0)},180);return}
      if(e.target.closest?.('[data-local-clear]')){e.preventDefault();e.stopPropagation();clearCurrent().catch(err=>{console.error(err);if(typeof showToast==='function')showToast('Nie udało się wyczyścić zdjęć lokalnych.')});return}
    },true);

    const obs=new MutationObserver(mutations=>{
      let relevant=false;
      for(const m of mutations){
        for(const node of m.addedNodes){if(node.nodeType!==1)continue;const el=node;if(el.matches?.('.record-card,[data-cf-photos],#cfPhotoOverlay,.cf-photo-local,.cf-photo-local-thumb')||el.querySelector?.('.record-card,[data-cf-photos],#cfPhotoOverlay,.cf-photo-local,.cf-photo-local-thumb')){relevant=true;break}}
        if(relevant)break;
      }
      if(relevant){ensureClearButton();syncOpenedFromModal();scheduleRefresh(30)}
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  function start(){
    ensureStyles();events();scheduleRefresh(0);
    [300,800,1500,3000,5000,8000].forEach(ms=>setTimeout(()=>scheduleRefresh(0),ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();