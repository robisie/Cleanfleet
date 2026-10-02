const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('OCR tylko obok wyszukiwarki otwartego panelu administratora',()=>{
 let isAdmin=true,isOpen=false,button=null,clicks=0;
 const box={append:b=>button=b};const panel={classList:{contains:()=>isOpen},querySelector:selector=>{assert.equal(selector,'.cf-company-search-box');return box;}};
 const context={admin:()=>isAdmin,addStyle(){},open:()=>clicks++,overlay:null,busy:false,scanBusy:false,document:{getElementById:id=>id==='cfCompanyOverlay'?panel:button,createElement:()=>({setAttribute(){},addEventListener:(name,fn)=>button.onclick=fn,remove:()=>button=null})}};
 const source=fs.readFileSync('app/wash-sheet-import.js','utf8');vm.runInNewContext(source.slice(source.indexOf('function sync()'),source.indexOf('async function fetchAll')),context);
 context.sync();assert.equal(button,null);isOpen=true;context.sync();assert.equal(button.id,'cfWashSheetBtn');assert.match(button.innerHTML,/OCR/);button.onclick();assert.equal(clicks,1);
 isOpen=false;context.sync();assert.equal(button,null);isOpen=true;isAdmin=false;context.sync();assert.equal(button,null);
});
