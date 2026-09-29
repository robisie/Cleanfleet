// One portable package of application data. Temporary photos are excluded.
(function(root){
  'use strict';
  const FORMAT='CleanFleet Unified Backup v2';
  async function sha256(bytes){
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function fetchServerData(client){
    const {data,error}=await client.functions.invoke('cleanfleet-backup',{method:'GET'});
    if(error)throw new Error('Nie udało się pobrać danych serwera: '+error.message);
    if(data?.format!==FORMAT||!data.tables||!Array.isArray(data.users))
      throw new Error('Serwer zwrócił niekompletny backup.');
    return data;
  }
  async function makeArchive(client,Zip=JSZip){
    const data=await fetchServerData(client),zip=new Zip();
    const manifest={format:FORMAT,createdAt:data.createdAt,project:data.project,createdBy:data.createdBy,
      counts:Object.fromEntries(Object.entries(data.tables).map(([table,rows])=>[table,rows.length])),
      authUsers:data.users.length,storageFiles:0,localPhotos:0,entries:[],
      limitations:data.limitations||[]};
    const add=async(path,contents)=>{
      const bytes=contents instanceof ArrayBuffer?contents:await contents.arrayBuffer();
      zip.file(path,bytes);
      manifest.entries.push({path,bytes:bytes.byteLength,sha256:await sha256(bytes)});
    };
    await add('database.json',new Blob([JSON.stringify({tables:data.tables,users:data.users,objects:[]})],{type:'application/json'}));
    zip.file('manifest.json',JSON.stringify(manifest,null,2));
    const archive=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
    return {archive,manifest};
  }
  async function inspectArchive(file,Zip=JSZip){
    const zip=await Zip.loadAsync(file);
    const manifestFile=zip.file('manifest.json');
    if(!manifestFile)throw new Error('Nie ma manifestu backupu.');
    const manifest=JSON.parse(await manifestFile.async('string'));
    if(manifest.format!==FORMAT||!Array.isArray(manifest.entries)||!manifest.counts||!manifest.project)
      throw new Error('Nieobsługiwany format backupu.');
    const paths=new Set();
    for(const entry of manifest.entries){
      if(!entry.path||paths.has(entry.path)||entry.path.includes('..')||entry.path.startsWith('/'))throw new Error('Nieprawidłowa lista plików w backupie.');
      paths.add(entry.path);
      const target=zip.file(entry.path);
      if(!target)throw new Error('Brak pliku w backupie: '+entry.path);
      const bytes=await target.async('arraybuffer');
      if(bytes.byteLength!==entry.bytes||(await sha256(bytes))!==entry.sha256)throw new Error('Uszkodzony plik w backupie: '+entry.path);
    }
    const database=zip.file('database.json');
    if(!database||!paths.has('database.json'))throw new Error('Brak danych bazy w backupie.');
    const data=JSON.parse(await database.async('string'));
    if(!Array.isArray(data.objects)||data.objects.length!==0||manifest.storageFiles!==0||manifest.localPhotos!==0||
       (data.tables?.wash_record_photos||[]).length)
      throw new Error('Ten backup zawiera zdjęcia, których przywracanie jest wyłączone.');
    for(const [table,count] of Object.entries(manifest.counts)){
      if(!Array.isArray(data.tables?.[table])||data.tables[table].length!==count)throw new Error('Niekompletna tabela: '+table);
    }
    return {manifest,data,zip};
  }
  root.CFUnifiedBackup={makeArchive,inspectArchive,fetchServerData};
})(window);
