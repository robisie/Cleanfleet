(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-local-v1';
  const DB_VERSION=1;
  const STORE='photos';

  let currentRecordId=null;
  let dbPromise=null;
  let busy=false;
  const enc=new TextEncoder();

  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const keyFor=(recordId,kind)=>`${recordId}|${kind}`;
  const activeKind=()=>document.querySelector('#cfPhotoOverlay .cf-photo-tab.active')?.dataset.photoKind||'przed';
  const pad=n=>String(n).padStart(2,'0');
  const fmtDate=s=>{const d=s?new Date(`${s}T12:00:00`):new Date();return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`};
  const safeToken=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'INNE';
  const typeToken=v=>{const s=String(v||'').trim().toUpperCase();if(s==='SOLÓWKA'||s==='SOLOWKA')return'SOLOWKA';if(s==='ZESTAW')return'ZESTAW';if(s==='BUS')return'BUS';if(s==='BUS C')return'BUS-C';if(s==='DOSTAWCZY')return'DOSTAWCZY';if(s==='OSOBOWY')return'OSOBOWY';return safeToken(s||'INNE')};
  const extFor=(name,mime)=>{const n=String(name||'').toLowerCase();const m=n.match(/\.([a-z0-9]{2,5})$/);if(m)return m[1]==='jpeg'?'jpg':m[1];const t=String(mime||'').toLowerCase();if(t.includes('png'))return'png';if(t.includes('heic'))return'heic';if(t.includes('heif'))return'heif';return'jpg'};

  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE)){
          const s=db.createObjectStore(STORE,{keyPath:'id'});
          s.createIndex('recordId','recordId',{unique:false});
          s.createIndex('recordKind','recordKind',{unique:false});
          s.createIndex('createdAt','createdAt',{unique:false});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Błąd lokalnej bazy zdjęć'));
    });
    return dbPromise;
  }
  async function tx(mode,fn){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(STORE,mode),s=t.objectStore(STORE);
      try{fn(s,t)}catch(e){t.abort();reject(e);return}
      t.oncomplete=()=>resolve();
      t.onerror=()=>reject(t.error||new Error('Błąd lokalnej bazy'));
      t.onabort=()=>reject(t.error||new Error('Przerwano zapis lokalny'));
    });
  }
  async function put(x){await tx('readwrite',s=>s.put(x));return x}
  async function del(id){await tx('readwrite',s=>s.delete(id))}
  async function all(){
    const db=await openDb();return new Promise((resolve,reject)=>{
      const rows=[],t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).openCursor();
      r.onsuccess=()=>{const c=r.result;if(!c)return;const {bytes,blob,thumbnail,...meta}=c.value;rows.push({...meta,size:blob?.size||bytes?.byteLength||0});c.continue()};
      t.oncomplete=()=>resolve(rows);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);
    });
  }
  async function getPhoto(id){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function byRecord(recordId){return (await all()).filter(x=>String(x.recordId)===String(recordId)).sort((a,b)=>a.createdAt-b.createdAt)}
  async function byRecordKind(recordId,kind){return (await byRecord(recordId)).filter(x=>x.kind===kind)}

  async function persistStaged(recordId,kind){
    const session=window.cfPhotoSession?.get();
    if(!session||String(session.record.id)!==String(recordId))return 0;
    const items=[...session.pending[kind]];
    if(!items.length)return 0;
    const ts=Date.now(),rows=[];
    for(let i=0;i<items.length;i++){
      const f=items[i].file;
      rows.push({id:uid(),recordId,kind,recordKind:keyFor(recordId,kind),name:f.name||`zdjecie-${i+1}.jpg`,mime:f.type||'image/jpeg',blob:f,thumbnail:items[i].thumbnail,createdAt:ts+i});
    }
    // Commit the entire batch, or leave every pending photo available for retry.
    await tx('readwrite',store=>rows.forEach(row=>store.put(row)));
    window.cfPhotoSession.committed(recordId,kind,items);
    return rows.length;
  }

  // Save a camera shot before allowing the next exposure. The original Blob stays intact.
  window.cfPhotoLocalStoreShot=async (recordId,kind,file)=>{
    const session=window.cfPhotoSession?.get();
    if(!session||String(session.record?.id)!==String(recordId)||!['przed','po'].includes(kind))
      throw new Error('Nie wybrano wpisu do zapisu zdjęcia.');
    await put({id:uid(),recordId,kind,recordKind:keyFor(recordId,kind),
      name:file.name||`zdjecie-${Date.now()}.jpg`,mime:file.type||'image/jpeg',
      blob:file,thumbnail:null,createdAt:Date.now()});
    document.dispatchEvent(new CustomEvent('cf:photos-saved',{detail:{recordId}}));
    renderLocal().catch(error=>console.warn('CleanFleet photo preview',error));
  };

  async function metadata(recordId){
    let data=window.cfPhotoSession?.get()?.record;
    if(!data?.plate||String(data.id)!==String(recordId)){
    if(typeof cfSupabase==='undefined'||!cfSupabase)throw new Error('Brak danych wpisu. Otwórz wpis przy połączeniu z internetem.');
    const result=await cfSupabase.from('wash_records').select('plate,type,order_date,order_due_date,wash_date,schedule_proposed_date').eq('id',recordId).single();
    if(result.error)throw result.error;
    data=result.data;
    }
    const date=data.wash_date||data.order_due_date||data.schedule_proposed_date||data.order_date||new Date().toISOString().slice(0,10);
    return{plate:safeToken(data.plate||'BEZ-TABLICY'),type:typeToken(data.type),date:fmtDate(date)};
  }

  function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
  function u16(v){const a=new Uint8Array(2),d=new DataView(a.buffer);d.setUint16(0,v,true);return a}
  function u32(v){const a=new Uint8Array(4),d=new DataView(a.buffer);d.setUint32(0,v>>>0,true);return a}
  function dosDateTime(date=new Date()){const time=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);const year=Math.max(1980,date.getFullYear());const dd=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();return{time,date:dd}}

  function stripMpoFromJpeg(bytes){
    if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
    let pos=2,scanStart=-1;const mpf=[];
    while(pos+1<bytes.length){
      if(bytes[pos]!==0xff)return null;
      const start=pos;
      while(pos<bytes.length&&bytes[pos]===0xff)pos++;
      if(pos>=bytes.length)return null;
      const marker=bytes[pos++];
      if(marker===0xda){
        if(pos+1>=bytes.length)return null;
        const len=(bytes[pos]<<8)|bytes[pos+1];
        if(len<2||pos+len>bytes.length)return null;
        scanStart=pos+len;
        break;
      }
      if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(pos+1>=bytes.length)return null;
      const len=(bytes[pos]<<8)|bytes[pos+1];
      if(len<2||pos+len>bytes.length)return null;
      const payload=pos+2;
      if(marker===0xe2&&payload+3<bytes.length&&bytes[payload]===0x4d&&bytes[payload+1]===0x50&&bytes[payload+2]===0x46&&bytes[payload+3]===0x00){
        mpf.push([start,pos+len]);
      }
      pos+=len;
    }
    if(!mpf.length||scanStart<0)return null;

    let eoi=-1;
    for(let i=scanStart;i+1<bytes.length;i++){
      if(bytes[i]!==0xff)continue;
      let j=i+1;
      while(j<bytes.length&&bytes[j]===0xff)j++;
      if(j>=bytes.length)break;
      const marker=bytes[j];
      if(marker===0x00){i=j;continue;}
      if(marker===0xd9){eoi=j+1;break;}
      i=j;
    }
    if(eoi<0)return null;

    let removed=0;
    for(const [a,b] of mpf)if(a<eoi)removed+=Math.max(0,Math.min(b,eoi)-a);
    if(!removed)return null;

    const out=new Uint8Array(eoi-removed);
    let from=0,to=0;
    for(const [a,b] of mpf){
      if(a>=eoi)break;
      if(a>from){out.set(bytes.subarray(from,a),to);to+=a-from;}
      from=Math.min(b,eoi);
    }
    if(from<eoi)out.set(bytes.subarray(from,eoi),to);
    return out;
  }

  async function preparePhotoForExport(row){
    const original=row.blob||new Blob([row.bytes],{type:row.mime||'image/jpeg'});
    const mime=row.mime||original.type||'image/jpeg';
    const bytes=new Uint8Array(await original.arrayBuffer());
    const jpeg=/jpe?g/i.test(mime)||((bytes[0]===0xff)&&(bytes[1]===0xd8));
    if(jpeg){
      const primary=stripMpoFromJpeg(bytes);
      if(primary){
        // Lossless MPO cleanup: JPEG scan data are copied byte-for-byte.
        // EXIF stays intact; only MPF metadata and the auxiliary JPEG are removed.
        return{blob:new Blob([primary],{type:'image/jpeg'}),bytes:primary,mime:'image/jpeg',ext:'jpg',normalized:true};
      }
    }
    return{blob:original,bytes,mime,ext:extFor(row.name,mime),normalized:false};
  }

  function showBuildProgress(done,total,msg){
    const box=ensureLocalBox();if(!box)return;
    const el=box.querySelector('[data-local-progress]');
    if(!el)return;
    el.style.display='block';
    const pct=total?Math.round(done/total*100):0;
    el.innerHTML=`<div style="display:flex;justify-content:space-between;font-weight:900"><span>Tworzenie ZIP…</span><span>${done} z ${total}</span></div><div style="font-size:9px;margin-top:4px;color:#6b726d">${msg||'Lokalnie na urządzeniu'}</div><div style="height:8px;background:#e6e9e3;border-radius:99px;margin-top:7px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#9fbd17"></div></div>`;
  }
  function clearBuildProgress(){document.querySelector('#cfPhotoOverlay [data-local-progress]')?.replaceChildren()}

  function cleanupDialog(recordId){
    const el=document.createElement('div');el.className='cf-local-zip-ready';
    el.innerHTML='<div class="cf-local-zip-card"><h3>Wyczyścić zdjęcia lokalne?</h3><p>Jeśli paczka ZIP została zapisana, możesz usunąć zdjęcia PRZED i PO tego wpisu z urządzenia. Tej operacji nie można cofnąć.</p><p data-cleanup-status role="status"></p><button data-local-cleanup type="button">Wyczyść zdjęcia lokalne tego wpisu</button><button data-local-close type="button">Zamknij</button></div>';
    document.body.appendChild(el);
    const clear=el.querySelector('[data-local-cleanup]'),close=el.querySelector('[data-local-close]'),status=el.querySelector('[data-cleanup-status]');
    clear.style.background='#9fbd17';clear.style.color='#111';
    close.onclick=()=>el.remove();
    clear.onclick=async()=>{
      if(busy||window.cfPhotoSession?.get()?.busy)return;
      busy=true;clear.disabled=true;close.disabled=true;window.cfPhotoSession?.setBusy(true);
      status.textContent='Czyszczenie zdjęć…';
      let removed=false;
      try{
        const rows=await byRecord(recordId);
        await tx('readwrite',store=>rows.forEach(row=>store.delete(row.id)));
        removed=true;
      }catch(e){console.error(e);status.textContent='Nie udało się wyczyścić zdjęć. Spróbuj ponownie.';}
      finally{busy=false;clear.disabled=false;close.disabled=false;window.cfPhotoSession?.setBusy(false);}
      if(removed){
        try{const ready=JSON.parse(sessionStorage.getItem('cf-photo-zip-ready')||'null');if(ready&&String(ready.recordId)===String(recordId)){await (await caches.open('cleanfleet-photo-download-v1')).delete(ready.url);if(ready.diskName&&navigator.storage?.getDirectory){const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('cleanfleet-photo-exports');await dir.removeEntry(ready.diskName).catch(()=>{});}sessionStorage.removeItem('cf-photo-zip-ready');}}catch(error){console.warn('CleanFleet ZIP cleanup',error)}
        el.remove();document.dispatchEvent(new CustomEvent('cf:photos-saved',{detail:{recordId}}));renderLocal().catch(console.error);toast('Wyczyszczono zdjęcia lokalne tego wpisu.');}
    };
  }

  const ZIP_CACHE='cleanfleet-photo-download-v1';
  const ZIP_READY_KEY='cf-photo-zip-ready';
  const isAppleMobile=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

  async function prepareZipDownload(recordId){
    if(!navigator.serviceWorker?.controller||!window.caches)throw new Error('Uruchom ponownie CleanFleet, aby włączyć pobieranie ZIP.');
    const items=await byRecord(recordId),meta=await metadata(recordId),root=`${meta.date}/${meta.plate}`;
    const entries=[{path:`${root}/przed/`},{path:`${root}/po/`}];
    for(const kind of ['przed','po'])items.filter(x=>x.kind===kind).forEach((x,i)=>entries.push({id:x.id,path:`${root}/${kind}/${String(i+1).padStart(3,'0')}.${extFor(x.name,x.mime)}`}));
    const name=`${meta.type}_${meta.plate}_${meta.date}.zip`,url=`/app/photo-download/${uid()}/${encodeURIComponent(name)}`;
    const manifest={format:'photo-zip-stream-v1',name,createdAt:Date.now(),entries};
    const cache=await caches.open(ZIP_CACHE);
    // Persist only names/IDs, never a second copy of all photos or a complete ZIP.
    await cache.put(url,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
    const ready={url,name,size:items.reduce((n,x)=>n+(x.size||0),0),recordId,streaming:true};
    sessionStorage.setItem(ZIP_READY_KEY,JSON.stringify(ready));
    for(const key of await cache.keys())if(new URL(key.url).pathname!==url)await cache.delete(key);
    return ready;
  }

  const ZIP_FILE_DIR='cleanfleet-photo-exports';
  async function prepareZipFile(ready,onProgress,signal){
    if(!navigator.storage?.getDirectory)throw new Error('Ta przeglądarka nie obsługuje przygotowania dużego ZIP-a. Zaktualizuj system lub użyj Safari.');
    const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle(ZIP_FILE_DIR,{create:true});
    const diskName=uid()+'.zip',handle=await dir.getFileHandle(diskName,{create:true});
    let writer=null,reader=null,completed=false;
    try{
      if(!handle.createWritable)throw new Error('Zapis dużego ZIP-a wymaga nowszej wersji Safari.');
      writer=await handle.createWritable();
      const response=await fetch(ready.url,{signal,cache:'no-store'});
      if(!response.ok||!response.headers.get('content-type')?.includes('application/zip'))throw new Error('Nie udało się rozpocząć tworzenia ZIP-a. Otwórz CleanFleet ponownie.');
      reader=response.body.getReader();let bytes=0,lastUpdate=0;
      while(true){
        if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
        const part=await reader.read();if(part.done)break;
        await writer.write(part.value);bytes+=part.value.byteLength;
        if(Date.now()-lastUpdate>=200){onProgress(bytes,ready.size,false);lastUpdate=Date.now();}
      }
      if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
      onProgress(bytes,ready.size,false);
      await writer.close();writer=null;
      const diskFile=await handle.getFile();
      // File wraps the disk-backed bytes; no arrayBuffer/Blob containing the whole ZIP.
      const file=new File([diskFile],ready.name,{type:'application/zip',lastModified:diskFile.lastModified});
      ready.diskName=diskName;ready.size=file.size;
      sessionStorage.setItem(ZIP_READY_KEY,JSON.stringify(ready));completed=true;
      onProgress(file.size,file.size,true);
      for await(const [name] of dir.entries())if(name!==diskName)try{await dir.removeEntry(name)}catch(_){}
      return file;
    }finally{
      if(reader)try{await reader.cancel()}catch(_){}
      if(writer)try{await writer.abort()}catch(_){}
      if(!completed)try{await dir.removeEntry(diskName)}catch(_){}
    }
  }

  async function readPreparedZip(ready){
    if(!ready.diskName)return null;
    try{
      const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle(ZIP_FILE_DIR);
      const file=await (await dir.getFileHandle(ready.diskName)).getFile();
      return new File([file],ready.name,{type:'application/zip',lastModified:file.lastModified});
    }catch(_){return null}
  }

  function shareDialog(file,recordId,ready=null){
    document.querySelector('.cf-local-zip-ready')?.remove();
    const el=document.createElement('div');el.className='cf-local-zip-ready';
    el.innerHTML='<div class="cf-local-zip-card" role="dialog" aria-modal="true" aria-label="Paczka zdjęć"><h3 data-zip-title>Przygotowanie ZIP-a</h3><div data-zip-name style="font-size:12px;font-weight:900;word-break:break-word"></div><div data-zip-size style="font-size:11px;color:#6f756f;margin:5px 0 14px"></div><progress data-zip-progress max="100" value="0" aria-label="Postęp tworzenia ZIP" style="width:100%;height:16px;accent-color:#9fbd17"></progress><p data-zip-status role="status" aria-live="polite"></p><button data-local-prepare type="button">Przygotuj ZIP ponownie</button><a data-local-download target="_blank" rel="noopener" hidden>Zapisz ZIP w Plikach</a><button data-local-cleaned type="button" hidden>ZIP zapisany — wyczyść zdjęcia</button><button data-local-close type="button">Anuluj</button></div>';
    document.body.appendChild(el);
    const title=el.querySelector('[data-zip-title]'),size=el.querySelector('[data-zip-size]'),progress=el.querySelector('[data-zip-progress]'),status=el.querySelector('[data-zip-status]'),download=el.querySelector('[data-local-download]'),close=el.querySelector('[data-local-close]'),retry=el.querySelector('[data-local-prepare]'),cleanup=el.querySelector('[data-local-cleaned]');
    el.querySelector('[data-zip-name]').textContent=file.name;
    let controller=null,url=null,closed=false;
    function dismiss(){closed=true;controller?.abort();el.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url),60000);}
    close.onclick=dismiss;
    cleanup.onclick=()=>{dismiss();cleanupDialog(recordId)};
    function update(bytes,total,done){
      if(closed)return;
      progress.value=done?100:Math.min(99,total?Math.floor(bytes/total*100):0);
      size.textContent=`${(bytes/1024/1024).toFixed(1)} MB${done?'':` / około ${(total/1024/1024).toFixed(1)} MB`}`;
      status.textContent=done?'ZIP gotowy. Kliknij „Zapisz ZIP w Plikach”. Okno zapisu otworzy się osobno; możesz wrócić do CleanFleet.':'Trwa tworzenie i zapis ZIP-a na urządzeniu… Pozostaw CleanFleet otwarty.';
    }
    function finish(prepared){
      if(closed)return;
      file=prepared;url=URL.createObjectURL(prepared);download.href=url;download.download=prepared.name;download.target='_blank';download.rel='noopener';
      title.textContent='ZIP gotowy do zapisania';update(prepared.size,prepared.size,true);
      download.hidden=false;retry.hidden=true;close.textContent='Zamknij';controller=null;
    }
    async function prepare(){
      if(closed||controller)return;
      controller=new AbortController();retry.hidden=true;download.hidden=true;cleanup.hidden=true;close.textContent='Anuluj';title.textContent='Przygotowanie ZIP-a';update(0,ready?.size||file.size,false);
      try{
        const prepared=await prepareZipFile(ready,update,controller.signal);
        finish(prepared);
      }catch(error){
        if(!closed){title.textContent='Nie ukończono ZIP-a';status.textContent=error?.name==='AbortError'?'Anulowano przygotowanie. Zdjęcia pozostają w CleanFleet.':(error?.name==='QuotaExceededError'?'Brak miejsca na przygotowanie ZIP-a. Zwolnij miejsce na urządzeniu i spróbuj ponownie.':error?.message||'Nie udało się przygotować ZIP-a.');retry.hidden=false;close.textContent='Zamknij';}
      }finally{controller=null;}
    }
    retry.onclick=prepare;
    download.onclick=()=>{status.textContent='Zapis otworzył się w osobnym oknie. Wybierz „Otwórz w…” / zapis w Plikach. Wróć do CleanFleet po zakończeniu zapisu.';cleanup.hidden=false;};
    if(file.slice){finish(file);return;}
    // Old manifest-only ready dialogs are rebuilt with visible, cancellable progress.
    update(0,ready?.size||file.size,false);retry.hidden=true;
    readPreparedZip(ready).then(prepared=>{if(closed)return;if(prepared)finish(prepared);else prepare()});
  }

  async function exportCombined(recordId){
    if(busy||window.cfPhotoSession?.get()?.busy)return;busy=true;window.cfPhotoSession?.setBusy(true);
    try{clearPreviews();const ready=await prepareZipDownload(recordId);clearBuildProgress();shareDialog({name:ready.name,size:ready.size},recordId,ready)}catch(e){console.error(e);clearBuildProgress();toast(e?.message||'Nie udało się przygotować pobierania ZIP-a.')}finally{busy=false;window.cfPhotoSession?.setBusy(false)}
  }

  async function saveToPhotos(recordId){
    if(busy||window.cfPhotoSession?.get()?.busy)return;
    if(!navigator.share){toast('Ta przeglądarka nie udostępnia zapisu zdjęć przez menu systemowe.');return;}
    busy=true;window.cfPhotoSession?.setBusy(true);
    const el=document.createElement('div');el.className='cf-local-zip-ready';
    el.innerHTML='<div class="cf-local-zip-card"><h3>Zapisz w Zdjęciach iPhone’a</h3><p>W menu systemowym wybierz „Zachowaj obrazy”. Zdjęcia lokalne pozostaną w CleanFleet.</p><p data-gallery-status role="status"></p><button data-local-share type="button" disabled>Zapisz w Zdjęciach</button><button data-local-close type="button">Zamknij</button></div>';
    document.body.appendChild(el);
    const status=el.querySelector('[data-gallery-status]'),share=el.querySelector('[data-local-share]'),close=el.querySelector('[data-local-close]');
    let closed=false,sharing=false,files=[],rows=[],next=0,batchEnd=0;
    function finish(){if(sharing)return;closed=true;files=[];rows=[];el.remove();busy=false;window.cfPhotoSession?.setBusy(false);}
    close.onclick=finish;
    async function prepare(){
      share.disabled=true;files=[];status.textContent='Przygotowanie zdjęć…';
      try{
        const batch=[];let size=0;batchEnd=next;
        // Only one modest batch is retained, including for older ArrayBuffer photos.
        while(batchEnd<rows.length&&batch.length<8&&size<20*1024*1024){
          const meta=rows[batchEnd],row=await getPhoto(meta.id);if(closed)return;
          if(!row)throw new Error('Zdjęcie nie jest już dostępne. Otwórz zapis ponownie.');
          const prepared=await preparePhotoForExport(row);
          batch.push(new File([prepared.blob],`${row.kind}-${String(batchEnd+1).padStart(3,'0')}.${prepared.ext}`,{type:prepared.mime}));
          size+=prepared.blob.size;batchEnd++;
        }
        if(closed)return;
        if(!batch.length){status.textContent='Brak zapisanych zdjęć. Najpierw kliknij „Zapisz zdjęcia” przy wpisie.';return;}
        if(navigator.canShare&&!navigator.canShare({files:batch}))throw new Error('System nie obsługuje udostępniania tych zdjęć w tej postaci. Możesz pobrać je jako ZIP.');
        files=batch;status.textContent=`Zdjęcia ${next+1}–${batchEnd} z ${rows.length}. Wybierz „Zachowaj obrazy” w następnym oknie.`;
        share.disabled=false;
      }catch(e){if(!closed){console.error(e);status.textContent=e?.message||'Nie udało się przygotować zdjęć.';}}
    }
    share.onclick=async()=>{
      if(closed||sharing||share.disabled||!files.length)return;
      sharing=true;share.disabled=true;close.disabled=true;
      try{
        // Fresh user click preserves the activation required by iOS sharing.
        await navigator.share({files});
        next=batchEnd;files=[];
        if(next<rows.length)await prepare();
        else{status.textContent='Udostępnianie zakończone. Sprawdź zdjęcia w aplikacji Zdjęcia. Kopie lokalne nadal są w CleanFleet.';share.hidden=true;}
      }catch(e){
        if(e?.name!=='AbortError'){console.error(e);status.textContent='Nie udało się udostępnić zdjęć. Spróbuj ponownie.';}
        share.disabled=false;
      }finally{sharing=false;close.disabled=false;}
    };
    try{rows=await byRecord(recordId);if(!closed)await prepare();}
    catch(e){if(!closed){console.error(e);status.textContent='Nie udało się odczytać zdjęć lokalnych.';}}
  }

  function ensureStyles(){
    if(document.getElementById('cfPhotoLocal1240Style'))return;
    const s=document.createElement('style');s.id='cfPhotoLocal1240Style';s.textContent=`
      .cf-photo-local{margin:8px 0 12px;padding:10px;border:1px solid #dfe5da;border-radius:12px;background:#fbfcf8}.cf-photo-local-head{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:900}.cf-photo-local-meta{font-size:9px;color:#626a63;margin-top:5px}.cf-photo-local-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}.cf-photo-local-thumb{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#ecefea}.cf-photo-local-thumb img{width:100%;height:100%;object-fit:cover}.cf-photo-local-thumb button{position:absolute;right:3px;top:3px;width:20px;height:20px;border:0;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:13px;line-height:20px;padding:0}.cf-photo-local-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.cf-photo-local-actions button{border:1px solid #ccd1c7;background:#fff;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:900}.cf-photo-local-actions .primary{background:#9fbd17;border-color:#9fbd17;color:#111}.cf-local-zip-ready{box-sizing:border-box;position:fixed;inset:0;z-index:300500;background:rgba(15,18,16,.48);display:flex;align-items:center;justify-content:center;padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom))}.cf-local-zip-card{width:min(390px,100%);max-height:calc(100dvh - 48px);overflow:auto;box-sizing:border-box;background:#fff;border-radius:20px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.3);color:#171a18}.cf-local-zip-card h3{margin:0 0 8px;font-size:20px}.cf-local-zip-card button{width:100%;border:0;border-radius:12px;padding:13px;font-weight:900;font-size:14px;margin-top:8px}.cf-local-zip-card [data-local-download]{display:block;text-align:center;text-decoration:none;border-radius:12px;padding:13px;font-weight:900;font-size:14px;margin-top:8px;background:#9fbd17;color:#111}.cf-local-zip-card [hidden]{display:none!important}.cf-local-zip-card [data-local-share]{background:#9fbd17;color:#111}.cf-local-zip-card [data-local-close]{background:#f0f2ef;color:#333}`;document.head.appendChild(s)
  }

  function ensureLocalBox(){
    const m=document.getElementById('cfPhotoOverlay');if(!m)return null;
    const anchor=m.querySelector('[data-photo-status]');if(!anchor)return null;
    let box=m.querySelector('.cf-photo-local');
    if(!box){box=document.createElement('div');box.className='cf-photo-local';box.innerHTML='<div class="cf-photo-local-head"><span>Zdjęcia lokalne</span><span data-local-counts></span></div><div class="cf-photo-local-meta" data-local-meta></div><div data-local-progress></div><div class="cf-photo-local-grid" data-local-grid></div><div class="cf-photo-local-actions"><button class="primary" data-local-export type="button">Pobierz ZIP</button><button data-local-gallery type="button">Zapisz w Zdjęciach iPhone’a</button></div>';anchor.insertAdjacentElement('afterend',box);box.querySelector('[data-local-export]').onclick=()=>currentRecordId&&exportCombined(currentRecordId);box.querySelector('[data-local-gallery]').onclick=()=>currentRecordId&&saveToPhotos(currentRecordId)}
    return box;
  }

  let renderVersion=0,renderRunning=false,renderAgain=false;
  let previewUrls=[];
  function clearPreviews(){previewUrls.forEach(u=>URL.revokeObjectURL(u));previewUrls=[];document.querySelector('#cfPhotoOverlay [data-local-grid]')?.replaceChildren()}
  async function renderLocal(){
    renderVersion++;
    if(window.cfPhotoSession?.get()?.busy)return;
    if(renderRunning){renderAgain=true;return;}
    renderRunning=true;
    try{do{renderAgain=false;await renderLocalOnce(renderVersion)}while(renderAgain)}finally{renderRunning=false}
  }
  async function renderLocalOnce(version){
    const m=document.getElementById('cfPhotoOverlay');if(!m||!m.classList.contains('open')||!currentRecordId)return;
    const box=ensureLocalBox();if(!box)return;
    const recordId=currentRecordId,kind=activeKind();
    const allPhotos=await byRecord(recordId);
    if(version!==renderVersion||recordId!==currentRecordId||kind!==activeKind()||!m.classList.contains('open'))return;
    const before=allPhotos.filter(x=>x.kind==='przed'),after=allPhotos.filter(x=>x.kind==='po'),visible=kind==='po'?after:before;
    box.querySelector('[data-local-counts]').textContent=`PRZED ${before.length} · PO ${after.length}`;
    box.querySelector('[data-local-meta]').textContent=before.length&&after.length?'Komplet gotowy do jednego ZIP-a.':before.length?'Zdjęcia PRZED zapisane lokalnie. Po praniu dodaj zdjęcia PO.':'Możesz pobrać ZIP w każdej chwili. Brakujące zdjęcia oznaczają pusty folder PRZED lub PO.';
    const exp=box.querySelector('[data-local-export]');exp.style.display='';exp.disabled=busy||!!window.cfPhotoSession?.get()?.busy;
    const grid=box.querySelector('[data-local-grid]');clearPreviews();
    for(const p of visible){
      const row=await getPhoto(p.id);if(!row)continue;
      const blob=row.thumbnail||await window.cfPhotoThumbnail(row.blob||new Blob([row.bytes],{type:row.mime}));
      if(version!==renderVersion||recordId!==currentRecordId||kind!==activeKind()||!m.classList.contains('open'))return;
      const url=blob?URL.createObjectURL(blob):null;if(url)previewUrls.push(url);
      const cell=document.createElement('div');cell.className='cf-photo-local-thumb';cell.innerHTML='<img alt="Zdjęcie"><button type="button" aria-label="Usuń">×</button>';
      if(url)cell.querySelector('img').src=url;
      cell.querySelector('button').onclick=async()=>{if(busy||window.cfPhotoSession?.get()?.busy)return;await del(p.id);document.dispatchEvent(new CustomEvent('cf:photos-saved'));await renderLocal()};grid.appendChild(cell);
    }
  }

  async function saveCurrent(){
    if(!currentRecordId||busy)return;
    const recordId=currentRecordId,kind=activeKind();busy=true;
    window.cfPhotoSession?.setBusy(true);
    try{
      const n=await persistStaged(recordId,kind);
      if(!n){toast('Brak nowych zdjęć do zapisania.');return;}
      toast(`Zapisano lokalnie ${n} ${n===1?'zdjęcie':'zdjęć'} ${kind.toUpperCase()}.`);
      await renderLocal();
      document.dispatchEvent(new CustomEvent('cf:photos-saved',{detail:{recordId}}));
    }catch(e){console.error(e);toast(e?.message||'Nie udało się zapisać zdjęć lokalnie.');}
    finally{busy=false;window.cfPhotoSession?.setBusy(false);}
    // ZIP is created only by the explicit export button.
  }

  function events(){
    document.addEventListener('cf:photos-close',()=>{renderVersion++;clearPreviews()});
    document.addEventListener('cf:photos-open',e=>{
      currentRecordId=e.detail.recordId;
      renderLocal().catch(e=>toast(e?.message||'Nie udało się odczytać zdjęć lokalnych.'));
    });
    document.addEventListener('cf:photos-render',()=>{
      renderLocal().catch(e=>toast(e?.message||'Nie udało się odczytać zdjęć lokalnych.'));
    });
    document.addEventListener('click',e=>{
      const save=e.target.closest?.('[data-photo-save]');
      if(save){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saveCurrent();}
    },true);
  }

  async function start(){
    ensureStyles();events();
    try{
      const ready=JSON.parse(sessionStorage.getItem(ZIP_READY_KEY)||'null');
      if(ready&&window.caches&&(await (await caches.open(ZIP_CACHE)).match(ready.url)))shareDialog({name:ready.name,size:ready.size},ready.recordId,ready);
    }catch(error){console.warn('CleanFleet ZIP recovery',error)}
    try{await navigator.storage?.persist?.()}catch(_){ }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();




