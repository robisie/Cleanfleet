const test=require('node:test'),assert=require('node:assert/strict');
const {response}=require('../app/photo-zip-stream.js');
const Zip=require('../app/vendor/jszip-3.10.1.min.js');
const manifest=entries=>({name:'ZESTAW_TEST_09.10.2026.zip',createdAt:Date.now(),entries});
test('streamed ZIP opens with folders, Unicode names, correct CRCs and exact original photo bytes',async()=>{
 const bytes=new Uint8Array([1,2,3,4,255,0,8]),entries=[{path:'09.10.2026/TEST/przed/'},{path:'09.10.2026/TEST/po/'},{id:'1',path:'09.10.2026/TEST/przed/001.png'},{id:'2',path:'09.10.2026/TEST/po/żółty.png'}];
 let reads=0;const result=response(manifest(entries),async()=>{reads++;return {blob:new Blob([bytes],{type:'image/png'}),mime:'image/png'}});
 assert.equal(reads,0);assert.match(result.headers.get('content-disposition'),/^attachment;/);
 const zip=await Zip.loadAsync(await result.arrayBuffer(),{checkCRC32:true});assert.equal(reads,2);
 assert.ok(zip.files[entries[0].path].dir);assert.ok(zip.files[entries[1].path].dir);
 for(const x of entries.filter(x=>x.id))assert.deepEqual(await zip.file(x.path).async('uint8array'),bytes);
});
test('81 photos are pulled lazily with bounded chunks; no complete archive is retained',async()=>{
 const blob=new Blob([new Uint8Array(1024*1024)]),entries=Array.from({length:81},(_,i)=>({id:String(i),path:`przed/${i}.png`}));let reads=0;
 const reader=response(manifest(entries),async()=>{reads++;return {blob,mime:'image/png'}}).body.getReader();
 assert.equal(reads,0);let n=0,max=0,total=0;
 while(true){const {done,value}=await reader.read();if(done)break;n++;max=Math.max(max,value.length);total+=value.length;if(n===1)assert.equal(reads,1)}
 assert.equal(reads,81);assert.ok(max<=65536);assert.ok(total>81*1024*1024);
});
test('cancel stops before loading any later photo and missing original fails the download',async()=>{
 let reads=0;const entries=[{id:'1',path:'przed/1.png'},{id:'2',path:'po/1.png'}];
 const reader=response(manifest(entries),async()=>{reads++;return {blob:new Blob(['photo']),mime:'image/png'}}).body.getReader();
 await reader.read();await reader.cancel();assert.equal(reads,1);
 const missing=response(manifest(entries),async()=>null);await assert.rejects(()=>missing.arrayBuffer(),/Brak zdjęcia/);
});
