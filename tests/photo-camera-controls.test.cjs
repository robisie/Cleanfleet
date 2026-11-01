const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {File}=require('node:buffer');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.fail('camera did not settle');}
function harness({enumerate,save,focus=['continuous','single-shot'],rejectFocus=false,nativeError=false,torch=true}={}){
 const nodes=new Map(),events={},intervals=new Map(),streams=[],saved=[],messages=[],calls=[];let nextTimer=0,nativeShots=0,frames=0;
 const node=()=>({style:{},disabled:false,attrs:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){},appendChild(){},querySelectorAll(){return[];}});
 for(const s of ['.cf-cam-video','.cf-cam-stage','.cf-cam-count','.cf-cam-shutter','.cf-cam-status','.cf-cam-switch','.cf-cam-torch','[data-cam-device]','.cf-cam-cancel','.cf-cam-done','.cf-cam-device','[data-cam-lens-note]','.cf-cam-zoom','.cf-cam-flash'])nodes.set(s,node());
 const video=nodes.get('.cf-cam-video');Object.assign(video,{videoWidth:4096,videoHeight:3072,readyState:2,play:async()=>{}});
 const zooms=['0.5','1','2'].map(k=>({...node(),dataset:{camZoom:k}}));nodes.get('.cf-cam-zoom').querySelectorAll=()=>zooms;
 let opened=false;const overlay={style:{},querySelector:s=>nodes.get(s),querySelectorAll:()=>zooms,classList:{contains:()=>opened,add:()=>opened=true,remove:()=>opened=false}};
 const context={console,File,Blob,setTimeout,clearTimeout,setInterval:fn=>{intervals.set(++nextTimer,fn);return nextTimer;},clearInterval:id=>intervals.delete(id),showToast:m=>messages.push(m),ImageCapture:class{async getPhotoCapabilities(){return {imageWidth:{max:6000},imageHeight:{max:4000}};}async takePhoto(){nativeShots++;if(nativeError)throw Error('still unsupported');return new Blob(['native'],{type:'image/jpeg'});}},navigator:{mediaDevices:{enumerateDevices:enumerate||(async()=>[{kind:'videoinput',deviceId:'main',label:'Back Camera'},{kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide'}]),getUserMedia:async constraints=>{
  const settings={deviceId:constraints.video.deviceId?.exact||'main',torch:false,zoom:1};
  const t={readyState:'live',getCapabilities:()=>({torch,focusMode:focus,zoom:{min:1,max:3}}),getSettings:()=>({...settings}),applyConstraints:async({advanced:[options]})=>{calls.push({...options});if(rejectFocus&&options.focusMode)throw Error('focus rejected');settings.torch=options.torch??false;settings.focusMode=options.focusMode??'manual';if(options.zoom!==undefined)settings.zoom=options.zoom;},stop(){this.readyState='ended';settings.torch=false;},dropTorch(){settings.torch=false;}};
  const s={getVideoTracks:()=>[t],getTracks:()=>[t]};streams.push(s);return s;
 }}},document:{visibilityState:'visible',documentElement:{style:{}},addEventListener:(name,fn)=>events[name]=fn,createElement:name=>name==='canvas'?{getContext:()=>({drawImage:()=>frames++,translate(){},scale(){}}),toBlob:cb=>cb(new Blob(['frame'],{type:'image/jpeg'}))}:node()},window:{visualViewport:{width:390,height:844,addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){},cfPhotoSession:{get:()=>({record:{id:'wash1'},kind:'przed'}),addFiles:files=>saved.push(...files)},cfPhotoLocalStoreShot:async(record,kind,file)=>{if(save)await save(record,kind,file);saved.push(file);}}};
 let source=fs.readFileSync('app/photo-camera-v1213.js','utf8').replace("  document.addEventListener('click'", "  window.h={init:o=>overlay=o,openCamera,toggleTorch,requestCapture,setLens,closeCamera,get:()=>({busy,pendingCaptures,torchOn,torchWanted,captureCount,shots})};\n  document.addEventListener('click'");
 vm.runInNewContext(source,context);const h=context.window.h;h.init(overlay);
 return {context,h,nodes,streams,saved,messages,calls,events,video,intervals,get nativeShots(){return nativeShots;},get frames(){return frames;}};
}
test('startup finishes lens selection before enabling lamp; a shutter tap during startup is retained',async()=>{
 let release;const x=harness({enumerate:()=>new Promise(resolve=>release=resolve)});
 const starting=x.h.openCamera();await until(()=>release);
 assert.equal(x.nodes.get('.cf-cam-torch').disabled,true);
 await x.h.toggleTorch();assert.equal(x.h.get().torchWanted,false);
 x.h.requestCapture();assert.equal(x.h.get().pendingCaptures,1);
 release([{kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide'}]);await starting;
 await until(()=>!x.h.get().busy);
 assert.equal(x.saved.length,1);assert.equal(x.streams.length,2);
 await x.h.toggleTorch();assert.equal(x.h.get().torchOn,true);
 assert.equal(x.nodes.get('.cf-cam-torch').attrs['aria-pressed'],'true');
 await tick();assert.equal(x.streams.length,2);x.h.closeCamera();assert.equal(x.intervals.size,0);
});
test('torch survives zoom, autofocus and repeated photos; external torch reset is repaired and reflected in icon',async()=>{
 const x=harness();await x.h.openCamera();await x.h.toggleTorch();await x.h.setLens('2');
 assert.equal(x.h.get().torchOn,true);assert.equal(x.calls.at(-1).zoom,2);assert.equal(x.calls.at(-1).torch,true);assert.equal(x.calls.at(-1).focusMode,'continuous');
 x.h.requestCapture();await until(()=>x.saved.length===1&&!x.h.get().busy);
 assert.equal(x.nativeShots,0);assert.equal(x.frames,1);assert.equal(x.h.get().torchOn,true);
 assert.ok(x.calls.some(c=>c.torch===true&&c.focusMode==='continuous'));
 x.streams.at(-1).getVideoTracks()[0].dropTorch();[...x.intervals.values()][0]();
 assert.equal(x.nodes.get('.cf-cam-torch').attrs['aria-pressed'],'false');
 await until(()=>!x.h.get().busy);assert.equal(x.h.get().torchOn,true);
 await x.h.toggleTorch();assert.equal(x.h.get().torchOn,false);x.h.closeCamera();
});
test('three shutter taps during a slow local save produce three separately saved photos with visible progress',async()=>{
 let release;const x=harness({save:()=>new Promise(resolve=>release=resolve)});await x.h.openCamera();
 x.h.requestCapture();await until(()=>release);const first=release;
 x.h.requestCapture();x.h.requestCapture();assert.equal(x.h.get().pendingCaptures,2);
 assert.match(x.nodes.get('.cf-cam-status').textContent,/Zapisywanie.*W kolejce: 2/);
 first();await until(()=>x.saved.length===1&&release!==first);const second=release;
 second();await until(()=>x.saved.length===2&&release!==second);release();
 await until(()=>!x.h.get().busy);assert.equal(x.saved.length,3);assert.equal(new Set(x.saved.map(f=>f.name)).size,3);
 assert.equal(x.h.get().pendingCaptures,0);assert.equal(x.nodes.get('.cf-cam-shutter').attrs['aria-busy'],'false');x.h.closeCamera();
});
test('autofocus capability rejection and unavailable native still both keep camera usable',async()=>{
 const x=harness({rejectFocus:true,nativeError:true});await x.h.openCamera();
 assert.ok(x.calls.some(c=>c.focusMode==='continuous'));assert.ok(x.calls.some(c=>c.focusMode===undefined));
 x.h.requestCapture();await until(()=>x.saved.length===1&&!x.h.get().busy);
 assert.equal(x.frames,1);assert.equal(x.messages.length,0);x.h.closeCamera();
 const y=harness({focus:[],torch:false});await y.h.openCamera();y.h.requestCapture();await until(()=>y.saved.length===1&&!y.h.get().busy);
 assert.equal(y.calls.some(c=>c.focusMode!==undefined),false);y.h.closeCamera();
});
test('an early shutter tap waits for a real frame and failed auto-save keeps the photo for delivery',async()=>{
 const x=harness({save:async()=>{throw Error('storage full');}});x.video.readyState=0;x.video.videoWidth=0;
 const opening=x.h.openCamera();await until(()=>x.streams.length===2);x.h.requestCapture();assert.equal(x.saved.length,0);
 x.video.readyState=2;x.video.videoWidth=4096;await opening;await until(()=>!x.h.get().busy);
 assert.equal(x.h.get().shots.length,1);assert.match(x.messages[0],/Nie zapisano ujęcia automatycznie/);x.h.closeCamera();assert.equal(x.saved.length,1);
});
test('returning from background restarts the camera with autofocus and active light restored',async()=>{
 const x=harness();await x.h.openCamera();await x.h.toggleTorch();
 // visibility is intentionally changed through the actual registered handler.
 x.context.document.visibilityState='hidden';x.events.visibilitychange();assert.equal(x.h.get().torchOn,false);assert.equal(x.intervals.size,0);
 x.context.document.visibilityState='visible';x.events.visibilitychange();await until(()=>!x.h.get().busy);
 assert.equal(x.h.get().torchOn,true);assert.equal(x.calls.at(-1).focusMode,'continuous');x.h.closeCamera();
});
