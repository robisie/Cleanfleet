import * as Completion from '../app/robisie/completion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as PurchaseSettlement from '../app/robisie/purchase-settlement.js';
import * as PurchaseSettlementForm from '../app/robisie/purchase-settlement-form.js';
import * as C from '../app/robisie/core.js';
import * as BI from '../app/robisie/invoices.js';
import * as Auto from '../app/robisie/autosave.js';
import * as PDF from '../app/robisie/pdf.js';
import {changedFields} from '../app/robisie/api.js';
const source=await fs.readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');
async function open(db){
 const nodes=new Map(),events=new Map(),timers=[];let accept=true;
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',style:{},dataset:{},open:false,isConnected:true,querySelector:node,querySelectorAll:()=>[],focus(){},showModal(){this.open=true;},close(){this.open=false;},classList:{toggle(){}}});return nodes.get(key);};
 const api={finishProject:async row=>{assert.equal(row.revision,db.revision);db.finishCalls=(db.finishCalls||0)+1;db.payload.status='zakonczona';db.revision++;return structuredClone(db);},addProjectEarnings:async(row,amount)=>{assert.equal(row.revision,db.revision);db.earningsCalls=(db.earningsCalls||0)+1;db.earnings||={id:'earning',my_amount:amount,work_date:db.payload.handover.date};return structuredClone(db.earnings);},projectEarnings:async()=>structuredClone(db.earnings||null),stageInvoices:async()=>structuredClone(db.documents||[]),project:async()=>structuredClone(db),restoreSession:()=>null,getSession:()=>({user:{id:'test'}}),saveProject:async(row,payload)=>{
  assert.equal(row.revision,db.revision);const patch=changedFields(row.payload,payload),stored=structuredClone(db.payload);
  for(const key of patch.p_remove_keys)delete stored[key];Object.assign(stored,structuredClone(patch.p_fields));stored._undo=structuredClone(payload._undo);assert.deepEqual(stored,payload);
  db.payload=stored;db.revision++;return structuredClone(db);
 }};
 const context=vm.createContext({console,crypto,structuredClone,URL,FormData:class extends Map{constructor(fields){super(Object.entries(fields));}getAll(key){const value=this.get(key);return Array.isArray(value)?value:value?[value]:[];}},setTimeout(fn,ms){const timer=setTimeout(fn,ms);timers.push(timer);return timer;},clearTimeout,confirm:()=>accept,fetch:async()=>({ok:true,json:async()=>[]}),window:{location:{href:'https://test.local/app/robisie/'},scrollY:0,scrollTo(){},addEventListener(){}},document:{body:{style:{}},documentElement:{style:{}},querySelector:node,querySelectorAll:()=>[],addEventListener(type,fn){events.set(type,fn);}}});
 const mod=new vm.SourceTextModule(source+`\nexport {receiptDialog};export const data=()=>selected;export function setup(row){all=[structuredClone(row)];selected=structuredClone(row);config={revision:1,payload:{catalog:[],company:{}}};configBaseline=structuredClone(config);view='payments';projectDirty=settingsDirty=dirty=false;render();}`,{context});
 await mod.link(spec=>{const values=spec.includes('completion.js')?Completion:spec.includes('purchase-settlement-form')?PurchaseSettlementForm:spec.includes('purchase-settlement')?PurchaseSettlement:spec.includes('invoices')?BI:spec.includes('autosave')?Auto:spec.includes('core')?C:spec.includes('pdf')?PDF:api;return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});
 await mod.evaluate();await new Promise(resolve=>setImmediate(resolve));mod.namespace.setup(db);
 return {app:mod.namespace,node,accept(value){accept=value;},async click(action,id,extra={}){await events.get('click')({preventDefault(){},target:{closest:()=>({dataset:{action,id,...extra},isConnected:true})}});},async submit(fields){await node('#modal-form').onsubmit({preventDefault(){},target:fields});},close(){timers.forEach(clearTimeout);}};
}
const fixture=()=>{const payload=C.newProject('Test','Test');payload.receipts=[{id:'a',kind:'materials',date:'2026-10-12',amount:1000,note:'Zaliczka'}];payload.purchases=[{id:'p',amount:4725.65,charge:4725.65,paid:false,paidAmount:0}];return {id:'p',contract_number:'UUR',revision:1,payload};};

