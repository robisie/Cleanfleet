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
const Zip=createRequire(import.meta.url)('../app/vendor/jszip-3.10.1.min.js');
async function setup(){
 const nodes=new Map(),blobUrls=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',value:'',innerHTML:'',dataset:{}});return nodes.get(key);};
 const root={innerHTML:'',querySelector:node,querySelectorAll:()=>[]};let count=0;
 const context=vm.createContext({console,crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Blob,File,Map,Set,AbortController,DOMException,atob,btoa,setTimeout,clearTimeout,URL:{createObjectURL:blob=>{const key='blob:'+(count++);blobUrls.set(key,blob);return key;},revokeObjectURL:key=>blobUrls.delete(key)},window:{JSZip:Zip,CFKsefRenderer:{generateInvoice:async()=>new Blob(['%PDF-1.7 fixture'])}},DOMParser:class{parseFromString(){return {doctype:null,documentElement:{localName:'Faktura'},getElementsByTagName:()=>[]};}},document:{}});
 const code=await readFile(new URL('../bill/ksef.js',import.meta.url),'utf8');
 const m=new vm.SourceTextModule(code+`\nexport function setupTest(node,call,rows=[],kind='purchases'){root=node;api=call;state=initial();state.kind=kind;state.loaded=true;state.rows=rows;state.query={kind:state.kind,from:state.from,to:state.to,dateType:state.dateType,sort:'Desc'};state.selected=new Set(rows.map(r=>r.ksefNumber));draw();}export {run,load,downloadSelected};export async function testAssignment(options,project,number,known=[],duplicateChoice){if(duplicateChoice!==undefined)chooseDuplicate=async()=>duplicateChoice;integration=options;assignments=known;chooseInvestment=async()=>project;await run(signal=>assignInvestment(number,signal));return message;}export async function testDemand(options,number){integration=options;await run(signal=>paymentDemand(number,signal));return message;}export function testState(){return {state,ready,message,busy:!!controller};}`,{context});
 await m.link(spec=>{const values=spec.includes('ksef-relations')?Relations:spec.includes('stock.js')?Stock:spec.includes('cost-suggestions')?Suggestions:spec.includes('purchase-import')?Import:spec.includes('ksef-data')?D:C;return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();return {n:m.namespace,root,blobUrls,node};
}
const number=i=>'6351861297-20261016-123456789ABC-'+String(i).padStart(2,'0');
const row=i=>({ksefNumber:number(i),invoiceNumber:'FV/'+i,issueDate:'2026-10-16',seller:{nip:'6351861297',name:'<img src=x onerror=alert(1)>'},buyer:{name:'Nabywca'},grossAmount:100,currency:'PLN'});
test('Bill has only invoice tabs; Robisię mounts the standalone Towar view with its inventory',async()=>{
 const {n,root}=await setup();n.setupTest(root,async()=>({invoices:[],hasMore:false}),[]);assert.ok(!root.innerHTML.includes('data-kf="stock"'));
 let loaded=false;n.mountStock(root,async()=>({invoices:[],page:0,hasMore:false}),{index:async()=>[],storeMetadata:async()=>{},stock:async()=>{loaded=true;return [{metadata:row(1),item:{index:1,name:'Farba',unit:'szt.',gross:400},capacity:4,assigned:2,returned:0,available:2}];}});
 for(let i=0;i<50&&n.testState().busy;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(loaded,true);assert.match(root.innerHTML,/Pozostało: 2/);assert.match(root.innerHTML,/data-kf="stock-assign"/);assert.ok(!root.innerHTML.includes('data-kf="kind"'));n.unmount();
});
test('KSeF panel escapes metadata, merges pages and changes month without keeping old selection',async()=>{
 const {n,root}=await setup(),calls=[];n.setupTest(root,async body=>{calls.push(body);return {invoices:[row(body.page+1)],page:body.page,hasMore:body.page===0,ticket:'encrypted'};});
 await n.run(n.load);await n.run(signal=>n.load(signal,true));assert.equal(n.testState().state.rows.length,2);assert.equal(calls[1].page,1);assert.equal(calls[1].ticket,'encrypted');assert.match(root.innerHTML,/&lt;img src=x/);assert.ok(!root.innerHTML.includes('<img src=x'));
 root.onchange({target:{id:'kf-all',checked:true,dataset:{}}});assert.equal(n.testState().state.selected.size,2);root.onchange({target:{id:'kf-month',value:'2026-02',dataset:{}}});assert.equal(n.testState().state.from,'2026-02-01');assert.equal(n.testState().state.to,'2026-02-28');assert.equal(n.testState().state.rows.length,0);assert.equal(n.testState().state.selected.size,0);assert.equal(n.testState().state.query,null);
});
test('selected PDFs use one bulk export, verify AES/hashes and produce only selected PDFs in ZIP',async()=>{
 const {n,root,blobUrls}=await setup(),xml=new TextEncoder().encode('<Faktura>Łódź</Faktura>'),rows=[row(1),row(2)];for(const r of rows)r.invoiceHash=await D.digest(xml);const archive=new Zip();for(const r of rows)archive.file(r.ksefNumber+'.xml',xml);const plain=await archive.generateAsync({type:'uint8array',compression:'STORE'});const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(16)),aes=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv},aes,plain));const b64=bytes=>Buffer.from(bytes).toString('base64'),calls=[];
 n.setupTest(root,async(body,options)=>{calls.push(body.action);if(body.action==='ksef-export-start')return {ticket:'export',key:b64(key),iv:b64(iv)};if(body.action==='ksef-export-status')return {status:'ready',invoiceCount:2,size:plain.length,parts:[{ticket:'part',partSize:plain.length,partHash:await D.digest(plain)}]};if(body.action==='ksef-export-part'){assert.equal(options.binary,true);return encrypted;}throw Error('Unexpected direct invoice request');},rows);
 await n.run(n.downloadSelected);const {ready,message}=n.testState();assert.ok(ready,message);assert.equal(ready.count,2);const zip=await Zip.loadAsync(await blobUrls.get(ready.url).arrayBuffer());assert.deepEqual(Object.keys(zip.files).sort(),rows.map(r=>r.ksefNumber+'.pdf').sort());assert.deepEqual(calls,['ksef-export-start','ksef-export-status','ksef-export-part']);assert.match(root.innerHTML,/Zapisz paczkę ZIP/);
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
 n.setupTest(root,async body=>{calls.push(body.action);assert.equal(body.action,'document');assert.equal(body.id,'bill-correction');return {status:'accepted',ksef_number:r.ksefNumber,xml};},[r]);assert.match(root.innerHTML,/Źródło: Bill/);assert.match(root.innerHTML,/Korekta/);await n.run(n.downloadSelected);assert.ok(n.testState().ready,n.testState().message);const zip=await Zip.loadAsync(await blobUrls.get(n.testState().ready.url).arrayBuffer());assert.ok(zip.file(r.ksefNumber+'.pdf'));assert.deepEqual(calls,['document']);
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
