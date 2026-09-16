(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-queue-v1';
  const DB_VERSION=1;
  const STORE='items';
  const PHOTO_BUCKET='zdjecia';
  const MANUAL_PAUSE_KEY='cf-photo-queue-manual-paused';
  const MAX_SIDE=2000;
  const JPEG_QUALITY=.86;

  let currentRecordId=null;
  let staged=new Map();
  let processing=false;
  let wakeTimer=null;
  let uiTimer=null;
  let dbPromise=null;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const now=()=>Date.now();
  const uid=()=>crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const manualPaused=()=>localStorage.getItem(MANUAL_PAUSE_KEY)==='1';
  const setManualPaused=v=>{ if(v)localStorage.setItem(MANUAL_PAUSE_KEY,'1'); else localStorage.removeItem(MANUAL_PAUSE_KEY); };
  const keyFor=(recordId,kind)=>`${recordId}|${kind}`;
  const activeKind=()=>document.querySelector('#cfPhotoOverlay .cf-photo-tab.active')?.dataset.photoKind||'przed';
  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m);}catch(_){console.info(m)}};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slug=(v,f='inne')=>String(v||f).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||f;
  const plateSlug=v=>String(v||'BEZ-TABLICY').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'BEZ-TABLICY';

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const s=db.createObjectStore(STORE,{keyPath:'id'});
        s.createIndex('status','status',{unique:false});
        s.createIndex('recordId','recordId',{unique:false});
        s.createIndex('batchId','batchId',{unique:false});
        s.createIndex('createdAt','createdAt',{unique:false});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB error'));
    });
    return dbPromise;
  }
  async function tx(mode,fn){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(STORE,mode),s=t.objectStore(STORE);
      let out;
      try{out=fn(s,t);}catch(e){reject(e);return;}
      t.oncomplete=()=>resolve(out);
      t.onerror=()=>reject(t.error||new Error('IndexedDB transaction error'));
      t.onabort=()=>reject(t.error||new Error('IndexedDB transaction aborted'));
    });
  }
  async function put(item){await tx('readwrite',s=>s.put(item));return item;}
  async function del(id){await tx('readwrite',s=>s.delete(id));}
  async function allItems(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();
      r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);
    });
  }
  async function itemsByRecord(recordId){return (await allItems()).filter(x=>x.recordId===recordId);}
  async function nextRunnable(){
    const items=(await allItems()).filter(x=>['queued','uploading'].includes(x.status));
    items.sort((a,b)=>(a.nextAttemptAt||0)-(b.nextAttemptAt||0)||a.createdAt-b.createdAt);
    return items[0]||null;
  }

  async function hashBlob(blob){
    const buf=await blob.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',buf);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function jpegBlob(file){
    if(file.type==='image/jpeg'&&file.size<=3500000)return file;
    let bitmap=null;
    try{bitmap=await createImageBitmap(file);}catch(_){return file;}
    const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height));
    const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d').drawImage(bitmap,0,0,w,h);bitmap.close?.();
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Nie udało się przygotować zdjęcia')),'image/jpeg',JPEG_QUALITY));
  }

  async function waitForSupabase(){
    for(let i=0;i<120;i++){
      if(typeof cfSupabase!=='undefined'&&cfSupabase?.from&&cfSupabase?.storage)return cfSupabase;
      await sleep(250);
    }
    throw new Error('Brak połączenia z bazą');
  }

  async function getPhotoRows(recordId,kind){
    const sb=await waitForSupabase();
    const {data,error}=await sb.from('wash_record_photos').select('id,wash_record_id,kind,storage_path,content_hash,created_at').eq('wash_record_id',recordId).eq('kind',kind).order('created_at');
    if(error)throw error;
    return data||[];
  }

  async function backfillLegacyHashes(recordId,kind,rows){
    const sb=await waitForSupabase();
    for(const row of rows){
      if(row.content_hash||!row.storage_path)continue;
      try{
        const {data,error}=await sb.storage.from(PHOTO_BUCKET).download(row.storage_path);
        if(error||!data)continue;
        const h=await hashBlob(data);
        const {error:ue}=await sb.from('wash_record_photos').update({content_hash:h}).eq('id',row.id);
        if(!ue)row.content_hash=h;
      }catch(e){console.warn('CleanFleet photo legacy hash',e);}
    }
    return rows;
  }

  async function photoBasePath(recordId,rows){
    const first=rows.find(x=>x.storage_path)?.storage_path;
    if(first){const p=first.split('/');if(p.length>=4)return p.slice(0,3).join('/');}
    const sb=await waitForSupabase();
    const {data,error}=await sb.from('wash_records').select('id,plate,type,brand,order_date,order_due_date,wash_date,schedule_proposed_date').eq('id',recordId).single();
    if(error)throw error;
    const date=data.wash_date||data.order_due_date||data.schedule_proposed_date||data.order_date||new Date().toISOString().slice(0,10);
    return `${slug(data.type)}/${date}/${plateSlug(data.plate)}`;
  }

  function isAlreadyExistsError(e){
    const s=[e?.message,e?.error,e?.statusCode,e?.status].filter(Boolean).join(' ').toLowerCase();
    return s.includes('already exists')||s.includes('duplicate')||s.includes('409')||s.includes('23505');
  }

  async function processOne(item){
    const sb=await waitForSupabase();
    item.status='uploading';item.updatedAt=now();item.error='';await put(item);updateUiSoon();
    const normalized=await jpegBlob(item.blob);
    const hash=await hashBlob(normalized);
    item.contentHash=hash;item.updatedAt=now();await put(item);

    let rows=await getPhotoRows(item.recordId,item.kind);
    rows=await backfillLegacyHashes(item.recordId,item.kind,rows);
    if(rows.some(r=>r.content_hash===hash)){
      item.status='skipped';item.error='';item.updatedAt=now();item.finishedAt=now();await put(item);updateUiSoon();return;
    }

    const base=await photoBasePath(item.recordId,rows);
    const path=`${base}/${item.kind}/${hash}.jpg`;
    item.storagePath=path;await put(item);

    const up=await sb.storage.from(PHOTO_BUCKET).upload(path,normalized,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
    if(up.error&&!isAlreadyExistsError(up.error))throw up.error;

    const ins=await sb.from('wash_record_photos').insert({wash_record_id:item.recordId,kind:item.kind,storage_path:path,content_hash:hash}).select('id').maybeSingle();
    if(ins.error&&!isAlreadyExistsError(ins.error))throw ins.error;

    item.status=ins.error?'skipped':'done';item.error='';item.updatedAt=now();item.finishedAt=now();await put(item);updateUiSoon();
  }

  function retryDelay(attempts){return Math.min(60000,Math.max(1500,Math.round(1500*Math.pow(1.8,Math.min(attempts,8)))));}
  function scheduleWake(ms){clearTimeout(wakeTimer);wakeTimer=setTimeout(()=>kick(),Math.max(300,ms));}

  async function processor(){
    if(processing||manualPaused()||!navigator.onLine)return;
    processing=true;
    try{
      while(!manualPaused()&&navigator.onLine){
        const item=await nextRunnable();
        if(!item)break;
        const due=item.nextAttemptAt||0;
        if(due>now()){scheduleWake(due-now());break;}
        try{
          await processOne(item);
        }catch(e){
          console.warn('CleanFleet durable photo queue',e);
          item.status='queued';item.attempts=(item.attempts||0)+1;item.error=e?.message||String(e);item.updatedAt=now();item.nextAttemptAt=now()+retryDelay(item.attempts);await put(item);updateUiSoon();
          if(!navigator.onLine)break;
        }
      }
    }finally{processing=false;updateUiSoon();}
  }
  function kick(){clearTimeout(wakeTimer);processor().catch(e=>console.warn('CleanFleet photo queue processor',e));}

  async function recoverInterrupted(){
    const items=await allItems();
    for(const item of items){
      if(item.status==='uploading'){item.status='queued';item.updatedAt=now();item.nextAttemptAt=0;await put(item);}
      if(['done','skipped'].includes(item.status)&&item.finishedAt&&now()-item.finishedAt>7*86400000)await del(item.id);
    }
  }

  async function enqueueBatch(recordId,kind,files){
    const batchId=uid();
    const ts=now();
    for(let i=0;i<files.length;i++){
      const f=files[i];
      await put({id:uid(),batchId,recordId,kind,blob:f,originalName:f.name||`photo-${i+1}`,status:'queued',attempts:0,error:'',storagePath:'',contentHash:'',createdAt:ts+i,updatedAt:ts,nextAttemptAt:0,finishedAt:0});
    }
    return batchId;
  }

  function stageFiles(recordId,kind,files){
    const k=keyFor(recordId,kind),arr=staged.get(k)||[];
    arr.push(...files);staged.set(k,arr);
  }
  function removeStaged(recordId,kind,index){
    const k=keyFor(recordId,kind),arr=staged.get(k)||[];
    if(index>=0&&index<arr.length)arr.splice(index,1);
    staged.set(k,arr);
  }
  function takeStaged(recordId,kind){
    const k=keyFor(recordId,kind),arr=[...(staged.get(k)||[])];staged.delete(k);return arr;
  }

  async function latestBatchStats(recordId){
    const items=await itemsByRecord(recordId);
    if(!items.length)return null;
    const latest=items.reduce((a,b)=>!a||b.createdAt>a.createdAt?b:a,null);
    const batch=items.filter(x=>x.batchId===latest.batchId);
    const done=batch.filter(x=>x.status==='done').length;
    const skipped=batch.filter(x=>x.status==='skipped').length;
    const queued=batch.filter(x=>['queued','uploading'].includes(x.status)).length;
    const errors=batch.filter(x=>x.error).length;
    return{batchId:latest.batchId,total:batch.length,done,skipped,queued,errors,finished:done+skipped===batch.length};
  }

  function ensureStyles(){
    if(document.getElementById('cfPhotoQueue1210Styles'))return;
    const s=document.createElement('style');s.id='cfPhotoQueue1210Styles';s.textContent=`
      .cf-photo-durable{margin:8px 0 12px;padding:10px;border:1px solid #e1e5db;border-radius:10px;background:#fafbf7}
      .cf-photo-durable-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;font-weight:900;color:#4b5148}
      .cf-photo-durable-meta{font-size:9px;color:#7b8279;margin-top:4px}
      .cf-photo-durable-track{height:9px;border-radius:999px;background:#e4e7df;overflow:hidden;margin-top:7px}
      .cf-photo-durable-bar{height:100%;background:#9fbd17;width:0;transition:width .2s ease}
      .cf-photo-durable-actions{display:flex;gap:7px;margin-top:8px}.cf-photo-durable-actions button{border:1px solid #ccd1c7;background:#fff;border-radius:8px;padding:7px 10px;font-size:10px;font-weight:900;cursor:pointer}
      .cf-photo-durable-actions .primary{background:#16150f;color:#fff;border-color:#16150f}
    `;document.head.appendChild(s);
  }

  async function renderQueueUi(){
    const modal=document.getElementById('cfPhotoOverlay');
    if(!modal||!modal.classList.contains('open')||!currentRecordId)return;
    const status=modal.querySelector('[data-photo-status]');if(!status)return;
    let box=modal.querySelector('.cf-photo-durable');
    const stats=await latestBatchStats(currentRecordId);
    if(!stats){box?.remove();return;}
    if(!box){
      box=document.createElement('div');box.className='cf-photo-durable';
      box.innerHTML='<div class="cf-photo-durable-head"><span data-q-label>Kolejka zdjęć</span><span data-q-count>0 z 0</span></div><div class="cf-photo-durable-meta" data-q-meta></div><div class="cf-photo-durable-track"><div class="cf-photo-durable-bar" data-q-bar></div></div><div class="cf-photo-durable-actions"><button type="button" data-q-pause>Pauza</button><button type="button" class="primary" data-q-resume>Wznów</button></div>';
      status.insertAdjacentElement('afterend',box);
      box.querySelector('[data-q-pause]').addEventListener('click',()=>{setManualPaused(true);updateUiSoon();});
      box.querySelector('[data-q-resume]').addEventListener('click',()=>{setManualPaused(false);updateUiSoon();kick();});
    }
    const completed=stats.done+stats.skipped,pct=stats.total?Math.round(completed/stats.total*100):0;
    const paused=manualPaused()||!navigator.onLine;
    box.querySelector('[data-q-count]').textContent=`${completed} z ${stats.total}`;
    box.querySelector('[data-q-bar]').style.width=`${pct}%`;
    box.querySelector('[data-q-label]').textContent=stats.finished?'✓ Kolejka zakończona':paused?'Kolejka wstrzymana':'Wysyłanie zdjęć…';
    const parts=[];
    if(stats.skipped)parts.push(`pominięte duplikaty: ${stats.skipped}`);
    if(stats.queued)parts.push(`pozostało: ${stats.queued}`);
    if(stats.errors)parts.push(`ponowne próby: ${stats.errors}`);
    if(!navigator.onLine)parts.push('brak internetu');
    box.querySelector('[data-q-meta]').textContent=parts.join(' · ')||'Wszystkie zdjęcia zapisane.';
    box.querySelector('[data-q-pause]').style.display=stats.finished||manualPaused()?'none':'';
    box.querySelector('[data-q-resume]').style.display=stats.finished||!manualPaused()?'none':'';
  }
  function updateUiSoon(){clearTimeout(uiTimer);uiTimer=setTimeout(()=>renderQueueUi().catch(()=>{}),80);}

  function reopenPhotos(recordId){
    const close=document.querySelector('#cfPhotoOverlay [data-photo-close]');
    close?.click();
    setTimeout(()=>{
      const b=[...document.querySelectorAll(`[data-cf-photos]`)].find(x=>x.dataset.cfPhotos===recordId);
      b?.click();
      setTimeout(updateUiSoon,120);
    },80);
  }

  function captureEvents(){
    document.addEventListener('click',e=>{
      const opener=e.target.closest?.('[data-cf-photos]');
      if(opener){currentRecordId=opener.dataset.cfPhotos||null;setTimeout(updateUiSoon,180);return;}

      const remove=e.target.closest?.('[data-photo-remove]');
      if(remove&&currentRecordId){removeStaged(currentRecordId,activeKind(),Number(remove.dataset.photoRemove));return;}

      const save=e.target.closest?.('[data-photo-save]');
      if(save&&currentRecordId){
        e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
        (async()=>{
          const kind=activeKind(),files=takeStaged(currentRecordId,kind);
          if(!files.length){toast('Brak nowych zdjęć do zapisania.');return;}
          save.disabled=true;save.textContent='Dodaję do kolejki…';
          try{
            await enqueueBatch(currentRecordId,kind,files);
            toast(`Dodano ${files.length} ${files.length===1?'zdjęcie':'zdjęć'} do trwałej kolejki.`);
            const id=currentRecordId;reopenPhotos(id);kick();
          }catch(err){console.error('CleanFleet enqueue photos',err);toast('Nie udało się zapisać kolejki zdjęć.');save.disabled=false;save.textContent='Zapisz zdjęcia';}
        })();
      }
    },true);

    document.addEventListener('change',e=>{
      const input=e.target.closest?.('[data-photo-input]');
      if(!input||!currentRecordId)return;
      const files=[...(input.files||[])];
      if(files.length)stageFiles(currentRecordId,activeKind(),files);
    },true);

    window.addEventListener('online',()=>{updateUiSoon();if(!manualPaused())kick();});
    window.addEventListener('offline',updateUiSoon);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!manualPaused())kick();updateUiSoon();});
  }

  async function start(){
    ensureStyles();captureEvents();
    try{await recoverInterrupted();}catch(e){console.warn('CleanFleet photo queue recovery',e);}
    if(!manualPaused())kick();
    setInterval(()=>{if(!manualPaused()&&navigator.onLine)kick();updateUiSoon();},5000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();