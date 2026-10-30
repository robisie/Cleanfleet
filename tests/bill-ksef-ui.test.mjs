import * as Progress from '../bill/ksef-progress.js';
import * as CostCorrection from '../bill/cost-correction.js';
import * as SupplierSuggestions from '../bill/stock-suggestions.js';
import * as Relations from '../bill/ksef-relations.js';
import * as Stock from '../bill/stock.js';
import * as Suggestions from '../bill/cost-suggestions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as C from '../bill/core.js';
import * as D from '../bill/ksef-data.js';
import * as Import from '../bill/purchase-import.js';
import * as ReceiptImport from '../bill/receipt-import.js';
const Zip=createRequire(import.meta.url)('../app/vendor/jszip-3.10.1.min.js');
async function setup(correctionChoice,{fastTimers=false,storage}={}){
 const nodes=new Map(),blobUrls=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',value:'',innerHTML:'',dataset:{}});return nodes.get(key);};
 const root={innerHTML:'',querySelector:node,querySelectorAll:()=>[]};let count=0;
 const context=vm.createContext({console,crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,File,Map,Set,AbortController,DOMException,atob,btoa,localStorage:storage,setTimeout:fastTimers?(fn,ms)=>setTimeout(fn,0):setTimeout,clearTimeout,URL:{createObjectURL:blob=>{const key='blob:'+(count++);blobUrls.set(key,blob);return key;},revokeObjectURL:key=>blobUrls.delete(key)},window:{JSZip:Zip,CFKsefRenderer:{generateInvoice:async()=>new Blob(['%PDF-1.7 fixture'])}},DOMParser:class{parseFromString(){return {doctype:null,documentElement:{localName:'Faktura'},getElementsByTagName:()=>[]};}},document:{}});
 const code=await readFile(new URL('../bill/ksef.js',import.meta.url),'utf8');
 const m=new vm.SourceTextModule(code+`\nexport function setupTest(node,call,rows=[],kind='purchases'){root=node;api=call;state=initial();state.kind=kind;state.loaded=true;state.rows=rows;state.query={kind:state.kind,from:state.from,to:state.to,dateType:state.dateType,sort:'Desc'};state.selected=new Set(rows.map(r=>r.ksefNumber));draw();}export {run,load,downloadSelected,historyRead};export async function testAssignment(options,project,number,known=[],duplicateChoice){if(duplicateChoice!==undefined)chooseDuplicate=async()=>duplicateChoice;integration=options;assignments=known;chooseInvestment=async()=>project;await run(signal=>assignInvestment(number,signal));return message;}export async function testDemand(options,number){integration=options;await run(signal=>paymentDemand(number,signal));return message;}export async function testSupplierSuggestions(options,rows,source,selected,target={kind:'firmowe',label:'Koszty firmowe'}){integration=options;stockRows=rows;chooseSupplierInvoices=async(candidates,label,signal,unavailable)=>typeof selected==='function'?selected(candidates,label,signal,unavailable):selected;await run(signal=>suggestSupplierInvoices(source,target,signal));return {message,rows:stockRows};}export function testState(){return {state,ready,message,busy:!!controller};}`,{context});
 await m.link(spec=>{const values=spec.includes('ksef-progress')?Progress:spec.includes('cost-correction')?(correctionChoice!==undefined?{costCorrectionDialog:async()=>correctionChoice}:CostCorrection):spec.includes('ksef-relations')?Relations:spec.includes('stock.js')?Stock:spec.includes('stock-suggestions')?SupplierSuggestions:spec.includes('cost-suggestions')?Suggestions:spec.includes('receipt-import')?ReceiptImport:spec.includes('purchase-import')?Import:spec.includes('ksef-data')?D:C;return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();return {n:m.namespace,root,blobUrls,node};
}
const number=i=>'6351861297-20261016-123456789ABC-'+String(i).padStart(2,'0');
const row=i=>({ksefNumber:number(i),invoiceNumber:'FV/'+i,issueDate:'2026-10-16',seller:{nip:'6351861297',name:'<img src=x onerror=alert(1)>'},buyer:{name:'Nabywca'},grossAmount:100,currency:'PLN'});
const supplierGoods=()=>[1,2,3].map(i=>({metadata:row(i),item:{index:1,name:'Koszt',unit:'szt.',gross:100},capacity:1,assigned:i===1?1:0,classifiedCompany:i===1?1:0,available:i===1?0:1,returned:0}));
test('supplier batch writes only checked invoices; skipping the dialog writes nothing',async()=>{
 for(const selected of [null,[],[number(3)]]){
  const {n}=await setup(),goods=supplierGoods(),writes=[];
  const result=await n.testSupplierSuggestions({stock:async()=>goods,setInvoiceUse:async args=>writes.push(args)},goods,number(1),selected);
  assert.equal(writes.length,selected?.length||0);if(writes.length){assert.equal(writes[0].number,number(3));assert.equal(writes[0].category,'firmowe');assert.deepEqual(Array.from(writes[0].indices),[1]);assert.match(result.message,/Dodatkowo zapisano 1 z 1/);}
 }
});
test('supplier batch rechecks changes after selection and continues past one failed invoice',async()=>{
 const {n}=await setup(),goods=supplierGoods(),writes=[];let reads=0;
 const result=await n.testSupplierSuggestions({stock:async()=>{reads++;return goods;},setInvoiceUse:async args=>{writes.push(args.number);if(args.number===number(2))throw Error('Stan się zmienił');}},goods,number(1),[number(2),number(3)]);
 assert.deepEqual(writes,[number(2),number(3)]);assert.match(result.message,/Dodatkowo zapisano 1 z 2/);assert.match(result.message,/FV\/2: Stan się zmienił/);assert.equal(reads,2);
 const next=await setup(),stale=supplierGoods();stale[1]={...stale[1],assigned:1,available:0};let saved=0;
 const failed=await next.n.testSupplierSuggestions({stock:async()=>stale,setInvoiceUse:async()=>saved++},supplierGoods(),number(1),[number(2)]);
 assert.equal(saved,0);assert.match(failed.message,/Stan zmienił się/);
});
test('supplier batch preserves CleanFleet category and company without copying invoice notes',async()=>{
 const {n,root}=await setup(),goods=supplierGoods(),bytes=new TextEncoder().encode('<Faktura>koszt</Faktura>');goods[1].metadata.invoiceHash=await D.digest(bytes);n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}));let written;
 await n.testSupplierSuggestions({stock:async()=>goods,cfContext:async()=>({blocked:[],purchases:[]}),cfSave:async args=>written=args},goods,number(1),[number(2)],{kind:'cleanfleet',category:'Chemia',company_id:'firma',label:'CleanFleet · Chemia'});
 assert.equal(written.number,number(2));assert.equal(written.xml,'<Faktura>koszt</Faktura>');assert.equal(written.entries[0].category,'Chemia');assert.equal(written.entries[0].company_id,'firma');assert.equal(written.entries[0].note,'');
});
test('supplier investment batch imports full quantities with current revision and flags manual duplicates',async()=>{
 for(const manual of [false,true]){
  const {n,root}=await setup(),goods=supplierGoods(),bytes=new TextEncoder().encode('<Faktura>inwestycja</Faktura>');goods[1].metadata.invoiceHash=await D.digest(bytes);n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}));let written;
  const result=await n.testSupplierSuggestions({stock:async()=>goods,allocationContext:async()=>({links:[],blocked:[]}),findPurchases:async()=>({revision:12,payload:{purchases:[{amount:100,sourceKsefNumber:manual?null:number(1)}]}}),assign:async args=>written=args},goods,number(1),[number(2)],{kind:'investment',project:'project',label:'Robisię · Remont'});
  if(manual){assert.equal(written,undefined);assert.match(result.message,/ręczny zakup/);}else{assert.equal(written.project,'project');assert.equal(written.projectRevision,12);assert.deepEqual(Array.from(written.entries,e=>({index:e.index,quantity:e.quantity})),[{index:1,quantity:1}]);}
 }
});
test('Bill has only invoice tabs; Robisię mounts the standalone Towar view with its inventory',async()=>{
 const {n,root}=await setup();n.setupTest(root,async()=>({invoices:[],hasMore:false}),[]);assert.ok(!root.innerHTML.includes('data-kf="stock"'));
 let loaded=false;n.mountStock(root,async()=>({invoices:[],page:0,hasMore:false}),{index:async()=>[],storeMetadata:async()=>{},stock:async()=>{loaded=true;return [{metadata:row(1),item:{index:1,name:'Farba',unit:'szt.',gross:400},capacity:4,assigned:2,returned:0,available:2}];}});
 for(let i=0;i<50&&n.testState().busy;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(loaded,true);assert.match(root.innerHTML,/Pozostało: 2/);assert.match(root.innerHTML,/data-kf="stock-assign"/);assert.ok(!root.innerHTML.includes('data-kf="kind"'));n.unmount();
});
test('Towar filters shops and returned stock without fetching the list again',async()=>{
 const {n,root,node}=await setup(),a={...row(1),seller:{nip:'111',name:'Pierwszy'}},b={...row(2),seller:{nip:'222',name:'Drugi'}},goods=[{metadata:a,item:{index:1,name:'Nowy produkt',unit:'szt.',gross:100},capacity:1,assigned:0,returned:0,available:1},{metadata:b,item:{index:1,name:'Oddany produkt',unit:'szt.',gross:100},capacity:2,assigned:0,returned:1,available:1}];let reads=0;
 n.mountStock(root,async()=>({invoices:[],hasMore:false}),{index:async()=>[],storeMetadata:async()=>{},stock:async()=>{reads++;return goods;}});
 for(let i=0;i<50&&n.testState().busy;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.match(root.innerHTML,/Wszystkie sklepy/);assert.match(root.innerHTML,/Na stanie/);assert.match(root.innerHTML,/Oddano/);
 root.onchange({target:{id:'kf-stock-store',value:'222',dataset:{}}});root.onchange({target:{id:'kf-stock-status',value:'returned',dataset:{}}});
 assert.match(node('#kf-stock-results').innerHTML,/Oddany produkt/);assert.doesNotMatch(node('#kf-stock-results').innerHTML,/Nowy produkt/);assert.equal(reads,2);n.unmount();
});
test('Magazyn summary opens from the main stock panel',async()=>{
 const {n,root}=await setup();n.mountStock(root,async()=>({invoices:[],hasMore:false}),{index:async()=>[],storeMetadata:async()=>{},stock:async()=>[{metadata:row(1),item:{index:1,name:'Farba',unit:'szt.',gross:200},capacity:2,assigned:0,returned:0,available:2}]});
 for(let i=0;i<50&&n.testState().busy;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.match(root.innerHTML,/data-kf="stock-summary"/);root.onclick({target:{closest:()=>({dataset:{kf:'stock-summary'}})},stopPropagation(){}});
 assert.match(root.innerHTML,/Podsumowanie magazynu/);assert.match(root.innerHTML,/200,00/);n.unmount();
});
test('one rejected XML does not hide saved goods or stop reading the next invoice',async()=>{
 const {n,root}=await setup(),bytes=new TextEncoder().encode('<Faktura/>'),docs=await Promise.all([1,2].map(async i=>({metadata:{...row(i),invoiceHash:await D.digest(bytes)},hasPreview:false}))),attempts=[];
 const goods=[{metadata:row(3),item:{index:1,name:'Zapisana farba',unit:'szt.',gross:100},capacity:1,assigned:0,returned:0,available:1}];
 n.mountStock(root,async body=>body.action==='ksef-list'?{invoices:[],hasMore:false}:{content:Buffer.from(bytes).toString('base64')},{index:async()=>docs,storeMetadata:async()=>{},stock:async()=>goods,storeXml:async number=>{attempts.push(number);if(number===docs[0].metadata.ksefNumber)throw Error('XML nie zgadza się z metadanymi KSeF.');docs[1].hasPreview=true;}});
 for(let i=0;i<100&&n.testState().busy;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(attempts.length,2);assert.match(root.innerHTML,/Zapisana farba/);assert.match(root.innerHTML,/Problemy z dokumentami \(1\)/);assert.match(root.innerHTML,/FV\/1/);assert.ok(!root.innerHTML.includes('Brak pozostałych towarów.'));n.unmount();
});
test('unread corrections keep saved stock visible and block allocating uncertain quantities',async()=>{
 const {n,root}=await setup(),bytes=new TextEncoder().encode('<Faktura/>'),metadata={...row(1),invoiceType:'Kor',invoiceHash:await D.digest(bytes)};
 n.mountStock(root,async body=>body.action==='ksef-list'?{invoices:[],hasMore:false}:{content:Buffer.from(bytes).toString('base64')},{index:async()=>[{metadata,hasPreview:false}],storeMetadata:async()=>{},storeXml:async()=>{throw Error('Nie odczytano korekty');},stock:async()=>[{metadata:row(2),item:{index:1,name:'Zapisana farba',unit:'szt.',gross:100},capacity:1,assigned:0,returned:0,available:1}]});
 for(let i=0;i<100&&n.testState().busy;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.match(root.innerHTML,/Zapisana farba/);assert.match(root.innerHTML,/Nie zakończono sprawdzania nowych korekt/);assert.match(root.innerHTML,/data-kf="stock-assign"[^>]*disabled/);n.unmount();
});
test('KSeF panel escapes metadata, merges pages and changes month without keeping old selection',async()=>{
 const {n,root}=await setup(),calls=[];n.setupTest(root,async body=>{calls.push(body);return {invoices:[row(body.page+1)],page:body.page,hasMore:body.page===0,ticket:'encrypted'};});
 await n.run(n.load);await n.run(signal=>n.load(signal,true));assert.equal(n.testState().state.rows.length,2);assert.equal(calls[1].page,1);assert.equal(calls[1].ticket,'encrypted');assert.match(root.innerHTML,/&lt;img src=x/);assert.ok(!root.innerHTML.includes('<img src=x'));
 root.onchange({target:{id:'kf-all',checked:true,dataset:{}}});assert.equal(n.testState().state.selected.size,2);root.onchange({target:{id:'kf-month',value:'2026-02',dataset:{}}});assert.equal(n.testState().state.from,'2026-02-01');assert.equal(n.testState().state.to,'2026-02-28');assert.equal(n.testState().state.rows.length,0);assert.equal(n.testState().state.selected.size,0);assert.equal(n.testState().state.query,null);
});
test('selected PDFs use one bulk export, verify AES/hashes and produce only selected PDFs in ZIP',async()=>{
 const {n,root,blobUrls}=await setup(),xml=new TextEncoder().encode('<Faktura>Łódź</Faktura>'),rows=[row(1),row(2)].map(r=>({...r,seller:{name:'Leroy-Merlin'},invoiceNumber:'FV/123/2026'}));for(const r of rows)r.invoiceHash=await D.digest(xml);const archive=new Zip();for(const r of rows)archive.file(r.ksefNumber+'.xml',xml);const plain=await archive.generateAsync({type:'uint8array',compression:'STORE'});const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(16)),aes=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv},aes,plain));const b64=bytes=>Buffer.from(bytes).toString('base64'),calls=[];
 n.setupTest(root,async(body,options)=>{calls.push(body.action);if(body.action==='ksef-export-start')return {ticket:'export',key:b64(key),iv:b64(iv)};if(body.action==='ksef-export-status')return {status:'ready',invoiceCount:2,size:plain.length,parts:[{ticket:'part',partSize:plain.length,partHash:await D.digest(plain)}]};if(body.action==='ksef-export-part'){assert.equal(options.binary,true);return encrypted;}throw Error('Unexpected direct invoice request');},rows);
 await n.run(n.downloadSelected);const {ready,message}=n.testState();assert.ok(ready,message);assert.equal(ready.count,2);const zip=await Zip.loadAsync(await blobUrls.get(ready.url).arrayBuffer());assert.deepEqual(Object.keys(zip.files).sort(),['Leroy-Merlin - 2026-10-16 - FV-123-2026 (2).pdf','Leroy-Merlin - 2026-10-16 - FV-123-2026.pdf']);assert.deepEqual(calls,['ksef-export-start','ksef-export-status','ksef-export-part']);assert.match(root.innerHTML,/Zapisz paczkę ZIP/);
});
test('cancellation aborts pending request and never offers a partial ZIP',async()=>{
 const {n,root}=await setup();n.setupTest(root,async(body,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Anulowano','AbortError')),{once:true})));
 const work=n.run(n.load);root.onclick({target:{closest:()=>({dataset:{kf:'cancel'}})},stopPropagation(){}});await work;assert.equal(n.testState().busy,false);assert.equal(n.testState().ready,null);assert.match(n.testState().message,/Anulowano/);
});
test('failed refresh keeps the previously loaded list and selection, marks it stale and offers retry',async()=>{
 const {n,root}=await setup();n.setupTest(root,async()=>{const error=Error('KSeF jest chwilowo niedostępny (HTTP 503).');error.retryable=true;throw error;},[row(1)]);await n.run(n.load);assert.equal(n.testState().state.rows.length,1);assert.equal(n.testState().state.selected.size,1);assert.equal(n.testState().state.listError,true);assert.match(root.innerHTML,/Ponów pobieranie listy/);assert.match(root.innerHTML,/mogą być nieaktualne/);
});
test('failed initial load does not claim an empty successful invoice list',async()=>{
 const {n,root}=await setup();n.setupTest(root,async()=>{throw Error('HTTP 503');});n.testState().state.loaded=false;await n.run(n.load);assert.match(root.innerHTML,/Lista nie została jeszcze pobrana/);assert.doesNotMatch(root.innerHTML,/Wczytano 0 faktur/);assert.equal(n.testState().state.loaded,false);
});
test('an accepted Bill-only correction can be included in PDF ZIP without waiting for KSeF export indexing',async()=>{
 const {n,root,blobUrls}=await setup(),xml='<Faktura>saved accepted correction</Faktura>',r={...row(4),billId:'bill-correction',invoiceNumber:'KA4/10/2026',invoiceType:'Kor',grossAmount:0,invoiceHash:await D.digest(new TextEncoder().encode(xml))};const calls=[];
 n.setupTest(root,async body=>{calls.push(body.action);assert.equal(body.action,'document');assert.equal(body.id,'bill-correction');return {status:'accepted',ksef_number:r.ksefNumber,xml};},[r]);assert.match(root.innerHTML,/Źródło: Bill/);assert.match(root.innerHTML,/Korekta/);await n.run(n.downloadSelected);assert.ok(n.testState().ready,n.testState().message);const zip=await Zip.loadAsync(await blobUrls.get(n.testState().ready.url).arrayBuffer());assert.ok(zip.file(D.invoicePdfName(r)));assert.deepEqual(calls,['document']);
});
test('returning to KSeF refreshes a previously loaded sales list',async()=>{
 const {n,root}=await setup();let requests=0;n.setupTest(root,async()=>{},[row(1)]);n.testState().state.kind='sales';n.mount(root,async()=>{requests++;return {invoices:[row(1),{...row(4),invoiceNumber:'KA4/10/2026',invoiceType:'Kor',grossAmount:0}],page:0,hasMore:false,ticket:'encrypted'};});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,1);assert.equal(n.testState().state.rows.length,2);assert.match(root.innerHTML,/KA4\/10\/2026/);
});

test('KSeF assignment verifies XML hash before persisting and refuses a conflicting Bill investment',async()=>{
 const {n,root}=await setup(),bytes=new TextEncoder().encode('<Faktura>test</Faktura>'),entry={...row(7),invoiceHash:await D.digest(bytes)},saved=[];
 const options={projects:[{id:'project',name:'Test'}],loadLinks:async()=>[],assign:async args=>{saved.push(args);return {document:{}};}};
 n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}),[entry]);
 await n.testAssignment(options,'project',entry.ksefNumber);assert.equal(saved.length,1);assert.equal(saved[0].xml,'<Faktura>test</Faktura>');assert.equal(saved[0].project,'project');
 const bad={...row(8),invoiceHash:entry.invoiceHash};n.setupTest(root,async()=>({content:Buffer.from('changed').toString('base64')}),[bad]);await n.testAssignment(options,'project',bad.ksefNumber);assert.equal(saved.length,1);
 n.setupTest(root,async()=>({payload:{source:{app:'robisie',id:'other'}}}),[{...row(9),billId:'bill'}]);await n.testAssignment(options,'project',row(9).ksefNumber);assert.equal(saved.length,1);
});
test('purchase assignment previews verified XML and forwards only chosen row indices',async()=>{
 const {n,root}=await setup(),bytes=new TextEncoder().encode('<Faktura>rows</Faktura>'),entry={...row(10),invoiceHash:await D.digest(bytes)},calls=[];
 n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}),[entry]);
 const options={projects:[{id:'p',name:'Test'}],preview:async({xml})=>{assert.equal(xml,'<Faktura>rows</Faktura>');calls.push('preview');return {items:[{index:1},{index:2},{index:3}],canSelect:true};},loadLinks:async()=>[],assign:async args=>{calls.push('assign');assert.equal(args.project,'p');assert.deepEqual(Array.from(args.indices),[1,3]);return {document:{}};}};
 await n.testAssignment(options,{project:'p',indices:[1,3]},entry.ksefNumber);assert.deepEqual(calls,['preview','assign']);assert.ok(root.innerHTML.includes('Rozlicz zakup w Robisię'));assert.ok(root.innerHTML.includes('purchaseKsef='+entry.ksefNumber));
});

