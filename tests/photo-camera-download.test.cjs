const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {File}=require('node:buffer');
const Zip=require('../app/vendor/jszip-3.10.1.min.js');
const origin='https://cleanfleet.pl';
function cacheHarness(){
 const entries=new Map();return {entries,cache:{put:async(url,res)=>entries.set(url,res.clone()),match:async url=>entries.get(typeof url==='string'?url:new URL(url.url).pathname)?.clone(),keys:async()=>[...entries.keys()].map(url=>({url:origin+url})),delete:async key=>entries.delete(typeof key==='string'?key:new URL(key.url).pathname)}};
}
function localHarness(){
 const c=cacheHarness(),storage=new Map();
 const context={window:{},document:{addEventListener(){},readyState:'loading'},navigator:{serviceWorker:{controller:{}},userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5},TextEncoder,Blob,File,Response,URL,crypto:require('node:crypto').webcrypto,console,caches:{open:async()=>c.cache},sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)}};
 context.window.caches=context.caches;
 let source=fs.readFileSync('app/photo-local-v1240.js','utf8').replace("  if(document.readyState==='loading')",'  window.harness={retainZip,shareDialog,isAppleMobile,makeCombinedZip};\n  if(document.readyState===\'loading\')');
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
test('ready ZIP survives a new runtime and keeps exact image bytes; only previous ZIP is replaced',async()=>{
 const {h,c,storage,context}=localHarness();const zip=new Zip();zip.file('01.10.2026/TEST/przed/001.jpg',Buffer.from([255,216,0,255,217]));zip.folder('01.10.2026/TEST/po');
 const file=new File([await zip.generateAsync({type:'uint8array'})],'BUS_TEST_01.10.2026.zip',{type:'application/zip'});const ready=await h.retainZip(file,'record');
 const handlers={};vm.runInNewContext(fs.readFileSync('app/sw.js','utf8'),{self:{location:{origin},addEventListener:(name,fn)=>handlers[name]=fn},caches:context.caches,URL,Response,Headers});
 let result;handlers.fetch({request:{url:origin+ready.url,mode:'navigate'},respondWith:r=>result=r});const response=await result;
 assert.equal(response.headers.get('content-type'),'application/zip');assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal(response.headers.get('cache-control'),'no-store');
 const restored=await Zip.loadAsync(await response.arrayBuffer());assert.deepEqual(await restored.file('01.10.2026/TEST/przed/001.jpg').async('uint8array'),new Uint8Array([255,216,0,255,217]));assert.equal(JSON.parse(storage.get('cf-photo-zip-ready')).recordId,'record');
 await h.retainZip(file,'second');assert.equal(c.entries.size,1);assert.ok(!c.entries.has(ready.url));
 handlers.fetch({request:{url:origin+ready.url,mode:'navigate'},respondWith:r=>result=r});assert.equal((await result).status,404);
});
test('iPhone ZIP dialog offers an attachment download, never invokes native share or automatic deletion',()=>{
 const {h,context}=localHarness(),nodes=new Map();
 const el={querySelector:s=>{if(!nodes.has(s))nodes.set(s,{style:{},click(){this.onclick?.()}});return nodes.get(s)},remove(){this.removed=true}};
 context.document.querySelector=()=>null;context.document.createElement=()=>el;context.document.body={appendChild(){}};context.navigator.share=()=>{throw Error('must not share on iOS')};
 h.shareDialog({name:'test.zip',size:100},'record',{url:'/app/photo-download/id/test.zip'});
 assert.equal(nodes.get('[data-local-share]').hidden,true);assert.equal(nodes.get('[data-local-download]').href,'/app/photo-download/id/test.zip');assert.equal(nodes.get('[data-local-download]').target,undefined);
 nodes.get('[data-local-download]').onclick();assert.equal(el.removed,undefined);assert.match(nodes.get('[data-zip-status]').textContent,/Zdjęcia pozostają/);
});
