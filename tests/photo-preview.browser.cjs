const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CF_CHROMIUM_EXECUTABLE?{executablePath:process.env.CF_CHROMIUM_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://camera.test/**',r=>r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="cfPhotoOverlay" class="open"><div class="cf-photo-tab active" data-photo-kind="przed"></div><div data-photo-status></div><div data-photo-pending></div><div data-photo-saved></div></div>'}));await page.goto('https://camera.test/');
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;canvas.getContext('2d').fillRect(0,0,800,600);
  window.original=await new Promise(r=>canvas.toBlob(r,'image/png'));canvas.width=16;canvas.height=12;window.thumb=await new Promise(r=>canvas.toBlob(r,'image/png'));
  window.thumbnailCalls=0;window.cfPhotoThumbnail=async()=>{thumbnailCalls++;return thumb;};window.showToast=()=>{};
  window.session={record:{id:'wash1'},kind:'przed',pending:{przed:[],po:[]},busy:false};window.cfPhotoSession={get:()=>session};
  window.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>{revoked.push(u);revoke(u);};
 });
 await page.addScriptTag({content:fs.readFileSync('app/photo-local-v1240.js','utf8')});
 await page.evaluate(async()=>{
  const camera=document.createElement('div');camera.className='cf-cam-overlay open';document.body.append(camera);
  document.dispatchEvent(new CustomEvent('cf:photos-open',{detail:{recordId:'wash1'}}));
  for(let i=0;i<3;i++)await cfPhotoLocalStoreShot('wash1','przed',new File([original],`shot-${i}.png`,{type:'image/png'}));
 });
 assert.equal(await page.evaluate(()=>thumbnailCalls),0);assert.equal(await page.locator('[data-local-view]').count(),0);
 await page.evaluate(()=>{document.querySelector('.cf-cam-overlay').remove();document.dispatchEvent(new CustomEvent('cf:photos-render'));});
 await page.waitForFunction(()=>document.querySelectorAll('[data-local-view]').length===3);
 await page.locator('[data-local-view]').first().click();await page.waitForFunction(()=>document.querySelector('.cf-photo-viewer img')?.naturalWidth===800);
 const url=await page.locator('.cf-photo-viewer img').getAttribute('src');assert.equal(await page.locator('.cf-photo-viewer img').evaluate(img=>img.naturalHeight),600);
 const close=await page.locator('[data-preview-close]').boundingBox();assert(close.y>=60&&close.x+close.width<=390);
 await page.click('[data-preview-close]');assert.equal(await page.locator('.cf-photo-viewer').count(),0);assert(await page.evaluate(url=>revoked.includes(url),url));
 await page.locator('[data-local-view]').first().click();await page.waitForFunction(()=>document.querySelector('.cf-photo-viewer img')?.naturalWidth===800);await page.keyboard.press('Escape');assert.equal(await page.locator('.cf-photo-viewer').count(),0);
 // Closing the viewer never deletes a photo; remove is a distinct action.
 await page.locator('[data-local-remove]').first().click();await page.waitForFunction(()=>document.querySelectorAll('[data-local-view]').length===2);assert.equal(await page.locator('.cf-photo-viewer').count(),0);
 await page.evaluate(()=>{
  session.pending.przed.push({file:new File([original],'pending.png',{type:'image/png'})});
  document.querySelector('[data-photo-pending]').innerHTML='<div class="cf-photo-thumb"><img src="'+URL.createObjectURL(thumb)+'"><button data-photo-remove="0">×</button></div>';
  document.dispatchEvent(new CustomEvent('cf:photos-render'));
 });
 const pending=page.locator('[data-photo-pending] img');await pending.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.cf-photo-viewer img')?.naturalWidth===800);
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('cf:photos-close')));assert.equal(await page.locator('.cf-photo-viewer').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS photo preview: actual IndexedDB originals, no hidden thumbnail work during camera, full-resolution viewer, safe close/Escape, URL cleanup, independent delete, keyboard preview of staged original.');
})().catch(error=>{console.error(error);process.exit(1)});
