(()=>{
  'use strict';

  let currentRecordId=null;
  let busy=false;
  let readyFile=null;
  let readyKey=null;
  const staged=new Map();
  const enc=new TextEncoder();

  const keyFor=(recordId,kind)=>`${recordId}|${kind}`;
  const activeKind=()=>document.querySelector('#cfPhotoOverlay .cf-photo-tab.active')?.dataset.photoKind||'przed';
  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const safeToken=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'INNE';
  const pad=n=>String(n).padStart(2,'0');
  const fmtDate=s=>{const d=s?new Date(`${s}T12:00:00`):new Date();return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`};
  const extFor=f=>{const n=String(f?.name||'').toLowerCase();const m=n.match(/\.([a-z0-9]{2,5})$/);if(m)return m[1]==='jpeg'?'jpg':m[1];const t=String(f?.type||'').toLowerCase();if(t.includes('png'))return'png';if(t.includes('heic'))return'heic';if(t.includes('heif'))return'heif';return'jpg'};
  const typeToken=v=>{const s=String(v||'').trim().toUpperCase();if(s==='SOLÓWKA'||s==='SOLOWKA')return'SOLOWKA';if(s==='ZESTAW')return'ZESTAW';if(s==='BUS'||s==='BUS C')return'AUTOKAR';if(s==='OSOBOWY')return'OSOBOWY';return safeToken(s||'INNE')};

  function stageFiles(recordId,kind,files){const k=keyFor(recordId,kind),a=staged.get(k)||[];for(const f of files)a.push(f);staged.set(k,a)}
  function removeStaged(recordId,kind,index){const k=keyFor(recordId,kind),a=staged.get(k)||[];if(index>=0&&index<a.length)a.splice(index,1);staged.set(k,a)}

  function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++){c^=bytes[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
  function u16(v){const a=new Uint8Array(2),d=new DataView(a.buffer);d.setUint16(0,v,true);return a}
  function u32(v){const a=new Uint8Array(4),d=new DataView(a.buffer);d.setUint32(0,v>>>0,true);return a}
  function dosDateTime(date=new Date()){const time=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);const year=Math.max(1980,date.getFullYear());const d=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();return{time,date:d}}

  function ensureStatus(){const m=document.getElementById('cfPhotoOverlay');if(!m)return null;const anchor=m.querySelector('[data-photo-status]');if(!anchor)return null;let box=m.querySelector('.cf-photo-export-status');if(!box){box=document.createElement('div');box.className='cf-photo-export-status';box.innerHTML='<div class="cf-photo-export-head"><strong data-exp-title>Przygotowanie paczki</strong><span data-exp-count></span></div><div class="cf-photo-export-meta" data-exp-meta></div><div class="cf-photo-export-track"><div class="cf-photo-export-bar" data-exp-bar></div></div>';anchor.insertAdjacentElement('afterend',box)}box.style.display='block';return box}
  function progress(done,total,msg){const b=ensureStatus();if(!b)return;const pct=total?Math.round(done/total*100):0;b.querySelector('[data-exp-title]').textContent='Tworzenie paczki ZIP…';b.querySelector('[data-exp-count]').textContent=`${done} z ${total}`;b.querySelector('[data-exp-meta]').textContent=msg||'Przetwarzanie zdjęć lokalnie — nic nie jest wysyłane na serwer.';b.querySelector('[data-exp-bar]').style.width=`${pct}%`}
  function hideStatus(){document.querySelector('#cfPhotoOverlay .cf-photo-export-status')?.remove()}

  async function metadata(recordId){if(typeof cfSupabase==='undefined')throw new Error('Brak dostępu do danych wpisu.');const{data,error}=await cfSupabase.from('wash_records').select('plate,type,order_date,order_due_date,wash_date,schedule_proposed_date').eq('id',recordId).single();if(error)throw error;const date=data.wash_date||data.order_due_date||data.schedule_proposed_date||data.order_date||new Date().toISOString().slice(0,10);return{plate:safeToken(data.plate||'BEZ-TABLICY'),type:typeToken(data.type),date:fmtDate(date)}}

  async function makeZip(files,kind){
    const locals=[],centrals=[];let offset=0;const dt=dosDateTime();
    for(let i=0;i<files.length;i++){
      const file=files[i];progress(i,files.length,`Przygotowanie zdjęcia ${i+1} z ${files.length}`);
      const bytes=new Uint8Array(await file.arrayBuffer());const name=`${kind}/${String(i+1).padStart(3,'0')}.${extFor(file)}`;const nameBytes=enc.encode(name),crc=crc32(bytes),size=bytes.byteLength;
      const local=new Blob([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(size),u32(size),u16(nameBytes.length),u16(0),nameBytes,bytes]);locals.push(local);
      const central=new Blob([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(size),u32(size),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes]);centrals.push(central);offset+=local.size;
      progress(i+1,files.length,`Gotowe ${i+1} z ${files.length}`);await new Promise(r=>setTimeout(r,0));
    }
    const centralOffset=offset,centralSize=centrals.reduce((s,b)=>s+b.size,0);const end=new Blob([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(centralOffset),u16(0)]);return new Blob([...locals,...centrals,end],{type:'application/zip'})
  }

  function ensureStyles(){if(document.getElementById('cfPhotoExport1230Style'))return;const s=document.createElement('style');s.id='cfPhotoExport1230Style';s.textContent=`.cf-photo-export-status{margin:8px 0 12px;padding:10px;border:1px solid #e1e5db;border-radius:10px;background:#fafbf7}.cf-photo-export-head{display:flex;justify-content:space-between;gap:10px;font-size:11px}.cf-photo-export-meta{font-size:9px;color:#687068;margin-top:5px}.cf-photo-export-track{height:9px;border-radius:999px;background:#e4e7df;overflow:hidden;margin-top:8px}.cf-photo-export-bar{height:100%;background:#9fbd17;width:0;transition:width .15s}.cf-zip-ready{position:fixed;inset:0;z-index:300500;background:rgba(15,18,16,.48);display:flex;align-items:center;justify-content:center;padding:18px}.cf-zip-card{width:min(390px,100%);background:#fff;border-radius:20px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.3);color:#171a18}.cf-zip-card h3{margin:0 0 8px;font-size:20px}.cf-zip-file{font-size:12px;font-weight:800;word-break:break-word;margin:8px 0 4px}.cf-zip-size{font-size:10px;color:#737b75;margin-bottom:16px}.cf-zip-actions{display:grid;gap:8px}.cf-zip-actions button{border:0;border-radius:12px;padding:13px;font-weight:900;font-size:14px}.cf-zip-share{background:#9fbd17;color:#111}.cf-zip-cancel{background:#f0f2ef;color:#333}`;document.head.appendChild(s)}

  function markShared(){if(readyKey)staged.delete(readyKey);readyKey=null;readyFile=null;document.querySelector('.cf-zip-ready')?.remove();toast('Paczka przekazana do zapisu.')}
  function readyDialog(file,key){
    document.querySelector('.cf-zip-ready')?.remove();readyFile=file;readyKey=key;
    const el=document.createElement('div');el.className='cf-zip-ready';el.innerHTML=`<div class="cf-zip-card"><h3>Paczka gotowa</h3><div class="cf-zip-file">${file.name}</div><div class="cf-zip-size">${(file.size/1024/1024).toFixed(1)} MB · plik utworzony lokalnie na iPhonie</div><div class="cf-zip-actions"><button type="button" class="cf-zip-share">Udostępnij / zapisz do iCloud</button><button type="button" class="cf-zip-cancel">Zamknij</button></div></div>`;document.body.appendChild(el);
    el.querySelector('.cf-zip-cancel').onclick=()=>el.remove();
    el.querySelector('.cf-zip-share').onclick=async()=>{
      try{
        if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[readyFile]}))){await navigator.share({files:[readyFile],title:readyFile.name});markShared()}
        else{const u=URL.createObjectURL(readyFile),a=document.createElement('a');a.href=u;a.download=readyFile.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);markShared()}
      }catch(e){if(e?.name!=='AbortError'){console.error(e);toast('Nie udało się otworzyć udostępniania.')}}
    };
  }

  async function exportCurrent(){
    if(busy||!currentRecordId)return;const kind=activeKind(),k=keyFor(currentRecordId,kind),files=[...(staged.get(k)||[])];if(!files.length){toast('Brak nowych zdjęć do zapisania.');return}
    busy=true;const btn=document.querySelector('#cfPhotoOverlay [data-photo-save]');if(btn){btn.disabled=true;btn.textContent='Tworzenie ZIP…'}
    try{const meta=await metadata(currentRecordId);progress(0,files.length,'Przygotowanie paczki lokalnej…');const blob=await makeZip(files,kind);const filename=`${meta.type}_${meta.plate}_${meta.date}_${kind.toUpperCase()}.zip`;const file=new File([blob],filename,{type:'application/zip',lastModified:Date.now()});hideStatus();readyDialog(file,k);if(btn){btn.textContent='Zapisz zdjęcia';btn.disabled=false}}
    catch(e){console.error('CleanFleet ZIP export',e);hideStatus();toast(e?.message||'Nie udało się utworzyć paczki ZIP.');if(btn){btn.textContent='Zapisz zdjęcia';btn.disabled=false}}
    finally{busy=false}
  }

  function events(){
    document.addEventListener('click',e=>{const open=e.target.closest?.('[data-cf-photos]');if(open){currentRecordId=open.dataset.cfPhotos||null;return}const rm=e.target.closest?.('[data-photo-remove]');if(rm&&currentRecordId){removeStaged(currentRecordId,activeKind(),Number(rm.dataset.photoRemove));return}const save=e.target.closest?.('[data-photo-save]');if(save&&currentRecordId){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();exportCurrent()}},true);
    document.addEventListener('change',e=>{const input=e.target.closest?.('[data-photo-input]');if(!input||!currentRecordId)return;const files=[...(input.files||[])];if(files.length)stageFiles(currentRecordId,activeKind(),files)},true);
  }

  ensureStyles();events();
})();