/* Share administrator camera photos with assigned workers without granting upload rights. */
(()=>{
  'use strict';
  const DB='cleanfleet-photo-local-v1',STORE='photos',BUCKET='zdjecia';
  let running=false,timer=null,retry=false;
  const admin=()=>window.cfCanEditRecordPhotos?.()===true;
  const client=()=>typeof cfSupabase!=='undefined'&&cfSupabase;
  function localPhotos(){
    return new Promise((resolve,reject)=>{
      const open=indexedDB.open(DB,1);
      open.onupgradeneeded=()=>{const db=open.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result,tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
        req.onsuccess=()=>resolve(req.result||[]);
        req.onerror=()=>reject(req.error);
        tx.oncomplete=()=>db.close();
      };
    });
  }
  async function sync(){
    if(running){retry=true;return;}
    if(!admin()||!client()||!navigator.onLine)return;
    running=true;
    try{
      const rows=await localPhotos();
      for(const row of rows){
        if(!admin()||!navigator.onLine)break;
        if(!row.recordId||!['przed','po'].includes(row.kind))continue;
        const blob=row.blob||new Blob([row.bytes],{type:row.mime||'image/jpeg'});
        const bytes=await blob.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
        const {data:existing,error:lookupError}=await client().from('wash_record_photos')
          .select('id').eq('wash_record_id',row.recordId).eq('kind',row.kind).eq('content_hash',hash).limit(1);
        if(lookupError)throw lookupError;
        if(existing?.length)continue;
        const mime=String(row.mime||blob.type).toLowerCase();
        const ext=mime.includes('png')?'png':mime.includes('heic')?'heic':mime.includes('heif')?'heif':'jpg';
        const path=`records/${row.recordId}/${row.kind}/${hash}.${ext}`;
        const uploaded=await client().storage.from(BUCKET).upload(path,blob,{contentType:blob.type||'image/jpeg',upsert:false});
        if(uploaded.error&&!/already exists|duplicate|409/i.test(uploaded.error.message||''))throw uploaded.error;
        const saved=await client().from('wash_record_photos').insert({
          wash_record_id:row.recordId,kind:row.kind,storage_path:path,content_hash:hash
        });
        if(saved.error&&!/duplicate|23505/i.test(saved.error.message||saved.error.code||''))throw saved.error;
      }
    }catch(error){
      console.warn('CleanFleet photo sync:',error);
      document.dispatchEvent(new CustomEvent('cf:photo-sync-error',{detail:{message:error.message||String(error)}}));
      retry=true;
    }finally{
      running=false;
      if(retry){retry=false;schedule(30000);}
    }
  }
  function schedule(delay=500){clearTimeout(timer);timer=setTimeout(sync,delay);}
  document.addEventListener('cf:photos-saved',()=>schedule());
  document.addEventListener('cf:photos-open',()=>schedule());
  window.addEventListener('online',()=>schedule());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(1500);});
  setInterval(()=>{if(admin())schedule()},60000);
  schedule(3500);
})();