test('existing purchase assignments reopen selection and carry the previous state into edit',async()=>{
 const {n,root}=await setup(),bytes=new TextEncoder().encode('<Faktura>edit</Faktura>'),entry={...row(11),invoiceHash:await D.digest(bytes)},known={ksef_number:entry.ksefNumber,project_id:'old-project',kind:'purchases',selected_indices:[1,3]},saved=[];
 n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}),[entry]);
 await n.testAssignment({projects:[{id:'old-project',name:'Test'}],preview:async()=>({canSelect:true,items:[]}),loadLinks:async()=>[known],assign:async args=>{saved.push(args);return {document:{}};}},{project:'old-project',indices:[2]},entry.ksefNumber,[known]);
 assert.equal(saved.length,1);assert.equal(saved[0].previous.project_id,'old-project');assert.deepEqual(Array.from(saved[0].previous.selected_indices),[1,3]);assert.deepEqual(Array.from(saved[0].indices),[2]);assert.match(root.innerHTML,/Edytuj przypisanie/);
});

test('matching selected amount requires reviewed replacement or explicit separate purchase, cancellation writes nothing',async()=>{
 for(const decision of ['existing-purchase','',null]){
  const {n,root}=await setup(),bytes=new TextEncoder().encode('<Faktura>rows</Faktura>'),entry={...row(8),currency:'PLN',grossAmount:150,invoiceHash:await D.digest(bytes)},calls=[];
  n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}),[entry]);
  const options={projects:[{id:'p',name:'Test'}],preview:async()=>({currency:'PLN',gross:150,canSelect:true,items:[{index:1,gross:100},{index:2,gross:50}]}),findPurchases:async()=>({revision:42,payload:{purchases:[{id:'existing-purchase',amount:100}]}}),loadLinks:async()=>[],assign:async args=>{calls.push(args);return {document:{}};}};
  await n.testAssignment(options,{project:'p',indices:[1]},entry.ksefNumber,[],decision);
  assert.equal(calls.length,decision===null?0:1);if(calls.length){assert.equal(calls[0].replacement,decision||null);assert.equal(calls[0].projectRevision,42);}
 }
});

