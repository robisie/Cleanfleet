(()=>{
  'use strict';

  const DB_NAME='cleanfleet-photo-local-v1';
  const DB_VERSION=1;
  const STORE='photos';
  const CLEANUP_KEY='cf-photo-storage-cleanup-v1240-done';
  const BUCKET='zdjecia';

  let currentRecordId=null;
  let dbPromise=null;
  let busy=false;
  const staged=new Map();
  const enc=new TextEncoder();

  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const keyFor=(recordId,kind)=>`${recordId}|${kind}`;
  const activeKind=()=>document.querySelector('#cfPhotoOverlay .cf-photo-tab.active')?.dataset.photoKind||'przed';
  const pad=n=>String(n).padStart(2,'0');
  const fmtDate=s=>{const d=s?new Date(`${s}T12:00:00`):new Date();return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`};
  const safeToken=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'INNE';
  const typeToken=v=>{const s=String(v||'').trim().toUpperCase();if(s==='SOLÓWKA'||s==='SOLOWKA')return'SOLOWKA';if(s==='ZESTAW')return'ZESTAW';if(s==='BUS'||s==='BUS C')return'AUTOKAR';if(s==='DOSTAWCZY')return'DOSTAWCZY';if(s==='OSOBOWY')return'OSOBOWY';return safeToken(s||'INNE')};
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
      try{fn(s,t)}catch(e){reject(e);return}
      t.oncomplete=()=>resolve();
      t.onerror=()=>reject(t.error||new Error('Błąd lokalnej bazy'));
      t.onabort=()=>reject(t.error||new Error('Przerwano zapis lokalny'));
    });
  }
  async function put(x){await tx('readwrite',s=>s.put(x));return x}
  async function del(id){await tx('readwrite',s=>s.delete(id))}
  async function all(){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),r=t.objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
  async function byRecord(recordId){return (await all()).filter(x=>x.recordId===recordId).sort((a,b)=>a.createdAt-b.createdAt)}
  async function byRecordKind(recordId,kind){return (await byRecord(recordId)).filter(x=>x.kind===kind)}

  function stageFiles(recordId,kind,files){
    const k=keyFor(recordId,kind),a=staged.get(k)||[];
    for(const f of files)a.push(f);
    staged.set(k,a);
  }
  function removeStaged(recordId,kind,index){
    const k=keyFor(recordId,kind),a=staged.get(k)||[];
    if(index>=0&&index<a.length)a.splice(index,1);
    staged.set(k,a);
  }

  async function persistStaged(recordId,kind){
    const k=keyFor(recordId,kind),files=[...(staged.get(k)||[])];
    if(!files.length)return 0;
    const ts=Date.now();
    for(let i=0;i<files.length;i++){
      const f=files[i],bytes=await f.arrayBuffer();
      await put({id:uid(),recordId,kind,recordKind:keyFor(recordId,kind),name:f.name||`zdjecie-${i+1}.jpg`,mime:f.type||'image/jpeg',bytes:bytes.slice(0),createdAt:ts+i});
    }
    staged.delete(k);
    return files.length;
  }

  async function metadata(recordId){
    if(typeof cfSupabase==='undefined')throw new Error('Brak dostępu do danych wpisu.');
    const {data,error}=await cfSupabase.from('wash_records').select('plate,type,order_date,order_due_date,wash_date,schedule_proposed_date').eq('id',recordId).single();
    if(error)throw error;
    const date=data.wash_date||data.order_due_date||data.schedule_proposed_date||data.order_date||new Date().toISOString().slice(0,10);
    return{plate:safeToken(data.plate||'BEZ-TABLICY'),type:typeToken(data.type),date:fmtDate(date)};
  }

  function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
  function u16(v){const a=new Uint8Array(2),d=new DataView(a.buffer);d.setUint16(0,v,true);return a}
  function u32(v){const a=new Uint8Array(4),d=new DataView(a.buffer);d.setUint32(0,v>>>0,true);return a}
  function dosDateTime(date=new Date()){const time=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);const year=Math.max(1980,date.getFullYear());const dd=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();return{time,date:dd}}

  function showBuildProgress(done,total,msg){
    const box=ensureLocalBox();if(!box)return;
    const el=box.querySelector('[data-local-progress]');
    if(!el)return;
    el.style.display='block';
    const pct=total?Math.round(done/total*100):0;
    el.innerHTML=`<div style="display:flex;justify-content:space-between;font-weight:900"><span>Tworzenie ZIP…</span><span>${done} z ${total}</span></div><div style="font-size:9px;margin-top:4px;color:#6b726d">${msg||'Lokalnie na urządzeniu'}</div><div style="height:8px;background:#e6e9e3;border-radius:99px;margin-top:7px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#9fbd17"></div></div>`;
  }
  function clearBuildProgress(){document.querySelector('#cfPhotoOverlay [data-local-progress]')?.replaceChildren()}

  async function makeCombinedZip(recordId){
    const items=await byRecord(recordId);
    const before=items.filter(x=>x.kind==='przed'),after=items.filter(x=>x.kind==='po');
    if(!before.length||!after.length)throw new Error('Do ZIP-a potrzebne są zdjęcia PRZED i PO.');
    const meta=await metadata(recordId);
    const root=`${meta.type.toLowerCase()}/${meta.date}/${meta.plate}`;
    const ordered=[...before.map((x,i)=>({x,path:`${root}/przed/${String(i+1).padStart(3,'0')}.${extFor(x.name,x.mime)}`})),...after.map((x,i)=>({x,path:`${root}/po/${String(i+1).padStart(3,'0')}.${extFor(x.name,x.mime)}`}))];
    const locals=[],centrals=[];let offset=0;const dt=dosDateTime();
    for(let i=0;i<ordered.length;i++){
      const {x,path}=ordered[i];showBuildProgress(i,ordered.length,`Przygotowanie ${path}`);
      const bytes=new Uint8Array(x.bytes),nameBytes=enc.encode(path),crc=crc32(bytes),size=bytes.byteLength;
      const local=new Blob([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(size),u32(size),u16(nameBytes.length),u16(0),nameBytes,bytes]);
      locals.push(local);
      const central=new Blob([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(size),u32(size),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes]);
      centrals.push(central);offset+=local.size;showBuildProgress(i+1,ordered.length,`Gotowe ${i+1} z ${ordered.length}`);await new Promise(r=>setTimeout(r,0));
    }
    const centralOffset=offset,centralSize=centrals.reduce((s,b)=>s+b.size,0),end=new Blob([u32(0x06054b50),u16(0),u16(0),u16(ordered.length),u16(ordered.length),u32(centralSize),u32(centralOffset),u16(0)]);
    const blob=new Blob([...locals,...centrals,end],{type:'application/zip'});
    return new File([blob],`${meta.type}_${meta.plate}_${meta.date}.zip`,{type:'application/zip',lastModified:Date.now()});
  }

  function shareDialog(file){
    document.querySelector('.cf-local-zip-ready')?.remove();
    const el=document.createElement('div');el.className='cf-local-zip-ready';
    el.innerHTML=`<div class="cf-local-zip-card"><h3>Paczka PRZED + PO gotowa</h3><div style="font-size:12px;font-weight:900;word-break:break-word">${file.name}</div><div style="font-size:10px;color:#6f756f;margin:5px 0 14px">${(file.size/1024/1024).toFixed(1)} MB · utworzono lokalnie</div><button data-local-share type="button">Udostępnij / zapisz do iCloud</button><button data-local-close type="button">Zamknij</button></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-local-close]').onclick=()=>el.remove();
    el.querySelector('[data-local-share]').onclick=async()=>{
      try{
        if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({files:[file],title:file.name});
        else{const u=URL.createObjectURL(file),a=document.createElement('a');a.href=u;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}
      }catch(e){if(e?.name!=='AbortError'){console.error(e);toast('Nie udało się udostępnić ZIP-a.')}}
    };
  }

  async function exportCombined(recordId){
    if(busy)return;busy=true;
    try{const file=await makeCombinedZip(recordId);clearBuildProgress();shareDialog(file)}catch(e){console.error(e);clearBuildProgress();toast(e?.message||'Nie udało się utworzyć ZIP-a.')}finally{busy=false}
  }

  function ensureStyles(){
    if(document.getElementById('cfPhotoLocal1240Style'))return;
    const s=document.createElement('style');s.id='cfPhotoLocal1240Style';s.textContent=`
      .cf-photo-local{margin:8px 0 12px;padding:10px;border:1px solid #dfe5da;border-radius:12px;background:#fbfcf8}.cf-photo-local-head{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:900}.cf-photo-local-meta{font-size:9px;color:#626a63;margin-top:5px}.cf-photo-local-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}.cf-photo-local-thumb{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#ecefea}.cf-photo-local-thumb img{width:100%;height:100%;object-fit:cover}.cf-photo-local-thumb button{position:absolute;right:3px;top:3px;width:20px;height:20px;border:0;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:13px;line-height:20px;padding:0}.cf-photo-local-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.cf-photo-local-actions button{border:1px solid #ccd1c7;background:#fff;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:900}.cf-photo-local-actions .primary{background:#9fbd17;border-color:#9fbd17;color:#111}.cf-local-zip-ready{position:fixed;inset:0;z-index:300500;background:rgba(15,18,16,.48);display:flex;align-items:center;justify-content:center;padding:18px}.cf-local-zip-card{width:min(390px,100%);background:#fff;border-radius:20px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.3);color:#171a18}.cf-local-zip-card h3{margin:0 0 8px;font-size:20px}.cf-local-zip-card button{width:100%;border:0;border-radius:12px;padding:13px;font-weight:900;font-size:14px;margin-top:8px}.cf-local-zip-card [data-local-share]{background:#9fbd17;color:#111}.cf-local-zip-card [data-local-close]{background:#f0f2ef;color:#333}`;document.head.appendChild(s)
  }

  function ensureLocalBox(){
    const m=document.getElementById('cfPhotoOverlay');if(!m)return null;
    const anchor=m.querySelector('[data-photo-status]');if(!anchor)return null;
    let box=m.querySelector('.cf-photo-local');
    if(!box){box=document.createElement('div');box.className='cf-photo-local';box.innerHTML='<div class="cf-photo-local-head"><span>Zdjęcia lokalne</span><span data-local-counts></span></div><div class="cf-photo-local-meta" data-local-meta></div><div data-local-progress></div><div class="cf-photo-local-grid" data-local-grid></div><div class="cf-photo-local-actions"><button class="primary" data-local-export type="button">Pobierz ZIP PRZED + PO</button></div>';anchor.insertAdjacentElement('afterend',box);box.querySelector('[data-local-export]').onclick=()=>currentRecordId&&exportCombined(currentRecordId)}
    return box;
  }

  async function renderLocal(){
    const m=document.getElementById('cfPhotoOverlay');if(!m||!m.classList.contains('open')||!currentRecordId)return;
    const box=ensureLocalBox();if(!box)return;
    const allPhotos=await byRecord(currentRecordId),before=allPhotos.filter(x=>x.kind==='przed'),after=allPhotos.filter(x=>x.kind==='po'),kind=activeKind(),visible=kind==='po'?after:before;
    box.querySelector('[data-local-counts]').textContent=`PRZED ${before.length} · PO ${after.length}`;
    box.querySelector('[data-local-meta]').textContent=before.length&&after.length?'Komplet gotowy do jednego ZIP-a.':before.length?'Zdjęcia PRZED zapisane lokalnie. Po praniu dodaj zdjęcia PO.':'Zdjęcia są przechowywane tylko na tym urządzeniu.';
    const exp=box.querySelector('[data-local-export]');exp.style.display=before.length&&after.length?'':'none';
    const grid=box.querySelector('[data-local-grid]');grid.innerHTML='';
    const urls=[];
    for(const p of visible){
      const blob=new Blob([p.bytes],{type:p.mime||'image/jpeg'}),url=URL.createObjectURL(blob);urls.push(url);
      const cell=document.createElement('div');cell.className='cf-photo-local-thumb';cell.innerHTML=`<img alt=""><button type="button" aria-label="Usuń">×</button>`;cell.querySelector('img').src=url;cell.querySelector('button').onclick=async()=>{await del(p.id);renderLocal()};grid.appendChild(cell)
    }
    setTimeout(()=>urls.forEach(u=>URL.revokeObjectURL(u)),30000);
  }

  async function saveCurrent(){
    if(!currentRecordId||busy)return;
    const kind=activeKind();busy=true;
    const btn=document.querySelector('#cfPhotoOverlay [data-photo-save]');if(btn){btn.disabled=true;btn.textContent='Zapisywanie lokalnie…'}
    try{
      const n=await persistStaged(currentRecordId,kind);
      if(!n){toast('Brak nowych zdjęć do zapisania.');return}
      toast(`Zapisano lokalnie ${n} ${n===1?'zdjęcie':'zdjęć'} ${kind.toUpperCase()}.`);
      await renderLocal();
      const before=await byRecordKind(currentRecordId,'przed'),after=await byRecordKind(currentRecordId,'po');
      if(kind==='po'&&before.length&&after.length)await exportCombined(currentRecordId);
    }catch(e){console.error(e);toast(e?.message||'Nie udało się zapisać zdjęć lokalnie.')}finally{if(btn){btn.disabled=false;btn.textContent='Zapisz zdjęcia'}busy=false}
  }

  async function listAllStoragePaths(prefix=''){
    const out=[];let offset=0;
    while(true){
      const {data,error}=await cfSupabase.storage.from(BUCKET).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw error;
      const rows=data||[];if(!rows.length)break;
      for(const item of rows){
        const path=prefix?`${prefix}/${item.name}`:item.name;
        if(item.id)out.push(path);else out.push(...await listAllStoragePaths(path));
      }
      if(rows.length<100)break;offset+=rows.length;
    }
    return out;
  }
  async function cleanupServerPhotosOnce(){
    if(localStorage.getItem(CLEANUP_KEY)==='1')return;
    for(let i=0;i<80;i++){if(typeof cfSupabase!=='undefined'&&cfSupabase?.storage)break;await new Promise(r=>setTimeout(r,250))}
    if(typeof cfSupabase==='undefined'||!cfSupabase?.storage)return;
    try{
      const paths=await listAllStoragePaths('');
      for(let i=0;i<paths.length;i+=50){const batch=paths.slice(i,i+50);const {error}=await cfSupabase.storage.from(BUCKET).remove(batch);if(error)throw error}
      localStorage.setItem(CLEANUP_KEY,'1');
      console.info(`CleanFleet: usunięto ${paths.length} starych plików zdjęć z serwera.`);
    }catch(e){console.warn('CleanFleet cleanup zdjęć z serwera',e)}
  }

  function events(){
    document.addEventListener('click',e=>{
      const op=e.target.closest?.('[data-cf-photos]');if(op){currentRecordId=op.dataset.cfPhotos||null;setTimeout(()=>renderLocal().catch(()=>{}),180);return}
      const rm=e.target.closest?.('[data-photo-remove]');if(rm&&currentRecordId){removeStaged(currentRecordId,activeKind(),Number(rm.dataset.photoRemove));return}
      const tab=e.target.closest?.('#cfPhotoOverlay .cf-photo-tab');if(tab){setTimeout(()=>renderLocal().catch(()=>{}),80);return}
      const save=e.target.closest?.('[data-photo-save]');if(save&&currentRecordId){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saveCurrent()}
    },true);
    document.addEventListener('change',e=>{const input=e.target.closest?.('[data-photo-input]');if(!input||!currentRecordId)return;const files=[...(input.files||[])];if(files.length)stageFiles(currentRecordId,activeKind(),files)},true)
  }

  async function start(){
    ensureStyles();events();
    try{await navigator.storage?.persist?.()}catch(_){ }
    cleanupServerPhotosOnce();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();