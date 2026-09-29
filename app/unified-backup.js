// One portable package of server data and photos stored on this device.
// Restore stays disabled until the server can apply selected sections atomically.
(function(root){
  'use strict';
  const FORMAT='CleanFleet Unified Backup v1';
  function safePart(value){
    const text=String(value||'');
    if(!text||text==='.'||text==='..'||text.includes('/')||text.includes('\\')||text.includes('\0'))throw new Error('Niebezpieczna ścieżka w backupie.');
    return encodeURIComponent(text);
  }
  async function sha256(bytes){
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function localPhotos(){
    if(!('indexedDB' in root))return [];
    return new Promise((resolve,reject)=>{
      const open=indexedDB.open('cleanfleet-photo-local-v1',1);
      open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('photos'))open.result.createObjectStore('photos',{keyPath:'id'});};
      open.onerror=()=>reject(open.error||new Error('Nie udało się otworzyć lokalnych zdjęć.'));
      open.onsuccess=()=>{
        const db=open.result,photos=[];
        const tx=db.transaction('photos','readonly'),cursor=tx.objectStore('photos').openCursor();
        cursor.onsuccess=()=>{if(cursor.result){photos.push(cursor.result.value);cursor.result.continue();}};
        tx.oncomplete=()=>{db.close();resolve(photos);};
        tx.onerror=()=>{db.close();reject(tx.error||new Error('Nie udało się odczytać lokalnych zdjęć.'));};
      };
    });
  }
  async function fetchServerData(client){
    const {data,error}=await client.functions.invoke('cleanfleet-backup',{method:'GET'});
    if(error)throw new Error('Nie udało się pobrać danych serwera: '+error.message);
    if(data?.format!==FORMAT||!data.tables||!Array.isArray(data.users)||!Array.isArray(data.objects))
      throw new Error('Serwer zwrócił niekompletny backup.');
    return data;
  }
  async function fetchStorageFile(client,bucket,path){
    const {data:{session},error}=await client.auth.getSession();
    if(error||!session?.access_token)throw new Error('Sesja wygasła podczas pobierania plików.');
    const url=new URL(CF_SUPABASE_URL+'/functions/v1/cleanfleet-backup');
    url.searchParams.set('bucket',bucket);url.searchParams.set('file',path);
    const response=await fetch(url,{headers:{Authorization:'Bearer '+session.access_token,apikey:CF_SUPABASE_KEY}});
    if(!response.ok)throw new Error('Nie udało się pobrać zdjęcia z serwera: '+path);
    return response.arrayBuffer();
  }
  async function makeArchive(client,Zip=JSZip){
    const data=await fetchServerData(client),zip=new Zip();
    const manifest={format:FORMAT,createdAt:data.createdAt,project:data.project,createdBy:data.createdBy,
      counts:Object.fromEntries(Object.entries(data.tables).map(([table,rows])=>[table,rows.length])),
      authUsers:data.users.length,storageFiles:data.objects.length,localPhotos:0,entries:[],
      limitations:data.limitations||[]};
    const add=async(path,contents)=>{
      const bytes=contents instanceof ArrayBuffer?contents:await contents.arrayBuffer();
      zip.file(path,bytes);
      manifest.entries.push({path,bytes:bytes.byteLength,sha256:await sha256(bytes)});
    };
    await add('database.json',new Blob([JSON.stringify({tables:data.tables,users:data.users})],{type:'application/json'}));
    for(const file of data.objects){
      const path='storage/'+safePart(file.bucket_id)+'/'+String(file.name).split('/').map(safePart).join('/');
      await add(path,await fetchStorageFile(client,file.bucket_id,file.name));
    }
    const local=await localPhotos();
    for(const photo of local){
      const bytes=photo.blob||new Blob([photo.bytes],{type:photo.mime||'application/octet-stream'});
      const path='local-photos/'+safePart(photo.id);
      await add(path,bytes);
    }
    manifest.localPhotos=local.length;
    const localMetadata=local.map(({blob,bytes,thumbnail,...meta})=>meta);
    await add('local-photos.json',new Blob([JSON.stringify(localMetadata)],{type:'application/json'}));
    zip.file('manifest.json',JSON.stringify(manifest,null,2));
    const archive=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
    return {archive,manifest};
  }
  async function inspectArchive(file,Zip=JSZip){
    const zip=await Zip.loadAsync(file);
    const manifestFile=zip.file('manifest.json');
    if(!manifestFile)throw new Error('Nie ma manifestu backupu.');
    const manifest=JSON.parse(await manifestFile.async('string'));
    if(manifest.format!==FORMAT||!Array.isArray(manifest.entries))throw new Error('Nieobsługiwany format backupu.');
    const paths=new Set();
    for(const entry of manifest.entries){
      if(!entry.path||paths.has(entry.path)||entry.path.includes('..')||entry.path.startsWith('/'))throw new Error('Nieprawidłowa lista plików w backupie.');
      paths.add(entry.path);
      const target=zip.file(entry.path);
      if(!target)throw new Error('Brak pliku w backupie: '+entry.path);
      const bytes=await target.async('arraybuffer');
      if(bytes.byteLength!==entry.bytes||(await sha256(bytes))!==entry.sha256)throw new Error('Uszkodzony plik w backupie: '+entry.path);
    }
    const data=JSON.parse(await zip.file('database.json').async('string'));
    for(const [table,count] of Object.entries(manifest.counts)){
      if(!Array.isArray(data.tables?.[table])||data.tables[table].length!==count)throw new Error('Niekompletna tabela: '+table);
    }
    return {manifest,data,zip};
  }
  root.CFUnifiedBackup={makeArchive,inspectArchive,fetchServerData};
})(window);
