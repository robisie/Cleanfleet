const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const styles=read('app/index.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),cfCSS=[...styles].map(m=>m[1]).join('\n');
const dynamicCSS=p=>read(p).match(/(?:s|st)\.textContent=`([\s\S]*?)`;/)[1];
const docsCSS=[...read('app/accounting-documents-v1510.js').matchAll(/^      '([^\n]*)',?$/gm)].map(m=>m[1]).filter(s=>s.startsWith('#cfAccounting')||s.startsWith('.cf-accounting')).join('\n');
const control='<input aria-label="Szukaj" placeholder="Szukaj"><button type="button">Dodaj wpis</button>';
const fixtures={
 cleanfleet:{css:cfCSS,body:`<header><div class="wrap">CleanFleet</div></header><div class="wrap" id="working"><div class="search-box">${control}</div><div class="records"><div class="record-card">Wpis</div></div></div><div class="bottom-bar"><button>Menu</button></div>`,surface:'header',working:'#working',box:false},
 robisie:{css:read('app/robisie/style.css'),body:`<div id="app"><header class="topbar">Robisię ${control}</header><div class="shell" id="working"><nav><button>Inwestycje</button></nav><main><div class="card">Kalkulacja ${control}</div></main></div></div>`,surface:'.topbar',working:'#working',box:true},
 bill:{css:read('bill/style.css'),body:`<div id="app"><header class="topbar">Bill ${control}</header><div class="shell" id="working"><nav><button>Faktury</button></nav><main><div class="card">Faktury ${control}</div></main></div></div>`,surface:'.topbar',working:'#working',box:true},
 taxes:{css:read('pack/modules.css')+dynamicCSS('app/taxes-v1310.js'),body:`<div id="modalRoot"><div class="overlay" id="cfTaxesOverlay"><div class="sheet cf-taxes-sheet" id="working"><button class="close">×</button><div class="cf-taxes-head"><h2>ZUS i podatki</h2></div><div class="cf-taxes-months"><button>Sty</button><button>Lut</button></div><div class="cf-taxes-grid">${control}</div></div></div></div>`,surface:'.cf-taxes-sheet',working:'#working',box:true},
 website:{css:read('pack/modules.css')+dynamicCSS('pack/website-stats.js'),body:`<div id="modalRoot"><div class="overlay" id="cfWebsiteStatsOverlay"><div class="sheet cf-www-stats-sheet" id="working"><button class="close">×</button><div class="cf-www-stats-head"><h2>Statystyki WWW</h2></div><div class="cf-www-stats-toolbar">${control}</div><div id="cfWwwStatsBody">Statystyki</div></div></div></div>`,surface:'.cf-www-stats-sheet',working:'#working',box:true},
 documents:{css:read('pack/modules.css')+docsCSS,body:`<div id="modalRoot"><div class="cf-open" id="cfAccountingDocsOverlay"><section class="cf-accounting-docs-sheet"><header class="cf-accounting-docs-head"><h1>Dokumenty księgowe</h1><button>Zamknij</button></header><div class="cf-accounting-docs-body" id="working"><div class="cf-accounting-period">${control}</div><div class="card">KSeF i wyciągi</div></div></section></div></div>`,surface:'.cf-accounting-docs-head',working:'#working',box:true}
};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CF_CHROMIUM_EXECUTABLE?{executablePath:process.env.CF_CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.CF_CHROMIUM_ARGS||'[]')}:{})});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fitter=read('pack/app.js').slice(read('pack/app.js').indexOf('function fitFrame('),read('pack/app.js').indexOf('function home('));
 await page.route('http://localhost:4191/**',r=>{const p=new URL(r.request().url()).pathname;
  if(p==='/test')return r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body style="margin:0"><iframe id="target" style="width:100%;height:100vh;border:0;display:block"></iframe></body></html>'});
  if(p.startsWith('/fixture/')){const f=fixtures[p.split('/').pop()];return r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${f.css}</style></head><body>${f.body}</body></html>`});}
  if(p==='/pack/frame.css')return r.fulfill({contentType:'text/css',body:read('pack/frame.css')});return r.abort();
 });
 await page.goto('http://localhost:4191/test');await page.addScriptTag({content:fitter+'function home(){};const target=document.getElementById("target");target.onload=()=>fitFrame(target);'});
 for(const width of [390,820,1440]){
  await page.setViewportSize({width,height:1000});
  for(const [name,f] of Object.entries(fixtures)){
   await page.locator('#target').evaluate((el,url)=>el.src=url,'/fixture/'+name);const frame=page.frameLocator('#target');await frame.locator('html.robisie-pack-frame').waitFor();await frame.locator('#robisiePackFrameStyle').evaluate(el=>new Promise(resolve=>{if(el.sheet)resolve();else el.onload=resolve;}));
   const surface=await frame.locator(f.surface).boundingBox();if(['taxes','documents'].includes(name)){const sheet=await frame.locator(name==='taxes'?'.cf-taxes-sheet':'.cf-accounting-docs-sheet').boundingBox();assert(Math.abs(sheet.y)<2&&sheet.height>=998,`${name}: full-height background ${JSON.stringify(sheet)}`);}
   assert(Math.abs(surface.width-width)<4,`${name} ${width}: full surface ${surface.width}`);
   if(width>760||!f.box){const b=await frame.locator(f.working).evaluate(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {width:b.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),x:b.x+parseFloat(s.paddingLeft)};});const expected=width>760?width*.8:width-24;assert(Math.abs(b.width-expected)<4,`${name} ${width}: content ${JSON.stringify(b)}`);assert(Math.abs(b.x-(width-expected)/2)<4,`${name}: centered`);}
   assert(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+2),`${name} ${width}: no horizontal page overflow`);
   await page.screenshot({path:`/tmp/pack-width-${name}-${width}.png`});
  }
 }
 // Standalone pages do not receive Pack class/styles; print ignores screen layout.
 await page.emulateMedia({media:'print'});const frame=page.frameLocator('#target');assert.notEqual(await frame.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--pack-gutter').trim()),'10vw');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Pack width: 6 module/app structures, actual CSS, full surfaces and centered 80% desktop/tablet work area, phone gutters/no page overflow, screen-only, actual fitFrame on navigation.');
})().catch(e=>{console.error(e);process.exit(1)});
