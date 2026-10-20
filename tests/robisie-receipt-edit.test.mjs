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
 const api={stageInvoices:async()=>[],project:async()=>structuredClone(db),restoreSession:()=>null,getSession:()=>({user:{id:'test'}}),saveProject:async(row,payload)=>{
  assert.equal(row.revision,db.revision);const patch=changedFields(row.payload,payload),stored=structuredClone(db.payload);
  for(const key of patch.p_remove_keys)delete stored[key];Object.assign(stored,structuredClone(patch.p_fields));stored._undo=structuredClone(payload._undo);assert.deepEqual(stored,payload);
  db.payload=stored;db.revision++;return structuredClone(db);
 }};
 const context=vm.createContext({console,crypto,structuredClone,URL,FormData:class extends Map{constructor(fields){super(Object.entries(fields));}},setTimeout(fn,ms){const timer=setTimeout(fn,ms);timers.push(timer);return timer;},clearTimeout,confirm:()=>accept,fetch:async()=>({ok:true,json:async()=>[]}),window:{location:{href:'https://test.local/app/robisie/'},scrollY:0,scrollTo(){},addEventListener(){}},document:{body:{style:{}},documentElement:{style:{}},querySelector:node,querySelectorAll:()=>[],addEventListener(type,fn){events.set(type,fn);}}});
 const mod=new vm.SourceTextModule(source+`\nexport {receiptDialog};export const data=()=>selected;export function setup(row){all=[structuredClone(row)];selected=structuredClone(row);config={revision:1,payload:{catalog:[],company:{}}};configBaseline=structuredClone(config);view='payments';projectDirty=settingsDirty=dirty=false;render();}`,{context});
 await mod.link(spec=>{const values=spec.includes('purchase-settlement-form')?PurchaseSettlementForm:spec.includes('purchase-settlement')?PurchaseSettlement:spec.includes('invoices')?BI:spec.includes('autosave')?Auto:spec.includes('core')?C:spec.includes('pdf')?PDF:api;return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});});
 await mod.evaluate();await new Promise(resolve=>setImmediate(resolve));mod.namespace.setup(db);
 return {app:mod.namespace,node,accept(value){accept=value;},async click(action,id,extra={}){await events.get('click')({target:{closest:()=>({dataset:{action,id,...extra},isConnected:true})}});},async submit(fields){await node('#modal-form').onsubmit({preventDefault(){},target:fields});},close(){timers.forEach(clearTimeout);}};
}
const fixture=()=>{const payload=C.newProject('Test','Test');payload.receipts=[{id:'a',kind:'materials',date:'2026-10-12',amount:1000,note:'Zaliczka'}];payload.purchases=[{id:'p',amount:4725.65,charge:4725.65,paid:false,paidAmount:0}];return {id:'p',contract_number:'UUR',revision:1,payload};};
test('receipt can be edited, deleted directly, and remains deleted after reopening; balances recalculate',async()=>{
 const db=fixture(),ui=await open(db);
 try{
  assert.match(ui.node('#app').innerHTML,/data-action="receipt-delete"/);
  await ui.click('receipt-edit','a');assert.match(ui.node('#dialog').innerHTML,/Edytuj wpłatę/);
  await ui.submit({amount:'700',date:'2026-10-11',kind:'materials',note:'Poprawiona zaliczka'});
  assert.equal(db.payload.receipts[0].amount,700);assert.equal(db.payload.receipts[0].note,'Poprawiona zaliczka');assert.equal(C.purchaseTotals(db.payload).balance,-4025.65);
  ui.accept(false);await ui.click('receipt-delete','a');assert.equal(db.payload.receipts.length,1);
  ui.accept(true);await ui.click('receipt-delete','a');assert.equal(db.payload.receipts.length,0);assert.equal(C.purchaseTotals(db.payload).balance,-4725.65);assert.equal(db.payload.purchases.length,1);
 }finally{ui.close();}
 const reopened=await open(db);try{assert.equal(reopened.app.data().payload.receipts.length,0);assert.doesNotMatch(reopened.node('#app').innerHTML,/data-action="receipt-edit"/);}finally{reopened.close();}
});
test('invoice-linked manual receipts expose edit/delete; confirmed reduction detaches allocations atomically',async()=>{
 const db=fixture();db.payload.purchases[0].receiptPayments={a:900};db.payload.invoiceSettlements=[{id:'fv',number:'FV',total:1000,allocations:[],existingReceipts:[{id:'a',amount:1000,kind:'materials'}]}];
 const ui=await open(db);try{
  assert.match(ui.node('#app').innerHTML,/Edytuj \/ usuń wpłaty/);
  await ui.click('receipt-edit','a');ui.accept(false);await ui.submit({amount:'500',date:'2026-10-12',kind:'materials',note:''});assert.equal(db.payload.receipts[0].amount,1000);
  ui.accept(true);await ui.submit({amount:'500',date:'2026-10-12',kind:'materials',note:''});assert.equal(db.payload.receipts[0].amount,500);assert.equal(db.payload.purchases[0].receiptPayments,undefined);assert.equal(db.payload.invoiceSettlements[0].existingReceipts.length,0);assert.equal(C.purchaseTotals(db.payload).advances,500);
 }finally{ui.close();}
});
test('historical receipts with unknown dates can be corrected and removed in their dialog',async()=>{
 const db=fixture();db.payload.receipts[0].date='';const ui=await open(db);try{
  ui.app.receiptDialog('a');assert.match(ui.node('#dialog').innerHTML,/name="date" type="date"\s+value="" >/);
  await ui.submit({amount:'600',date:'',kind:'materials',note:'Historyczna'});assert.equal(db.payload.receipts[0].amount,600);assert.equal(db.payload.receipts[0].date,'');
  ui.app.receiptDialog('a');await ui.node('[data-action="delete"]').onclick();assert.equal(db.payload.receipts.length,0);
 }finally{ui.close();}
});

test('bulk purchase settlement opens preview, commits once and persists allocations after reopening',async()=>{
 const db=fixture(),ui=await open(db);try{
  await ui.click('nav',undefined,{view:'purchases'});assert.match(ui.node('#app').innerHTML,/Rozlicz zakupy/);
  await ui.click('purchases-settle');assert.match(ui.node('#dialog').innerHTML,/Podgląd rozliczenia/);
  ui.node('#bulk-existing-0').value='1000';ui.node('#bulk-select-available').onclick();assert.match(ui.node('#bulk-preview').innerHTML,/Rozliczony częściowo/);
  assert.equal(db.payload.purchases[0].receiptPayments,undefined);
  await ui.submit({});assert.equal(db.revision,2);assert.equal(db.payload.purchases[0].receiptPayments.a,1000);assert.equal(C.purchaseTotals(db.payload).advances,1000);assert.equal(db.payload.receipts.length,1);
 }finally{ui.close();}
 const reopened=await open(db);try{assert.equal(reopened.app.data().payload.purchases[0].receiptPayments.a,1000);assert.equal(C.purchasePayment(reopened.app.data().payload.purchases[0]).remaining,3725.65);}finally{reopened.close();}
});
