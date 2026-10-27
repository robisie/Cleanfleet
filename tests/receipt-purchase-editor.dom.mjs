import * as ReceiptImport from '../bill/receipt-import.js';
import * as PurchaseItems from '../app/robisie/purchase-items.js';
import * as PurchasePaymentForm from '../app/robisie/purchase-payment-form.js';
import * as PurchasePayments from '../app/robisie/purchase-payments.js';
import * as BI from '../app/robisie/invoices.js';
import * as PDF from '../app/robisie/pdf.js';
// Run with SHOPPING_DOM_MODULE pointing to an installed happy-dom module (20.8.4).
// Uses a synthetic API and DOM, never connects to a production account.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import * as C from '../app/robisie/core.js';import * as Shopping from '../app/robisie/shopping.js';import * as Auto from '../app/robisie/autosave.js';
const {Window}=await import(process.env.SHOPPING_DOM_MODULE||'happy-dom');
async function setup(){
 const window=new Window({url:'https://example.test/app/robisie/'});window.document.body.innerHTML='<div id="app"></div><dialog id="dialog"></dialog><div id="toast"></div>';window.scrollTo=()=>{};window.document.querySelector('#dialog').showModal=function(){this.open=true;};window.document.querySelector('#dialog').close=function(){this.open=false;};
 const previews=[];window.open=()=>({document:{write:html=>previews.push(html),close(){}}});
 const db={id:'project',contract_number:'UUR-RS/2026/10/001',revision:1,payload:C.newProject('Shopping test','Investor')},writes=[];let failing=false;
 const link={ksef_number:'PARAGON-test',project_id:'project',kind:'purchases',items:[{index:1,name:'Farba',quantity:2,unit:'szt.',gross:20},{index:2,name:'Pędzel',quantity:1,unit:'szt.',gross:5}],document:{sourceReceipt:true,grossAmount:25,payload:{currency:'PLN'},selectedQuantities:[{index:1,quantity:2,gross:20},{index:2,quantity:1,gross:5}]}};db.payload.purchases=[{id:'purchase',sourceReceiptId:link.ksef_number,documentType:'nip-receipt',date:'2026-10-26',shop:'Sklep',invoice:'R/1',amount:25,charge:25,paid:false,paidAmount:0,description:'Farba i pędzel',invoiceItems:link.items,selectedKsefQuantities:link.document.selectedQuantities}];
 const api={purchaseKsefLink:async()=>link,purchaseKsefAllocationContext:async()=>({links:[link],blocked:[]}),stageInvoices:async()=>[],savePurchaseAllocation:async(row,payload,source,entries)=>{assert.equal(source.document.sourceReceipt,true);writes.push(structuredClone(entries));db.payload=structuredClone(payload);db.revision++;return structuredClone(db);},restoreSession:()=>null,getSession:()=>({user:{id:'owner'}}),project:async()=>structuredClone(db),saveSettings:async(payload,revision)=>({payload:structuredClone(payload),revision:revision+1}),saveProject:async(row,payload)=>{if(failing)throw Error('Offline test');assert.equal(row.id,db.id);assert.equal(row.revision,db.revision);writes.push(structuredClone(payload));db.payload=structuredClone(payload);db.revision++;return structuredClone(db);}};
 const timers=new Set(),context=vm.createContext({console,crypto,structuredClone,URL,window,document:window.document,location:window.location,FormData:window.FormData,confirm:()=>true,localStorage:window.localStorage,setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout,fetch:async()=>({ok:true,json:async()=>[]})});
 const source=await readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8'),module=new vm.SourceTextModule(source+`\nexport function configure(row){selected=structuredClone(row);all=[structuredClone(row)];config={payload:{catalog:[],company:{},shops:['Sklep']},revision:1};configBaseline=structuredClone(config);view='purchases';projectDirty=settingsDirty=dirty=false;render();}export {pdfDialog,shoppingDialog,shoppingMatchDialog,flushChanges,undoChanges,refreshLinkedInvestment,lineDialog,purchaseDialog,toast};export const data=()=>selected;`,{context});
 await module.link(spec=>{const values=spec.includes('receipt-import')?ReceiptImport:spec.includes('purchase-items')?PurchaseItems:spec.includes('purchase-payment-form')?PurchasePaymentForm:spec.includes('purchase-payments')?PurchasePayments:spec.includes('invoices.js')?BI:spec.includes('shopping.js')?Shopping:spec.includes('autosave')?Auto:spec.includes('core.js')?C:spec.includes('api.js')?api:spec.includes('pdf.js')?PDF:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context})});await module.evaluate();await new Promise(r=>setImmediate(r));module.namespace.configure(db);
 const $=s=>window.document.querySelector(s),fill=(name,value)=>{$(`[name="${name}"]`).value=String(value)},submit=()=>$('#modal-form').onsubmit({preventDefault(){},target:$('#modal-form')});
 return {n:module.namespace,db,writes,previews,$,fill,submit,window,fail:()=>failing=true,close:async()=>{for(const id of timers)clearTimeout(id);await window.happyDOM.abort()}};
}

test('existing imported receipt reopens all lines, deselection changes cost and modal feedback stays in top layer',async()=>{
 const t=await setup();try{
  await t.n.purchaseDialog('purchase');
  assert.equal(t.$('#dialog').querySelectorAll('[data-allocation-check]').length,2);
  const brush=t.$('[data-allocation-check="2"]');brush.checked=false;brush.onchange();
  assert.equal(Number(t.$('#f-amount').value),20);
  t.n.toast('Sprawdź pozycje');assert.equal(t.$('[data-modal-feedback]').closest('dialog').id,'dialog');
  await t.submit();assert.equal(t.writes.length,1);assert.equal(t.writes[0].length,1);assert.equal(t.db.payload.purchases[0].amount,20);assert.equal(t.db.payload.purchases[0].sourceReceiptId,'PARAGON-test');
 }finally{await t.close()}
});
