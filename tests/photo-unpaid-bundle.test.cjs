const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {response}=require('../app/photo-zip-stream.js'),Zip=require('../app/vendor/jszip-3.10.1.min.js');

function harness(records,rows){
  const stored=new Map(),cache=new Map();
  const context={window:{cfUnpaidPhotoRecords:()=>records},document:{readyState:'loading',addEventListener(){}},
    navigator:{serviceWorker:{controller:{}}},TextEncoder,Blob,Response,URL,console,crypto:require('node:crypto').webcrypto,
    sessionStorage:{setItem:(k,v)=>stored.set(k,v)},caches:{open:async()=>({put:async(k,v)=>cache.set(k,v),keys:async()=>[],delete:async()=>{}})}};
  context.window.caches=context.caches;
  const source=fs.readFileSync('app/photo-local-v1240.js','utf8').replace("  if(document.readyState==='loading')",
    "  window.test={prepareUnpaidZipDownload,recordArchive,setRows:r=>all=async()=>r};\n  if(document.readyState==='loading')");
  vm.runInNewContext(source,context);context.window.test.setRows(rows);
  return {api:context.window.test,cache,stored};
}
const record=(id,plate='ST123')=>({id,plate,type:'BUS',wash_date:'2026-10-21'});
const photo=(id,recordId,kind)=>({id,recordId,kind,name:'original.png',mime:'image/png',size:3,createdAt:Number(id)||0});

test('unpaid export skips missing photos and foreign/paid/filtered records, handles repeated plates, and preserves both inner folders',async()=>{
  const rows=[photo('1','r1','przed'),photo('2','r2','po'),photo('3','paid','po'),photo('4','other-company','przed')];
  const t=harness([record('r1'),record('r2'),record('empty')],rows),ready=await t.api.prepareUnpaidZipDownload();
  assert.equal(ready.recordCount,2);assert.equal(ready.recordId,null);
  const manifest=await t.cache.get(ready.url).json();assert.equal(manifest.format,'photo-zip-bundle-v1');
  assert.deepEqual(manifest.entries.map(e=>e.path),['BUS_ST123_21.10.2026.zip','BUS_ST123_21.10.2026_2.zip']);
  const reads=[],progress=[],original=new Uint8Array([3,2,1]);
  const outer=await Zip.loadAsync(await response(manifest,async id=>{reads.push(id);return {blob:new Blob([original]),mime:'image/png'}},(...p)=>progress.push(p)).arrayBuffer(),{checkCRC32:true});
  assert.deepEqual(reads,['1','2']);assert.deepEqual(progress,[[1,2],[2,2]]);
  for(const [i,e] of manifest.entries.entries()){
    const inner=await Zip.loadAsync(await outer.file(e.path).async('uint8array'),{checkCRC32:true});
    assert.ok(inner.files['21.10.2026/ST123/przed/'].dir);assert.ok(inner.files['21.10.2026/ST123/po/'].dir);
    assert.deepEqual(await inner.file(`21.10.2026/ST123/${i?'po':'przed'}/001.png`).async('uint8array'),original);
  }
  assert.ok(JSON.stringify(manifest).length<2000);
});

test('empty eligible list or no local photos leaves prior export untouched and reports the reason',async()=>{
  for(const [records,rows] of [[[],[photo('1','r1','po')]],[[record('r1')],[]]]){
    const t=harness(records,rows);
    await assert.rejects(()=>t.api.prepareUnpaidZipDownload(),/Brak lokalnych zdjęć/);
    assert.equal(t.cache.size,0);assert.equal(t.stored.size,0);
  }
});

test('cancelling outer stream does not fetch a later record; missing photo fails instead of producing an incomplete bundle',async()=>{
  const t=harness([record('r1'),record('r2')],[photo('1','r1','przed'),photo('2','r2','po')]);
  const ready=await t.api.prepareUnpaidZipDownload(),manifest=await t.cache.get(ready.url).json();let reads=0;
  const reader=response(manifest,async()=>{reads++;return {blob:new Blob([new Uint8Array(200000)]),mime:'image/png'}}).body.getReader();
  while(!reads)await reader.read();await reader.cancel();assert.equal(reads,1);
  await assert.rejects(()=>response(manifest,async()=>null).arrayBuffer(),/Brak zdjęcia/);
});

test('candidate provider enforces admin photo permission, unpaid status, current list filters, and mapped metadata',()=>{
  const html=fs.readFileSync('app/index.html','utf8'),source=html.match(/window\.cfUnpaidPhotoRecords = \(\) => \{[\s\S]*?\n  \};/)[0];
  const context={window:{cfCanUseRecordPhotos:()=>true},mainStatusFilter:'unpaid',mainPerformerFilter:'MICHAŁ',
    activeRecords:()=>[{id:'ok',tablica:'ST123',typ:'BUS',data_prania:'2026-10-21',kto_wykonal:'MICHAŁ'},
      {id:'paid',zaplacone:true,kto_wykonal:'MICHAŁ'},{id:'other-worker',kto_wykonal:'DAWID'},{id:'expired',kto_wykonal:'MICHAŁ'}],
    scheduleMatchesMainFilter:r=>r.id!=='expired'};
  vm.runInNewContext(source,context);
  let records=context.window.cfUnpaidPhotoRecords();assert.equal(records.length,1);assert.equal(records[0].id,'ok');assert.equal(records[0].plate,'ST123');assert.equal(records[0].wash_date,'2026-10-21');
  context.mainPerformerFilter='all';assert.equal(context.window.cfUnpaidPhotoRecords().length,2);
  context.mainStatusFilter='all';assert.equal(context.window.cfUnpaidPhotoRecords().length,0);
  context.mainStatusFilter='unpaid';context.window.cfCanUseRecordPhotos=()=>false;assert.equal(context.window.cfUnpaidPhotoRecords().length,0);
});
