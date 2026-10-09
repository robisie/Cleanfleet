const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {File}=require('node:buffer');
const Zip=require('../app/vendor/jszip-3.10.1.min.js');
const origin='https://cleanfleet.pl';
function cacheHarness(){
 const entries=new Map();return {entries,cache:{put:async(url,res)=>entries.set(url,res.clone()),match:async url=>entries.get(typeof url==='string'?url:new URL(url.url).pathname)?.clone(),keys:async()=>[...entries.keys()].map(url=>({url:origin+url})),delete:async key=>entries.delete(typeof key==='string'?key:new URL(key.url).pathname)}};
}
function localHarness(){
 const c=cacheHarness(),storage=new Map();
 const context={window:{},document:{addEventListener(){},readyState:'loading'},navigator:{serviceWorker:{controller:{}},userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5},TextEncoder,Blob,File,Response,URL,DOMException,AbortController,setTimeout:()=>0,crypto:require('node:crypto').webcrypto,console,caches:{open:async()=>c.cache},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)}};
 context.window.caches=context.caches;
 let source=fs.readFileSync('app/photo-local-v1240.js','utf8').replace("  if(document.readyState==='loading')",'  window.harness={prepareZipDownload,prepareZipFile,readPreparedZip,shareDialog,isAppleMobile,setBuild:fn=>prepareZipFile=fn,setSources:(rows,meta)=>{byRecord=async()=>rows;metadata=async()=>meta}};\n  if(document.readyState===\'loading\')');
 vm.runInNewContext(source,context);return {context,c,storage,h:context.window.harness};
}
test('camera controls remain portrait for both landscape directions; preview is counter-rotated independently',async()=>{
 const video={style:{},videoWidth:4096,videoHeight:3072},stage={clientWidth:390,clientHeight:600},overlay={style:{},classList:{contains:()=>true},querySelector:s=>s==='.cf-cam-video'?video:stage};
 let canvas,drawn,capturedSize;
 const context={window:{visualViewport:{width:844,height:390,offsetTop:0,offsetLeft:0},screen:{orientation:{angle:90}}},document:{addEventListener(){},createElement(){canvas={getContext:()=>({drawImage:(...args)=>drawn=args}),toBlob:cb=>{capturedSize=[canvas.width,canvas.height];cb(new Blob(['jpeg'],{type:'image/jpeg'}))}};return canvas;}},console,setTimeout,clearTimeout,Blob};
 let source=fs.readFileSync('app/photo-camera-v1213.js','utf8').replace("  document.addEventListener('click'", "  window.harness={applyCameraPortraitFallback,captureVideoFrameFallback,setOverlay:o=>overlay=o};\n  document.addEventListener('click'");
 vm.runInNewContext(source,context);const h=context.window.harness;h.setOverlay(overlay);h.applyCameraPortraitFallback();
 assert.equal(overlay.style.width,'390px');assert.equal(overlay.style.height,'844px');assert.match(overlay.style.transform,/rotate\(-90deg\)/);assert.equal(video.style.transform,'rotate(90deg)');assert.equal(video.style.width,'600px');
 await h.captureVideoFrameFallback();assert.deepEqual(capturedSize,[4096,3072]);assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.deepEqual(drawn.slice(1),[0,0,4096,3072]);
 context.window.screen.orientation.angle=270;h.applyCameraPortraitFallback();assert.match(overlay.style.transform,/rotate\(90deg\)/);assert.equal(video.style.transform,'rotate(-90deg)');
 context.window.visualViewport.width=390;context.window.visualViewport.height=844;h.applyCameraPortraitFallback();assert.equal(overlay.style.transform,'');assert.equal(video.style.transform,'');
});
test('download route streams a persisted manifest and keeps legacy ready ZIPs readable',async()=>{
 const {c,context}=localHarness();const manifest={format:'photo-zip-stream-v1',name:'test.zip',createdAt:Date.now(),entries:[]};
 await c.cache.put('/app/photo-download/id/test.zip',new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
 const handlers={},self={location:{origin},addEventListener:(name,fn)=>handlers[name]=fn,CFPhotoZipStream:{response:m=>new Response(JSON.stringify(m),{headers:{'Content-Disposition':'attachment; filename="test.zip"'}})}};
 vm.runInNewContext(fs.readFileSync('app/sw.js','utf8'),{self,importScripts(){},caches:context.caches,URL,Response,Headers});
 let result;handlers.fetch({request:{url:origin+'/app/photo-download/id/test.zip',mode:'navigate'},respondWith:r=>result=r});const response=await result;
 assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal((await response.json()).entries.length,0);
 handlers.fetch({request:{url:origin+'/app/photo-download/missing/test.zip',mode:'navigate'},respondWith:r=>result=r});assert.equal((await result).status,404);
});
test('ZIP dialog displays byte progress, remains closeable and opens ready file separately without native sharing',async()=>{
 const {h,context}=localHarness(),nodes=new Map();let release,abortSignal;
 const el={querySelector:s=>{if(!nodes.has(s))nodes.set(s,{style:{},click(){this.onclick?.()}});return nodes.get(s)},remove(){this.removed=true}};
 context.document.querySelector=()=>null;context.document.createElement=()=>el;context.document.body={appendChild(){}};context.navigator.share=()=>{throw Error('must not share large ZIP on iOS')};
 h.setBuild(async(ready,update,signal)=>{abortSignal=signal;update(50,100,false);return await new Promise(resolve=>release=resolve)});
 h.shareDialog({name:'test.zip',size:100},'record',{url:'/app/photo-download/id/test.zip',size:100});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.get('[data-zip-progress]').value,50);assert.match(nodes.get('[data-zip-status]').textContent,/Trwa tworzenie/);assert.equal(nodes.get('[data-local-close]').textContent,'Anuluj');assert.equal(nodes.get('[data-local-download]').hidden,true);
 release(new File(['zip'],'test.zip',{type:'application/zip'}));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.get('[data-zip-progress]').value,100);assert.equal(nodes.get('[data-local-download]').target,'_blank');assert.match(nodes.get('[data-local-download]').href,/^blob:/);assert.equal(nodes.get('[data-local-close]').textContent,'Zamknij');
 nodes.get('[data-local-download]').onclick();assert.equal(el.removed,undefined);assert.equal(nodes.get('[data-local-cleaned]').hidden,false);
 nodes.get('[data-local-close]').onclick();assert.equal(el.removed,true);assert.equal(abortSignal.aborted,false);
});

test('preparing 81-photo download persists metadata only and replaces the prior manifest',async()=>{
 const {h,c,storage}=localHarness();
 h.setSources(Array.from({length:81},(_,i)=>({id:String(i),kind:i<36?'przed':'po',name:'photo.jpg',mime:'image/jpeg',size:4*1024*1024})),{date:'09.10.2026',plate:'DTV571',type:'SOLOWKA'});
 const ready=await h.prepareZipDownload('record');const stored=await c.cache.match(ready.url),text=await stored.text(),manifest=JSON.parse(text);
 assert.equal(manifest.entries.length,83);assert.equal(manifest.format,'photo-zip-stream-v1');assert.ok(text.length<12000);assert.equal(ready.size,81*4*1024*1024);assert.equal(ready.streaming,true);
 assert.equal(JSON.parse(storage.get('cf-photo-zip-ready')).url,ready.url);
 await h.prepareZipDownload('record');assert.equal(c.entries.size,1);assert.ok(!c.entries.has(ready.url));
});
