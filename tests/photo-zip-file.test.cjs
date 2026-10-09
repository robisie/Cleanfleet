const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {File}=require('node:buffer'),Zip=require('../app/vendor/jszip-3.10.1.min.js'),stream=require('../app/photo-zip-stream.js');
function harness(){
 const stored=new Map(),files=new Map();let writes=0,aborts=0,readCalls=0,maxChunk=0;
 const dir={getFileHandle:async name=>({createWritable:async()=>{const parts=[];return {write:async data=>{writes++;maxChunk=Math.max(maxChunk,data.length);parts.push(data.slice())},close:async()=>files.set(name,new File(parts,name)),abort:async()=>{aborts++}}},getFile:async()=>{if(!files.has(name))throw Error('missing');return files.get(name)}}),removeEntry:async name=>files.delete(name),async *entries(){yield*files.entries()}};
 const context={window:{},document:{addEventListener(){},readyState:'loading'},navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},Blob,File,TextEncoder,Response,AbortController,DOMException,crypto:require('node:crypto').webcrypto,console,sessionStorage:{setItem:(k,v)=>stored.set(k,v)},fetch:async()=>{const res=stream.response({name:'SOLOWKA_DTV571.zip',createdAt:Date.now(),entries:[{id:'1',path:'przed/001.png'},{id:'2',path:'po/001.png'}]},async()=>{readCalls++;return {blob:new Blob([new Uint8Array(100000)]),mime:'image/png'}});return res;}};
 const source=fs.readFileSync('app/photo-local-v1240.js','utf8').replace("  if(document.readyState==='loading')",'  window.test={prepareZipFile,readPreparedZip};\n  if(document.readyState===\'loading\')');vm.runInNewContext(source,context);
 return {context,h:context.window.test,files,stored,stats:()=>({writes,aborts,readCalls,maxChunk})};
}
test('ZIP is written incrementally to device file, reports real progress, and recovers without rebuilding',async()=>{
 const t=harness(),updates=[],ready={name:'SOLOWKA_DTV571.zip',url:'/download',size:200000,recordId:'record'};
 const file=await t.h.prepareZipFile(ready,(...args)=>updates.push(args),new AbortController().signal);
 assert.equal(file.name,ready.name);assert.equal(file.type,'application/zip');assert.ok(file.size>200000);assert.equal(t.stats().readCalls,2);assert.ok(t.stats().maxChunk<=65536);assert.ok(updates.some(x=>x[0]>0&&!x[2]));assert.equal(updates.at(-1)[2],true);
 const zip=await Zip.loadAsync(await file.arrayBuffer(),{checkCRC32:true});assert.equal((await zip.file('po/001.png').async('uint8array')).length,100000);
 const restored=await t.h.readPreparedZip(ready);assert.equal(restored.size,file.size);assert.equal(t.stats().readCalls,2);assert.equal(t.files.size,1);
});
test('cancel aborts partial disk write, removes temporary file and never announces completion',async()=>{
 const t=harness(),controller=new AbortController(),updates=[],ready={name:'test.zip',url:'/download',size:200000};
 await assert.rejects(()=>t.h.prepareZipFile(ready,(...args)=>{updates.push(args);controller.abort()},controller.signal),{name:'AbortError'});
 assert.equal(t.stats().aborts,1);assert.equal(t.files.size,0);assert.ok(!updates.some(x=>x[2]));assert.equal(t.stored.size,0);
});
test('storage failure leaves originals untouched and aborts temporary writer',async()=>{
 const t=harness();t.context.fetch=async()=>{throw new DOMException('Disk full','QuotaExceededError')};
 await assert.rejects(()=>t.h.prepareZipFile({name:'test.zip',url:'/download',size:100},()=>{},new AbortController().signal),{name:'QuotaExceededError'});
 assert.equal(t.stats().aborts,1);assert.equal(t.files.size,0);assert.equal(t.stats().readCalls,0);
});
