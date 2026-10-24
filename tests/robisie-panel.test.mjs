import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as C from '../app/robisie/core.js';
import * as Auto from '../app/robisie/autosave.js';
import * as BI from '../app/robisie/invoices.js';
import * as Completion from '../app/robisie/completion.js';
const source=await readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');
async function setup(){
 const nodes=new Map(),listeners=new Map(),messages=[],calls=[];
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',open:false,isConnected:true,style:{},querySelector:node,querySelectorAll:()=>[],classList:{toggle(){}},close(){this.open=false;}});return nodes.get(key);};
 let readStages=async()=>[];
 const api={restoreSession:()=>null,stageInvoices:id=>readStages(id)};
 const context=vm.createContext({console,crypto,URL,structuredClone,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},fetch:async()=>({ok:true,json:async()=>[]}),window:{location:{href:'https://cleanfleet.pl/app/robisie/',origin:'https://cleanfleet.pl'},parent:{postMessage:(...args)=>messages.push(args)},addEventListener(){},scrollTo(){}},document:{body:{style:{}},documentElement:{style:{}},querySelector:node,querySelectorAll:()=>[],addEventListener:(name,callback)=>listeners.set(name,callback)}});
 const module=new vm.SourceTextModule(source+`
 export function setPanel(row,documents=[]){all=[structuredClone(row)];selected=structuredClone(row);config={payload:{catalog:[],company:{}},revision:1};configBaseline=structuredClone(config);view='overview';dirty=projectDirty=settingsDirty=false;stageInvoiceCache.clear();if(documents.length)stageInvoiceCache.set(row.id,documents);render();}
 export const panelState=()=>({selected,view});export {overviewTasks,overviewEvents,loadStageInvoices};
 export function stubActions(push){purchaseDialog=async id=>push(['purchase',id]);receiptDialog=id=>push(['receipt',id]);settlePurchasesDialog=async()=>push(['settle']);completionDialog=async()=>push(['finish']);pdfDialog=()=>push(['pdf']);journalDialog=id=>push(['journal',id]);tripDialog=id=>push(['trip',id]);settlementDialog=async()=>push(['settlement']);}
 `,{context});
 await module.link(spec=>{const values=spec.includes('core.js')?C:spec.includes('autosave')?Auto:spec.includes('invoices.js')?BI:spec.includes('completion.js')?Completion:spec.includes('api.js')?api:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});await module.evaluate();await new Promise(resolve=>setImmediate(resolve));module.namespace.stubActions(value=>calls.push(value));
 const row={id:'project',contract_number:'UUR-RS/2026/10/001',revision:1,payload:C.newProject('Test','Inwestor')};
 return {n:module.namespace,node,row,messages,calls,setReader:reader=>readStages=reader,click:async(action,extra={})=>{const b={dataset:{action,...extra},isConnected:true,href:'https://cleanfleet.pl/bill/?new=1&brand=robisie&source=project'};await listeners.get('click')({preventDefault(){},target:{closest:()=>b}});}};
}
test('investment panel exposes direct actions, truthful receipts and actionable missing documents',async()=>{
 const {n,node,row}=await setup();row.payload.works=[{id:'w',name:'Praca',qty:2,price:100,done:true}];row.payload.purchases=[{id:'cost',shop:'<script>',description:'Materiały',date:'2026-10-20',amount:500,charge:500,paid:false,paidAmount:0}];row.payload.receipts=[{id:'cash',kind:'work',amount:50,date:'2026-10-21'},{id:'advance',kind:'materials',amount:200,date:'2026-10-22'}];
 const invoice={id:'invoice',number:'A1/10/2026',status:'accepted',payload:{issueDate:'2026-10-23',currency:'PLN',buyer:{name:'Inwestor'},lines:[{qty:'1',price:'1000.00'}]}};n.setPanel(row,[invoice]);
 const html=node('#app').innerHTML;assert.match(html,/Szybkie działania/);assert.match(html,/250,00\s+zł/);assert.match(html,/Zakup wymaga faktury/);assert.match(html,/data-action="purchase-edit"[^>]*data-id="cost"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|class="tile"|Otwórz moduł|class="savebar"/);assert.match(html,/<details class="card panel-documents"><summary>Dokumenty inwestycji/);assert.match(html,/WYM-RS\/2026\/10\/001/);assert.ok(html.indexOf('Szybkie działania')<html.indexOf('Podsumowanie finansowe'));
 assert.equal(n.overviewEvents(row.payload,[invoice])[0].title,invoice.number);assert.equal(row.payload.receipts.length,2);
});
test('panel buttons enter the existing forms and invoice opens in Pack for the current project',async()=>{
 const {n,row,click,calls,messages}=await setup();n.setPanel(row);
 for(const action of ['purchase-add','receipt-add','purchases-settle','finish','print','journal-add','trip-add','settlement-open'])await click(action);
 assert.deepEqual(calls.map(c=>c[0]),['purchase','receipt','settle','finish','pdf','journal','trip','settlement']);
 await click('stage-invoice');assert.equal(messages.length,1);assert.equal(messages[0][0].type,'robisie-pack-open-url');assert.match(messages[0][0].url,/source=project/);assert.equal(messages[0][1],'https://cleanfleet.pl');
 row.payload.status='zakonczona';n.setPanel(row);assert.equal(n.panelState().selected.payload.status,'zakonczona');
});
test('late invoice refresh cannot replace the panel of another investment',async()=>{
 const {n,node,row,setReader}=await setup();n.setPanel(row);let release;setReader(()=>new Promise(resolve=>release=resolve));const pending=n.loadStageInvoices();
 const other={...row,id:'other',payload:{...row.payload,name:'Druga inwestycja'}};n.setPanel(other);release([{id:'late',number:'NIE-TA-FAKTURA',payload:{issueDate:'2026-10-23',currency:'PLN',lines:[]}}]);await pending;
 assert.equal(n.panelState().selected.id,'other');assert.doesNotMatch(node('#app').innerHTML,/NIE-TA-FAKTURA/);
});
