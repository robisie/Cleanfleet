const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost:4191/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/test')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bill/style.css"><main style="padding:12px"><div id="panel"></div></main>'});
  const file=path.join(root,pathname);if(!file.startsWith(root)||!fs.existsSync(file))return route.abort();
  return route.fulfill({contentType:pathname.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});
 });
 await page.goto('http://localhost:4191/test');
 await page.evaluate(async()=>{
  const K=await import('/bill/ksef.js'),row=(number,date,type='Vat')=>({ksefNumber:`1111111111-${date.replaceAll('-','')}-abcdef123abc-${number==='FV/1'?'aa':'ab'}`,invoiceNumber:number,issueDate:date,permanentStorageDate:date,invoiceType:type,seller:{nip:'1111111111',name:'Sklep testowy'},buyer:{identifier:{value:'6351861297'}},grossAmount:400,currency:'PLN'});
  const a=row('FV/1','2026-01-10'),b=row('KOR/1','2026-04-10','Kor');b.grossAmount=-100;
  const docs=[{metadata:a,hasPreview:true},{metadata:b,hasPreview:true,references:[{ksefNumber:a.ksefNumber,number:a.invoiceNumber,issueDate:a.issueDate}]}];
  const item={index:1,name:'Farba do ścian i sufitów',quantity:4,unit:'szt.',gross:400};
  window.stock=[{metadata:a,item,capacity:4,assigned:2,manualReturned:0,correctedReturned:0,returned:0,available:2,revision:0}];window.writes=[];
  window.fixture={K,a,b,docs};
  const xml='<Faktura></Faktura>',bytes=new TextEncoder().encode(xml);for(const r of [a,b])r.invoiceHash=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))));
  const options={projects:[{id:'p1',name:'Inwestycja testowa',number:'UUR/1'}],index:async()=>docs,storeMetadata:async()=>{},storeXml:async()=>{},stock:async()=>window.stock,
   loadLinks:async()=>[],cfLinks:async()=>[],preview:async()=>({items:[item],gross:400,currency:'PLN',canSelect:true}),allocationContext:async()=>({links:[{kind:'purchases',project_id:'existing',project_name:'Poprzednia inwestycja',document:{selectedQuantities:[{index:1,quantity:2,gross:200}]}}],blocked:[]}),findPurchases:async()=>({revision:1,payload:{purchases:[]}}),assign:async args=>{window.writes.push(args);return {document:{referenceOnly:false}};},setReturn:async args=>{window.writes.push(args);window.stock[0]={...window.stock[0],manualReturned:args.quantity,returned:args.quantity,available:2-args.quantity,revision:1};}};
  window.fixture.options=options;window.fixture.call=async args=>args.action==='ksef-list'?{invoices:[a,b],page:0,hasMore:false,ticket:'fixture'}:{content:btoa(xml)};
  window.mount=()=>K.mount(document.querySelector('#panel'),async args=>args.action==='ksef-list'?{invoices:args.dateType==='Issue'?[b]:[a,b],page:0,hasMore:false,ticket:'fixture'}:{content:btoa(xml)},options);
  K.focusInvoice('1','2026-04','purchases');window.mount();
 });
 await page.waitForFunction(()=>document.querySelector('#kf-status')?.textContent.includes('Sprawdzono'));
 assert.equal(await page.locator('.kf-invoice').count(),2);
 assert.match(await page.locator('.kf-invoice').first().innerText(),/KOR\/1/);assert.match(await page.locator('.kf-related').innerText(),/FV\/1/);assert.match(await page.locator('.kf-related').innerText(),/Poza wybranym okresem/);
 for(const width of [390,820,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+2),'group list overflow '+width);}
 assert.equal(await page.locator('[data-kf="stock"]').count(),0);await page.evaluate(()=>{const {K,options,call}=window.fixture;K.unmount();const host=document.querySelector('#panel');host.className='robisie-stock';document.querySelector('link').href='/app/robisie/style.css';const css=document.createElement('link');css.rel='stylesheet';css.href='/app/robisie/stock.css';document.head.append(css);K.mountStock(host,call,options);});await page.waitForFunction(()=>document.querySelector('#kf-status')?.textContent.includes('Towar:'));
 for(const width of [390,820,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.body.scrollWidth<=innerWidth+2),'stock overflow '+width);}
 await page.locator('[data-kf="stock-assign"]').click();await page.locator('dialog[open] [name="project"]').selectOption('p1');
 await page.locator('[data-allocation-quantity="1"]').fill('1');await page.locator('dialog[open] [type="submit"]').click();
 await page.waitForFunction(()=>window.writes.length===1);assert.equal(await page.evaluate(()=>window.writes[0].entries[0].quantity),1);
 await page.locator('[data-kf="stock-return"]').click();await page.locator('dialog[open] [name="quantity"]').fill('1');await page.locator('dialog[open] [type="submit"]').click();
 await page.waitForFunction(()=>window.writes.length===2);assert.equal(await page.evaluate(()=>window.writes[1].quantity),1);await page.locator('dialog[open]').waitFor({state:'detached'});
 await page.screenshot({path:'/tmp/ksef-stock-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/ksef-stock-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);await browser.close();console.log('OK: correction groups, three viewport sizes, partial assignment and return dialogs.');
})().catch(e=>{console.error(e);process.exit(1);});
