/* Explicit publication of administrator's local photos to assigned workers. */
(()=>{
  'use strict';
  const DB='cleanfleet-photo-local-v1',STORE='photos',BUCKET='zdjecia';
  const admin=()=>window.cfCanEditRecordPhotos?.()===true;
  const client=()=>typeof cfSupabase!=='undefined'&&cfSupabase;
  let publishing=false;
  function localPhotos(ids){
    return new Promise((resolve,reject)=>{
      const open=indexedDB.open(DB,1);
      open.onupgradeneeded=()=>{const db=open.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result,tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
        const rows=[];
        for(const id of ids){
          const req=store.get(id);
          req.onsuccess=()=>{if(req.result)rows.push(req.result);};
        }
        tx.oncomplete=()=>{db.close();resolve(rows);};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  }
  async function hashPhoto(row){
    const blob=row.blob||new Blob([row.bytes],{type:row.mime||'image/jpeg'});
    const bytes=await blob.arrayBuffer();
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    return {blob,hash};
  }
  async function published(recordId,rows){
    if(!admin()||!client())throw new Error('Nie można sprawdzić zdjęć na serwerze.');
    if(!rows.length)return new Set();
    const {data,error}=await client().from('wash_record_photos').select('kind,content_hash').eq('wash_record_id',recordId);
    if(error)throw error;
    const remote=new Set((data||[]).map(x=>x.kind+':'+x.content_hash));
    const found=new Set();
    for(const row of rows){
      const {hash}=await hashPhoto(row);
      if(remote.has(row.kind+':'+hash))found.add(row.id);
    }
    return found;
  }
  async function publish(recordId,ids){
    if(!admin())throw new Error('Tylko administrator może wysyłać zdjęcia.');
    if(!client()||!navigator.onLine)throw new Error('Połącz się z internetem, aby wysłać zdjęcia.');
    if(publishing)throw new Error('Trwa już wysyłanie zdjęć.');
    const selected=[...new Set(ids)];
    if(!selected.length)return {sent:0,existing:0};
    publishing=true;
    let sent=0,existing=0;
    try{
      const rows=await localPhotos(selected);
      if(rows.length!==selected.length||rows.some(x=>String(x.recordId)!==String(recordId)||!['przed','po'].includes(x.kind)))
        throw new Error('Nie znaleziono wszystkich wybranych zdjęć w tym wpisie.');
      for(const row of rows){
        const {blob,hash}=await hashPhoto(row);
        const {data:matches,error:lookupError}=await client().from('wash_record_photos')
          .select('id').eq('wash_record_id',recordId).eq('kind',row.kind).eq('content_hash',hash).limit(1);
        if(lookupError)throw lookupError;
        if(matches?.length){existing++;continue;}
        const mime=String(row.mime||blob.type).toLowerCase();
        const ext=mime.includes('png')?'png':mime.includes('heic')?'heic':mime.includes('heif')?'heif':'jpg';
        const path='records/'+recordId+'/'+row.kind+'/'+hash+'.'+ext;
        const uploaded=await client().storage.from(BUCKET).upload(path,blob,{contentType:blob.type||'image/jpeg',upsert:false});
        if(uploaded.error&&!/already exists|duplicate|409/i.test(uploaded.error.message||''))throw uploaded.error;
        const saved=await client().from('wash_record_photos').insert({
          wash_record_id:recordId,kind:row.kind,storage_path:path,content_hash:hash
        });
        if(saved.error&&!/duplicate|23505/i.test(saved.error.message||saved.error.code||''))throw saved.error;
        sent++;
      }
      document.dispatchEvent(new CustomEvent('cf:photo-published',{detail:{recordId,sent}}));
      return {sent,existing};
    }finally{publishing=false;}
  }
  window.cfPhotoPublication={published,publish};
})();