test('completion shows separate balances and counts invoice-linked receipts only once',()=>{
 const p=C.newProject('A','B');p.works=[{id:'w',qty:1,price:1000,done:true},{id:'u',qty:1,price:600,done:false}];p.workDiscount=10;p.workCredit=50;
 p.purchases=[{id:'p',amount:500,charge:500,paidAmount:0}];
 p.receipts=[{id:'m',kind:'materials',amount:600},{id:'w',kind:'work',amount:200}];
 p.invoiceSettlements=[{id:'fv',number:'FV',total:600,allocations:[],existingReceipts:[{id:'m',kind:'materials',amount:600}]}];
 const s=Completion.summary(p);assert.equal(s.workCost,850);assert.equal(s.workReceived,200);assert.equal(s.materialReceived,600);assert.equal(s.materialBalance,-100);assert.equal(s.due,650);assert.equal(s.refund,100);assert.equal(s.unallocated,500);assert.equal(s.unfinished,1);
 const html=Completion.markup({...p,name:'<script>'},[{id:'a',number:'FV',status:'issued',payload:{currency:'PLN'}}]);assert.match(html,/Materiały/);assert.match(html,/Robocizna/);assert.match(html,/completion-invoice-link/);assert.doesNotMatch(html,/<script>/);
});
test('unpaid purchase documents are fully included, while invoices alone never count as received money',()=>{
 const p=C.newProject('A','B');p.purchases=[{id:'p',amount:640.52,charge:640.52,paid:false}];
 const s=Completion.summary(p);assert.equal(s.materialCost,640.52);assert.equal(s.materialReceived,0);assert.equal(s.due,640.52);assert.equal(Completion.status(p),'Do rozliczenia');
});
test('fully allocated receipt settles materials without adding a second inflow; fractional cents stay exact',()=>{
 const p=C.newProject('A','B');p.purchases=[{id:'p',amount:.3,charge:.3,paidAmount:0,receiptPayments:{a:.1,b:.2}}];p.receipts=[{id:'a',kind:'materials',amount:.1},{id:'b',kind:'materials',amount:.2}];
 const s=Completion.summary(p);assert.equal(s.materialReceived,.3);assert.equal(s.due,0);assert.equal(s.unallocated,0);assert.equal(s.open,false);assert.equal(Completion.status(p),'Rozliczona');
});
test('completion cancellation preserves status; confirmation closes without earnings; earnings are an explicit next step',async()=>{
 const db=fixture();db.payload.handover={date:'2026-10-22',accepted:true};db.payload.works=[{id:'w',qty:1,price:1000,done:true}];const ui=await open(db);
 try{
  await ui.click('nav',undefined,{view:'handover'});await ui.click('finish');assert.equal(db.payload.status,'przygotowanie');assert.match(ui.node('#dialog').innerHTML,/Zamknięcie inwestycji/);assert.match(ui.node('#dialog').innerHTML,/Do przypisania do zakupów/);
  ui.accept(false);await ui.submit({completionDate:'2026-10-22',completionAccepted:'on'});assert.equal(db.finishCalls,undefined);assert.equal(db.earnings,undefined);
  ui.accept(true);await ui.submit({completionDate:'2026-10-22',completionAccepted:'on'});assert.equal(db.payload.status,'zakonczona');assert.equal(db.finishCalls,1);assert.equal(db.earnings,undefined);assert.match(ui.node('#app').innerHTML,/Dodaj do moich zarobków/);assert.match(ui.node('#app').innerHTML,/Do rozliczenia/);
  await ui.click('earnings-add');assert.match(ui.node('#dialog').innerHTML,/Dodaj do moich zarobków/);await ui.submit({});assert.equal(db.earnings.my_amount,1000);assert.equal(db.earningsCalls,1);assert.match(ui.node('#app').innerHTML,/Zobacz w moich zarobkach/);
  await ui.click('earnings-add');assert.equal(db.earningsCalls,1);
 }finally{ui.close();}
});
test('quick work payment returns to a refreshed closeout and never duplicates on closing',async()=>{
 const db=fixture();db.payload.purchases=[];db.payload.receipts=[];db.payload.works=[{id:'w',qty:1,price:1000,done:true}];const ui=await open(db);
 try{
  await ui.click('nav',undefined,{view:'handover'});await ui.click('finish');await ui.click('completion-work-paid');assert.match(ui.node('#dialog').innerHTML,/Potwierdź otrzymanie wpłaty/);
  await ui.submit({date:'2026-10-22'});assert.equal(db.payload.receipts.length,1);assert.equal(db.payload.receipts[0].amount,1000);assert.equal(Completion.summary(db.payload).due,0);assert.match(ui.node('#dialog').innerHTML,/Zamknięcie inwestycji/);
  await ui.submit({completionDate:'2026-10-22',completionAccepted:'on'});assert.equal(db.payload.receipts.length,1);assert.equal(db.payload.status,'zakonczona');assert.equal(db.earnings,undefined);
 }finally{ui.close();}
});
test('bulk material allocation from closeout uses the existing advance and returns to updated summary',async()=>{
 const db=fixture();db.payload.purchases[0].amount=1000;db.payload.purchases[0].charge=1000;const ui=await open(db);
 try{
  await ui.click('finish');await ui.click('completion-purchases');ui.node('#bulk-existing-0').value='1000';ui.node('#bulk-select-available').onclick();await ui.submit({});
  assert.equal(db.payload.receipts.length,1);assert.equal(db.payload.purchases[0].receiptPayments.a,1000);assert.equal(Completion.summary(db.payload).open,false);assert.match(ui.node('#dialog').innerHTML,/Zamknięcie inwestycji/);
 }finally{ui.close();}
});
test('server-side revision conflicts leave the completion open without creating earnings',async()=>{
 const db=fixture(),ui=await open(db);try{
  await ui.click('finish');db.revision++;await ui.submit({completionDate:'2026-10-22',completionAccepted:'on'});assert.notEqual(db.payload.status,'zakonczona');assert.equal(db.earnings,undefined);assert.equal(ui.node('#dialog').open,true);
 }finally{ui.close();}
});
