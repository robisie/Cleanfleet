(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-queue-v1';
  const DB_VERSION=2;
  const STORE='items';
  const PAYLOAD_STORE='payloads';
  const PHOTO_BUCKET='zdjecia';
  const MANUAL_PAUSE_KEY='cf-photo-queue-manual-paused';
  const MAX_SIDE=2000;
  const JPEG_QUALITY=.86;

  let currentRecordId=null;
  let processing=false;
  let wakeTimer=null;
  let uiTimer=null;
  let dbPromise=null;
  let migrating=false;
  const staged=new Map();

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const now=()=>Date.now();
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const paused=()=>localStorage.getItem(MANUAL_PAUSE_KEY)==='1';
  const setPaused=v=>v?localStorage.setItem(MANUAL_PAUSE_KEY,'1'):localStorage.removeItem(MANUAL_PAUSE_KEY);
  const keyFor=(recordId,kind)=>`${recordId}|${kind}`;
  const activeKind=()=>document.querySelector('#cfPhotoOverlay .cf-photo-tab.active')?.dataset.photoKind||'przed';
  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const slug=(v,f='inne')=>String(v||f).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||f;
  const plateSlug=v=>String(v||'BEZ-TABLICY').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'BEZ-TABLICY';

  function withTimeout(promise,ms,label){
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} — przekroczono ${Math.round(ms/1000)} s`)),ms);})
    ]).finally(()=>clearTimeout(timer));
  }

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)){
          const s=db.createObjectStore(STORE,{keyPath:'id'});
          s.createIndex('status','status',{unique:false});
          s.createIndex('recordId','recordId',{unique:false});
          s.createIndex('batchId','batchId',{unique:false});
          s.createIndex('createdAt','createdAt',{unique:false});
        }
        if(!db.objectStoreNames.contains(PAYLOAD_STORE))db.createObjectStore(PAYLOAD_STORE,{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB error'));
      req.onblocked=()=>reject(new Error('Aktualizacja lokalnej bazy jest zablokowana przez inną kartę CleanFleet'));
    });
    return dbPromise;
  }

  async function storeRequest(storeName,mode,fn,label='Operacja lokalnej bazy'){
    const db=await openDb();
    return withTimeout(new Promise((resolve,reject)=>{
      const t=db.transaction(storeName,mode),s=t.objectStore(storeName);
      let req;
      try{req=fn(s)}catch(e){reject(e);return}
      if(req){req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error(`${label}: błąd`));}
      else{t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error||new Error(`${label}: błąd`));t.onabort=()=>reject(t.error||new Error(`${label}: przerwano`));}
    }),12000,label);
  }

  function cleanMeta(x){
    const m={...x};delete m.bytes;delete m.blob;return m;
  }
  async function putMeta(x){await storeRequest(STORE,'readwrite',s=>s.put(cleanMeta(x)),'Zapis statusu kolejki');return x;}
  async function delMeta(id){await storeRequest(STORE,'readwrite',s=>s.delete(id),'Usuwanie statusu kolejki');}
  async function allItems(){return await storeRequest(STORE,'readonly',s=>s.getAll(),'Odczyt kolejki')||[];}
  async function itemsByRecord(id){return (await allItems()).filter(x=>x.recordId===id);}
  async function putPayload(id,bytes,mime){await storeRequest(PAYLOAD_STORE,'readwrite',s=>s.put({id,bytes,mime:mime||'image/jpeg'}),'Zapis lokalnej kopii zdjęcia');}
  async function getPayload(id){return await storeRequest(PAYLOAD_STORE,'readonly',s=>s.get(id),'Odczyt lokalnej kopii zdjęcia');}
  async function delPayload(id){await storeRequest(PAYLOAD_STORE,'readwrite',s=>s.delete(id),'Usuwanie lokalnej kopii zdjęcia');}
  async function nextRunnable(){const a=(await allItems()).filter(x=>['queued','uploading'].includes(x.status));a.sort((x,y)=>(x.nextAttemptAt||0)-(y.nextAttemptAt||0)||x.createdAt-y.createdAt);return a[0]||null;}

  async function waitForSupabase(){for(let i=0;i<120;i++){if(typeof cfSupabase!=='undefined'&&cfSupabase?.from&&cfSupabase?.storage)return cfSupabase;await sleep(250)}throw new Error('Brak połączenia z bazą');}
  async function setPhase(item,phase){item.phase=phase;item.updatedAt=now();await putMeta(item);updateUiSoon();}
  async function hashBlob(blob){const b=await withTimeout(blob.arrayBuffer(),12000,'Odczyt zdjęcia');const d=await withTimeout(crypto.subtle.digest('SHA-256',b),12000,'Liczenie sumy kontrolnej');return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}

  async function imageElement(blob){
    const url=URL.createObjectURL(blob);
    try{
      const img=new Image();
      const loaded=new Promise((resolve,reject)=>{img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Safari nie potrafi odczytać tego formatu zdjęcia'));img.src=url;});
      return await withTimeout(loaded,12000,'Dekodowanie zdjęcia');
    }finally{setTimeout(()=>URL.revokeObjectURL(url),0);}
  }

  async function normalize(blob){
    if(blob.type==='image/jpeg'&&blob.size<=3500000)return blob;
    let source=null,w0=0,h0=0,bitmap=null;
    try{
      if(typeof createImageBitmap==='function'){
        try{bitmap=await withTimeout(createImageBitmap(blob),10000,'Dekodowanie zdjęcia');source=bitmap;w0=bitmap.width;h0=bitmap.height}catch(_){bitmap=null;}
      }
      if(!source){const img=await imageElement(blob);source=img;w0=img.naturalWidth||img.width;h0=img.naturalHeight||img.height;}
      if(!w0||!h0)throw new Error('Nie udało się odczytać rozmiaru zdjęcia');
      const scale=Math.min(1,MAX_SIDE/Math.max(w0,h0)),w=Math.max(1,Math.round(w0*scale)),h=Math.max(1,Math.round(h0*scale));
      const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(source,0,0,w,h);
      return await withTimeout(new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Nie udało się przygotować zdjęcia')),'image/jpeg',JPEG_QUALITY)),12000,'Kodowanie JPEG');
    }finally{try{bitmap?.close?.()}catch(_){}}
  }

  async function migrateLegacyItem(item){
    if(!item.bytes&&!item.blob)return item;
    try{
      let bytes=item.bytes,mime=item.mime||item.blob?.type||'image/jpeg';
      if(!bytes&&item.blob)bytes=(await withTimeout(item.blob.arrayBuffer(),12000,'Migracja lokalnego zdjęcia')).slice(0);
      if(!bytes)throw new Error('Brak danych zdjęcia');
      await putPayload(item.id,bytes,mime);
      delete item.bytes;delete item.blob;item.payloadReady=true;item.updatedAt=now();await putMeta(item);
      return item;
    }catch(e){
      item.status='unavailable';item.phase='niedostępne lokalnie';item.error='Nie udało się przenieść lokalnej kopii zdjęcia. Wybierz je ponownie.';item.finishedAt=now();item.updatedAt=now();delete item.bytes;delete item.blob;await putMeta(item);return item;
    }
  }

  async function durableBlob(item){
    if(item.bytes||item.blob)await migrateLegacyItem(item);
    const p=await getPayload(item.id);
    if(p?.bytes)return new Blob([p.bytes],{type:p.mime||item.mime||'image/jpeg'});
    item.status='unavailable';item.error='Brak lokalnej kopii zdjęcia. Wybierz zdjęcie ponownie.';item.phase='niedostępne lokalnie';item.updatedAt=now();item.finishedAt=now();await putMeta(item);updateUiSoon();return null;
  }

  async function getRows(recordId,kind){const sb=await waitForSupabase();const q=sb.from('wash_record_photos').select('id,storage_path,content_hash').eq('wash_record_id',recordId).eq('kind',kind);const {data,error}=await withTimeout(q,20000,'Sprawdzanie zapisanych zdjęć');if(error)throw error;return data||[];}
  async function basePath(recordId,rows){
    const f=rows.find(x=>x.storage_path)?.storage_path;if(f){const p=f.split('/');if(p.length>=4)return p.slice(0,3).join('/');}
    const sb=await waitForSupabase();const q=sb.from('wash_records').select('plate,type,order_date,order_due_date,wash_date,schedule_proposed_date').eq('id',recordId).single();const {data,error}=await withTimeout(q,20000,'Pobieranie danych wpisu');if(error)throw error;
    const date=data.wash_date||data.order_due_date||data.schedule_proposed_date||data.order_date||new Date().toISOString().slice(0,10);return `${slug(data.type)}/${date}/${plateSlug(data.plate)}`;
  }
  const existsErr=e=>{const s=[e?.message,e?.error,e?.statusCode,e?.status,e?.code].filter(Boolean).join(' ').toLowerCase();return s.includes('already exists')||s.includes('duplicate')||s.includes('409')||s.includes('23505');};

  async function serverHasHash(item,hash,rows=null){
    const list=rows||await getRows(item.recordId,item.kind);
    return list.find(r=>r.content_hash===hash)||null;
  }

  async function finishLocal(item,status='done',phase='zapisane'){
    item.status=status;item.phase=phase;item.error='';item.finishedAt=now();item.updatedAt=now();item.nextAttemptAt=0;await putMeta(item);try{await delPayload(item.id)}catch(_){ }updateUiSoon();
  }

  async function processOne(item){
    item.status='uploading';item.error='';item.updatedAt=now();item.phase='przygotowanie';await putMeta(item);updateUiSoon();
    const raw=await durableBlob(item);if(!raw)return;
    await setPhase(item,'przygotowanie zdjęcia');
    const blob=await withTimeout(normalize(raw),30000,'Przygotowanie zdjęcia');
    await setPhase(item,'liczenie sumy kontrolnej');
    const hash=item.contentHash||await hashBlob(blob);item.contentHash=hash;item.updatedAt=now();await putMeta(item);

    await setPhase(item,'synchronizacja z serwerem');
    const sb=await waitForSupabase();let rows=await getRows(item.recordId,item.kind);
    const existing=await serverHasHash(item,hash,rows);
    if(existing){await finishLocal(item,'done','już zapisane na serwerze');return;}

    await setPhase(item,'ustalanie ścieżki');
    const path=item.storagePath||`${await basePath(item.recordId,rows)}/${item.kind}/${hash}.jpg`;item.storagePath=path;await putMeta(item);

    await setPhase(item,'wysyłanie do serwera');
    const up=await withTimeout(sb.storage.from(PHOTO_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'}),35000,'Wysyłanie zdjęcia');
    if(up.error&&!existsErr(up.error))throw up.error;

    await setPhase(item,'zapis metadanych');
    const ins=await withTimeout(sb.from('wash_record_photos').insert({wash_record_id:item.recordId,kind:item.kind,storage_path:path,content_hash:hash}).select('id').maybeSingle(),20000,'Zapis metadanych zdjęcia');
    if(ins.error&&!existsErr(ins.error))throw ins.error;
    await finishLocal(item,ins.error?'skipped':'done',ins.error?'duplikat pominięty':'zapisane');
  }

  const retryDelay=n=>Math.min(60000,Math.max(1500,Math.round(1500*Math.pow(1.8,Math.min(n,8)))));
  function scheduleWake(ms){clearTimeout(wakeTimer);wakeTimer=setTimeout(kick,Math.max(300,ms));}
  async function processor(){
    if(processing||migrating||paused()||!navigator.onLine)return;processing=true;
    try{
      while(!paused()&&navigator.onLine){
        const item=await nextRunnable();if(!item)break;const due=item.nextAttemptAt||0;if(due>now()){scheduleWake(due-now());break;}
        try{await processOne(item);}catch(e){
          item.status='queued';item.phase='oczekuje na ponowną próbę';item.attempts=(item.attempts||0)+1;item.error=e?.message||String(e);item.updatedAt=now();item.nextAttemptAt=now()+retryDelay(item.attempts);
          try{await putMeta(item);}catch(dbErr){console.warn('CleanFleet queue status write failed',dbErr);}
          updateUiSoon();if(!navigator.onLine)break;
        }
      }
    }finally{processing=false;updateUiSoon();}
  }
  function kick(){clearTimeout(wakeTimer);processor().catch(e=>console.warn('CleanFleet photo queue',e));}

  async function recover(){
    migrating=true;updateUiSoon();
    try{
      const a=await allItems();
      for(const x of a){
        if(x.bytes||x.blob)await migrateLegacyItem(x);
        if(x.status==='uploading'){x.status='queued';x.phase='wznowienie po przerwaniu';x.nextAttemptAt=0;x.updatedAt=now();await putMeta(x);}
        if(['done','skipped'].includes(x.status)&&x.finishedAt&&now()-x.finishedAt>7*86400000){await delMeta(x.id);try{await delPayload(x.id)}catch(_){ }}
      }
    }finally{migrating=false;updateUiSoon();}
  }

  function stageFiles(recordId,kind,files){const k=keyFor(recordId,kind),a=staged.get(k)||[];for(const f of files){const p=withTimeout(f.arrayBuffer(),20000,'Kopiowanie zdjęcia do kolejki').then(bytes=>({bytes:bytes.slice(0),mime:f.type||'image/jpeg',name:f.name||'zdjecie.jpg'}));a.push(p);}staged.set(k,a);}
  function removeStaged(recordId,kind,index){const k=keyFor(recordId,kind),a=staged.get(k)||[];if(index>=0&&index<a.length)a.splice(index,1);staged.set(k,a);}
  async function enqueue(recordId,kind){
    const k=keyFor(recordId,kind),promises=[...(staged.get(k)||[])];if(!promises.length)return 0;staged.delete(k);
    const settled=await Promise.allSettled(promises),ok=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);if(!ok.length)throw new Error('Nie udało się skopiować zdjęć do trwałej kolejki');
    const batchId=uid(),ts=now();
    for(let i=0;i<ok.length;i++){
      const f=ok[i],id=uid();
      await putPayload(id,f.bytes,f.mime);
      await putMeta({id,batchId,recordId,kind,mime:f.mime,originalName:f.name,payloadReady:true,status:'queued',phase:'oczekuje',attempts:0,error:'',createdAt:ts+i,updatedAt:ts,nextAttemptAt:0,finishedAt:0,storagePath:'',contentHash:''});
    }
    return ok.length;
  }

  async function stats(recordId){
    const a=await itemsByRecord(recordId);if(!a.length)return null;const latest=a.reduce((x,y)=>!x||y.createdAt>x.createdAt?y:x,null),b=a.filter(x=>x.batchId===latest.batchId);
    const done=b.filter(x=>x.status==='done').length,skipped=b.filter(x=>x.status==='skipped').length,unavailable=b.filter(x=>x.status==='unavailable').length,queued=b.filter(x=>['queued','uploading'].includes(x.status)).length,retries=b.reduce((n,x)=>n+(x.attempts||0),0),err=[...b].sort((x,y)=>(y.updatedAt||0)-(x.updatedAt||0)).find(x=>x.error)?.error||'';
    const active=b.find(x=>x.status==='uploading')||[...b].sort((x,y)=>(y.updatedAt||0)-(x.updatedAt||0)).find(x=>x.status==='queued');
    return{total:b.length,done,skipped,unavailable,queued,retries,err,phase:migrating?'przenoszenie kolejki do nowego magazynu':active?.phase||'',finished:done+skipped+unavailable===b.length};
  }

  function ensureStyle(){if(document.getElementById('cfPhotoQueue1220Styles'))return;const s=document.createElement('style');s.id='cfPhotoQueue1220Styles';s.textContent=`.cf-photo-durable{margin:8px 0 12px;padding:10px;border:1px solid #e1e5db;border-radius:10px;background:#fafbf7}.cf-photo-durable-head{display:flex;justify-content:space-between;gap:10px;font-size:11px;font-weight:900}.cf-photo-durable-meta,.cf-photo-durable-phase,.cf-photo-durable-error{font-size:9px;margin-top:5px}.cf-photo-durable-phase{font-weight:800;color:#5f675f}.cf-photo-durable-error{color:#b7483c}.cf-photo-durable-track{height:9px;border-radius:999px;background:#e4e7df;overflow:hidden;margin-top:7px}.cf-photo-durable-bar{height:100%;background:#9fbd17;width:0;transition:width .2s}.cf-photo-durable-actions{display:flex;gap:7px;margin-top:8px}.cf-photo-durable-actions button{border:1px solid #ccd1c7;background:#fff;border-radius:8px;padding:7px 10px;font-size:10px;font-weight:900}`;document.head.appendChild(s);}
  async function renderUi(){
    const m=document.getElementById('cfPhotoOverlay');if(!m||!m.classList.contains('open')||!currentRecordId)return;const st=m.querySelector('[data-photo-status]');if(!st)return;let box=m.querySelector('.cf-photo-durable');const x=await stats(currentRecordId);if(!x){box?.remove();return;}
    if(!box){box=document.createElement('div');box.className='cf-photo-durable';box.innerHTML='<div class="cf-photo-durable-head"><span data-q-label>Kolejka zdjęć</span><span data-q-count></span></div><div class="cf-photo-durable-meta" data-q-meta></div><div class="cf-photo-durable-phase" data-q-phase></div><div class="cf-photo-durable-error" data-q-error></div><div class="cf-photo-durable-track"><div class="cf-photo-durable-bar" data-q-bar></div></div><div class="cf-photo-durable-actions"><button data-q-pause type="button">Pauza</button><button data-q-resume type="button">Wznów</button></div>';st.insertAdjacentElement('afterend',box);box.querySelector('[data-q-pause]').onclick=()=>{setPaused(true);updateUiSoon();};box.querySelector('[data-q-resume]').onclick=()=>{setPaused(false);updateUiSoon();kick();};}
    const completed=x.done+x.skipped+x.unavailable,pct=x.total?Math.round(completed/x.total*100):0;
    box.querySelector('[data-q-count]').textContent=`${completed} z ${x.total}`;box.querySelector('[data-q-bar]').style.width=`${pct}%`;box.querySelector('[data-q-label]').textContent=x.finished?'✓ Kolejka zakończona':paused()||!navigator.onLine?'Kolejka wstrzymana':migrating?'Przenoszenie kolejki…':'Wysyłanie zdjęć…';
    const p=[];if(x.queued)p.push(`pozostało: ${x.queued}`);if(x.skipped)p.push(`duplikaty: ${x.skipped}`);if(x.unavailable)p.push(`niedostępne lokalnie: ${x.unavailable}`);if(x.retries)p.push(`ponowne próby: ${x.retries}`);box.querySelector('[data-q-meta]').textContent=p.join(' · ')||'Wszystkie zdjęcia zapisane.';
    box.querySelector('[data-q-phase]').textContent=!x.finished&&x.phase?`Etap: ${x.phase}`:'';
    box.querySelector('[data-q-error]').textContent=x.err&&!x.finished?`Ostatni błąd: ${x.err}`:(x.unavailable?'Część zdjęć nie ma już lokalnej kopii — wybierz je ponownie.':'');
    box.querySelector('[data-q-pause]').style.display=x.finished||paused()?'none':'';box.querySelector('[data-q-resume]').style.display=x.finished||!paused()?'none':'';
  }
  function updateUiSoon(){clearTimeout(uiTimer);uiTimer=setTimeout(()=>renderUi().catch(()=>{}),80);}
  function reopen(recordId){document.querySelector('#cfPhotoOverlay [data-photo-close]')?.click();setTimeout(()=>{[...document.querySelectorAll('[data-cf-photos]')].find(x=>x.dataset.cfPhotos===recordId)?.click();setTimeout(updateUiSoon,160);},80);}

  function events(){
    document.addEventListener('click',e=>{
      const op=e.target.closest?.('[data-cf-photos]');if(op){currentRecordId=op.dataset.cfPhotos||null;setTimeout(updateUiSoon,160);return;}
      const rm=e.target.closest?.('[data-photo-remove]');if(rm&&currentRecordId){removeStaged(currentRecordId,activeKind(),Number(rm.dataset.photoRemove));return;}
      const save=e.target.closest?.('[data-photo-save]');if(save&&currentRecordId){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();(async()=>{save.disabled=true;save.textContent='Kopiowanie…';try{const n=await enqueue(currentRecordId,activeKind());if(!n){toast('Brak nowych zdjęć do zapisania.');save.disabled=false;save.textContent='Zapisz zdjęcia';return;}toast(`Dodano ${n} ${n===1?'zdjęcie':'zdjęć'} do trwałej kolejki.`);const id=currentRecordId;reopen(id);kick();}catch(err){console.error(err);toast(err.message||'Nie udało się zapisać kolejki.');save.disabled=false;save.textContent='Zapisz zdjęcia';}})();}
    },true);
    document.addEventListener('change',e=>{const input=e.target.closest?.('[data-photo-input]');if(!input||!currentRecordId)return;const files=[...(input.files||[])];if(files.length)stageFiles(currentRecordId,activeKind(),files);},true);
    window.addEventListener('online',()=>{updateUiSoon();if(!paused())kick();});window.addEventListener('offline',updateUiSoon);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!paused())kick();updateUiSoon();});
  }

  async function start(){ensureStyle();events();try{await recover();}catch(e){console.warn('CleanFleet photo queue recovery',e);toast('Nie udało się w pełni odtworzyć kolejki zdjęć.');}if(!paused())kick();setInterval(()=>{if(!paused()&&navigator.onLine)kick();updateUiSoon();},5000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();