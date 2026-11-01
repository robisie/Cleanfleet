const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CF_CHROMIUM_EXECUTABLE?{executablePath:process.env.CF_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><button data-photo-add>Dodaj zdjęcia</button>');
 await page.evaluate(()=>{
  window.saved=[];window.constraints=[];window.showToast=message=>console.log(message);
  window.cfPhotoSession={get:()=>({record:{id:'wash1'},kind:'po'})};
  window.cfPhotoLocalStoreShot=async(record,kind,file)=>{await new Promise(r=>setTimeout(r,120));window.saved.push({record,kind,name:file.name,size:file.size});};
  Object.defineProperty(HTMLMediaElement.prototype,'srcObject',{set(v){this._stream=v;},get(){return this._stream;}});
  Object.defineProperty(HTMLVideoElement.prototype,'videoWidth',{get:()=>4096});Object.defineProperty(HTMLVideoElement.prototype,'videoHeight',{get:()=>3072});Object.defineProperty(HTMLMediaElement.prototype,'readyState',{get:()=>2});
  HTMLMediaElement.prototype.play=async()=>{};window.ImageCapture=undefined;
  Object.defineProperty(navigator,'mediaDevices',{value:{enumerateDevices:async()=>{await new Promise(r=>setTimeout(r,200));return [{kind:'videoinput',deviceId:'main',label:'Back Camera'},{kind:'videoinput',deviceId:'ultra',label:'Back Ultra Wide'}];},getUserMedia:async options=>{
   const settings={deviceId:options.video.deviceId?.exact||'main',torch:false,zoom:1};
   const track={readyState:'live',getCapabilities:()=>({torch:true,zoom:{min:1,max:3},focusMode:['continuous']}),getSettings:()=>({...settings}),stop(){this.readyState='ended';settings.torch=false;},applyConstraints:async({advanced:[c]})=>{window.constraints.push(c);Object.assign(settings,c);}};
   return {getTracks:()=>[track],getVideoTracks:()=>[track]};
  }}});
 });
 await page.addScriptTag({content:fs.readFileSync('app/photo-camera-v1213.js','utf8')});
 await page.click('[data-photo-add]');await page.click('[data-photo-source="camera"]');
 assert.equal(await page.locator('.cf-cam-torch').isDisabled(),true);
 await page.click('.cf-cam-shutter');await page.waitForFunction(()=>window.saved.length===1);await page.waitForFunction(()=>!document.querySelector('.cf-cam-torch').disabled);
 await page.click('.cf-cam-torch');await page.waitForFunction(()=>document.querySelector('.cf-cam-torch').getAttribute('aria-pressed')==='true');
 await page.locator('.cf-cam-shutter').evaluate(el=>{el.click();el.click();el.click();});
 await page.waitForFunction(()=>window.saved.length===4);await page.waitForFunction(()=>!document.querySelector('.cf-cam-torch').disabled);
 assert.equal(await page.locator('.cf-cam-torch').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.cf-cam-count').textContent(),'4 zdjęć');
 // A moved/cancelled touch can have no synthesized click; it still registers once.
 await page.dispatchEvent('.cf-cam-shutter','pointerdown',{button:0,isPrimary:true,pointerType:'touch'});
 await page.dispatchEvent('.cf-cam-shutter','pointercancel',{pointerType:'touch'});
 await page.dispatchEvent('.cf-cam-shutter','click',{detail:1});
 await page.waitForFunction(()=>window.saved.length===5);await page.waitForFunction(()=>!document.querySelector('.cf-cam-torch').disabled);
 assert.equal(await page.evaluate(()=>saved.length),5);
 await page.locator('.cf-cam-shutter').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.saved.length===6);await page.waitForFunction(()=>!document.querySelector('.cf-cam-torch').disabled);
 await page.evaluate(()=>{window.originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});
 await page.click('.cf-cam-shutter');await page.waitForFunction(()=>document.querySelector('.cf-cam-status').textContent.includes('Nie zrobiono zdjęcia: Przeglądarka nie utworzyła pliku'));
 assert.equal(await page.evaluate(()=>saved.length),6);await page.evaluate(()=>HTMLCanvasElement.prototype.toBlob=originalToBlob);
 await page.click('[data-cam-zoom="2"]');await page.waitForFunction(()=>!document.querySelector('.cf-cam-torch').disabled);
 const last=await page.evaluate(()=>window.constraints.at(-1));assert.equal(last.torch,true);assert.equal(last.focusMode,'continuous');assert.equal(last.zoom,2);
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(300);
  for(const selector of ['.cf-cam-shutter','.cf-cam-cancel','.cf-cam-torch']){const b=await page.locator(selector).boundingBox();assert(b.x>=-1&&b.y>=-1&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,selector+' outside viewport');}
 }
 await page.click('.cf-cam-done');assert.equal(await page.locator('.cf-cam-overlay').isVisible(),false);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>new Set(saved.map(f=>f.name)).size),6);
 await browser.close();console.log('PASS camera DOM: startup shutter, light, rapid taps and saves, autofocus+zoom, portrait/landscape controls, close. Mock camera hardware.');
})().catch(error=>{console.error(error);process.exit(1)});