test('demand action belongs to sales invoices and rejects XML with an invalid KSeF hash before loading balances',async()=>{
 const {n,root}=await setup(),entry={...row(24),invoiceHash:'wrong'},calls=[];
 n.setupTest(root,async()=>({content:Buffer.from('<Faktura/>').toString('base64')}),[entry],'sales');
 assert.ok(root.innerHTML.includes('data-kf="demand"'));assert.ok(root.innerHTML.includes('Wezwanie do zapłaty'));
 await n.testDemand({loadLinks:async()=>{calls.push('links');return [];}},entry.ksefNumber);
 assert.match(n.testState().message,/skrótem/);assert.deepEqual(calls,[]);
 n.setupTest(root,async()=>({}),[entry]);assert.ok(!root.innerHTML.includes('data-kf="demand"'));
 await n.testDemand({},entry.ksefNumber);assert.match(n.testState().message,/sprzedażową/);
});

test('negative purchase correction uses verified XML and dedicated cost RPC; cancel writes no cost',async()=>{
 for(const choice of [{project:'p',amount:120,revision:7},null]){
  const {n,root}=await setup(choice),bytes=new TextEncoder().encode('<Faktura>korekta</Faktura>'),entry={...row(10),invoiceType:'Kor',grossAmount:-200,invoiceHash:await D.digest(bytes)},calls=[];
  n.setupTest(root,async()=>({content:Buffer.from(bytes).toString('base64')}),[entry]);
  const options={projects:[{id:'p',name:'Test'}],preview:async()=>({gross:-200,items:[],currency:'PLN'}),loadLinks:async()=>[],storeMetadata:async()=>calls.push('metadata'),storeXml:async(number,xml)=>{assert.equal(xml,'<Faktura>korekta</Faktura>');calls.push('xml');},correctCostContext:async()=>({remaining:200,projects:[{id:'p'}]}),applyCostCorrection:async args=>{assert.equal(args.amount,120);assert.equal(args.project,'p');assert.equal(args.revision,7);calls.push('cost');return {project:{}};},assign:async()=>assert.fail('Correction must not use the reference-only path')};
  await n.testAssignment(options,'p',entry.ksefNumber);assert.deepEqual(calls,choice?['metadata','xml','cost']:['metadata','xml']);
 }
});
test('KSeF rate limit waits, retries the same read and supports cancelling the countdown',async()=>{
 const {n,root}=await setup(undefined,{fastTimers:true});let calls=0;n.setupTest(root,async()=>{if(++calls===1)throw Object.assign(Error('Limit'),{status:429,retryAfter:2});return {invoices:[]};});await n.run(signal=>n.historyRead({action:'ksef-list',from:'2026-01-01'},signal));assert.equal(calls,2);assert.equal(n.testState().busy,false);
 calls=0;n.setupTest(root,async()=>{calls++;throw Object.assign(Error('Limit'),{status:429,retryAfter:60});});const pending=n.run(signal=>n.historyRead({action:'ksef-list'},signal));await new Promise(r=>setImmediate(r));assert.match(n.testState().message,/Kontynuacja za/);root.onclick({target:{closest:()=>({dataset:{kf:'cancel'}})},stopPropagation(){}});await pending;assert.equal(calls,1);assert.match(n.testState().message,/Anulowano/);
});
test('successful history scan persists its date and next session checks recent storage dates',async()=>{
 const entries=new Map(),storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)},requests=[];const {n,root}=await setup(undefined,{storage});const integration={userId:'test-owner',index:async()=>[],stock:async()=>[],storeMetadata:async()=>{}};const api=async body=>{requests.push(body);return {invoices:[],hasMore:false,ticket:'test'};};
 const settle=async()=>{for(let i=0;i<100&&n.testState().busy;i++)await new Promise(r=>setTimeout(r,1));assert.equal(n.testState().busy,false);};
 n.mountStock(root,api,integration);await settle();assert.equal(requests[0].from,'2026-01-01');assert(entries.get('robisie-ksef-history-v1:test-owner'));n.reset();requests.length=0;n.mountStock(root,api,integration);await settle();assert.equal(requests.length,1);assert(requests[0].from>'2026-09-01');n.reset();
});
test('failed history resumes completed ranges and hides a row even while corrections are blocked',async()=>{
 const {n,root}=await setup();let requests=[],fail=true,hidden=false;const docs=[],goods=()=>[{metadata:row(1),item:{index:1,name:'Towar do ukrycia',unit:'szt.',gross:100},capacity:1,assigned:0,returned:0,available:1,hidden}];const integration={index:async()=>docs,stock:async()=>goods(),storeMetadata:async()=>{},setHidden:async value=>{assert.equal(value.index,1);hidden=value.hidden;}};
 const api=async body=>{requests.push(body.from);if(requests.length===2&&fail){fail=false;throw Error('Test sieci');}return {invoices:[],hasMore:false};};const settle=async()=>{for(let i=0;i<100&&n.testState().busy;i++)await new Promise(r=>setTimeout(r,1));};n.mountStock(root,api,integration);await settle();assert.equal(n.testState().state.stockCorrectionsIncomplete,true);
 const click=data=>root.onclick({target:{closest:()=>({dataset:data})},stopPropagation(){}});click({kf:'stock-hide',number:number(1),index:'1',hidden:'true'});await settle();assert(hidden);assert.doesNotMatch(root.innerHTML,/<strong>Towar do ukrycia<\/strong>/);click({kf:'stock-refresh'});await settle();assert.equal(requests.filter(x=>x==='2026-01-01').length,1);assert.equal(n.testState().state.stockCorrectionsIncomplete,false);n.reset();
});
