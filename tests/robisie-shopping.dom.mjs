// Run with SHOPPING_DOM_MODULE pointing to an installed happy-dom module (20.8.4).
// Uses a synthetic API and DOM, never connects to a production account.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import * as C from '../app/robisie/core.js';import * as Shopping from '../app/robisie/shopping.js';import * as Auto from '../app/robisie/autosave.js';
const {Window}=await import(process.env.SHOPPING_DOM_MODULE||'happy-dom');
async function setup(){
 const window=new Window({url:'https://example.test/app/robisie/'});window.document.body.innerHTML='<div id="app"></div><dialog id="dialog"></dialog><div id="toast"></div>';window.scrollTo=()=>{};window.document.querySelector('#dialog').showModal=function(){this.open=true;};window.document.querySelector('#dialog').close=function(){this.open=false;};
 const db={id:'project',contract_number:'UUR-RS/2026/10/001',revision:1,payload:C.newProject('Shopping test','Investor')},writes=[];let failing=false;
 const api={restoreSession:()=>null,getSession:()=>({user:{id:'owner'}}),project:async()=>structuredClone(db),saveProject:async(row,payload)=>{if(failing)throw Error('Offline test');assert.equal(row.id,db.id);assert.equal(row.revision,db.revision);writes.push(structuredClone(payload));db.payload=structuredClone(payload);db.revision++;return structuredClone(db);}};
 const timers=new Set(),context=vm.createContext({console,crypto,structuredClone,URL,window,document:window.document,location:window.location,FormData:window.FormData,confirm:()=>true,localStorage:window.localStorage,setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout,fetch:async()=>({ok:true,json:async()=>[]})});
 const source=await readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8'),module=new vm.SourceTextModule(source+`\nexport function configure(row){selected=structuredClone(row);all=[structuredClone(row)];config={payload:{catalog:[],company:{},shops:[]},revision:1};configBaseline=structuredClone(config);view='shopping';projectDirty=settingsDirty=dirty=false;render();}export {shoppingDialog,shoppingMatchDialog,flushChanges,undoChanges,refreshLinkedInvestment};export const data=()=>selected;`,{context});
 await module.link(spec=>{const values=spec.includes('shopping.js')?Shopping:spec.includes('autosave')?Auto:spec.includes('core.js')?C:spec.includes('api.js')?api:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context})});await module.evaluate();await new Promise(r=>setImmediate(r));module.namespace.configure(db);
 const $=s=>window.document.querySelector(s),fill=(name,value)=>{$(`[name="${name}"]`).value=String(value)},submit=()=>$('#modal-form').onsubmit({preventDefault(){},target:$('#modal-form')});
 return {n:module.namespace,db,writes,$,fill,submit,window,fail:()=>failing=true,close:async()=>{for(const id of timers)clearTimeout(id);await window.happyDOM.abort()}};
}
test('shopping forms persist, match real rendered selectors, escape names and preserve cost totals',async()=>{
 const t=await setup();try{
 t.n.shoppingDialog();t.fill('name','Płyta OSB <img src=x>');t.fill('shop','Leroy');t.fill('quantity',10);t.fill('unit','szt.');await t.submit();assert.equal(t.db.payload.shoppingList.length,1);assert.equal(t.db.payload.purchases.length,0);assert.equal(t.$('.shopping-item img'),null);assert(t.$('.shopping-check').textContent.includes('<img src=x>'));const item=t.db.payload.shoppingList[0];
 // A newly assigned invoice arrives while the investment is open.
 t.db.payload.purchases.push({id:'purchase',sourceKsefNumber:'KSEF',date:'2026-10-25',invoice:'FV/1',shop:'Leroy Merlin',amount:60,charge:60,invoiceItems:[{index:1,name:'Płyta OSB 22 mm',quantity:6,unit:'szt.',gross:60}]});t.db.revision++;await t.n.refreshLinkedInvestment();assert(t.$('.shopping-proposal'));const before=C.totals(t.db.payload);
 t.n.shoppingMatchDialog(item.id);assert(t.$('#shopping-source').value);assert.equal(t.$('#f-quantity').value,'6');await t.submit();assert.equal(t.db.payload.shoppingList[0].links[0].quantity,6);assert.equal(t.$('.shopping-check strong').textContent,'Płyta OSB 22 mm');assert.match(t.$('.shopping-status').textContent,/Częściowo/);assert.deepEqual(C.totals(t.db.payload),before);assert.equal(t.db.payload.purchases.length,1);
 // The existing undo path restores the shopping change without deleting the invoice.
 await t.n.undoChanges();assert.equal(t.db.payload.shoppingList[0].links.length,0);assert.equal(t.db.payload.purchases.length,1);
 }finally{await t.close()}
});
test('failed shopping saves retain a local recoverable draft and do not modify the database',async()=>{
 const t=await setup();try{t.fail();t.n.shoppingDialog();t.fill('name','Grunt');await t.submit();assert.equal(t.db.payload.shoppingList.length,0);assert.equal(t.n.data().payload.shoppingList.length,1);assert.match(t.$('#save-state').textContent,/Błąd zapisu/);assert(t.window.localStorage.getItem('robisie-autosave-drafts-v1:owner'));}finally{await t.close()}
});
test('rendered checkbox records and undoes a purchase through the normal save queue',async()=>{
 const t=await setup();try{
 t.n.shoppingDialog();t.fill('name','Grunt');await t.submit();
 t.$('[data-action="shopping-check"]').click();for(let i=0;i<20&&!t.db.payload.shoppingList[0].boughtQuantity;i++)await new Promise(r=>setImmediate(r));assert.equal(t.db.payload.shoppingList[0].boughtQuantity,1);assert.equal(t.db.payload.shoppingList[0].boughtDate,C.today());
 // Default remaining-only filter hides bought rows; switching to All makes undo available.
 await new Promise(r=>setImmediate(r));assert.equal(t.$('.shopping-item'),null);t.$('#shopping-filter').value='all';t.$('#shopping-filter').dispatchEvent(new t.window.Event('change',{bubbles:true}));assert(t.$('[data-action="shopping-check"]').checked);
 t.$('[data-action="shopping-check"]').click();for(let i=0;i<20&&t.db.payload.shoppingList[0].boughtQuantity;i++)await new Promise(r=>setImmediate(r));assert.equal(t.db.payload.shoppingList[0].boughtQuantity,0);assert.equal(t.db.payload.purchases.length,0);
 }finally{await t.close()}
});
