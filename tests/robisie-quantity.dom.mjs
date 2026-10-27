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
 const api={restoreSession:()=>null,getSession:()=>({user:{id:'owner'}}),project:async()=>structuredClone(db),saveSettings:async(payload,revision)=>({payload:structuredClone(payload),revision:revision+1}),saveProject:async(row,payload)=>{if(failing)throw Error('Offline test');assert.equal(row.id,db.id);assert.equal(row.revision,db.revision);writes.push(structuredClone(payload));db.payload=structuredClone(payload);db.revision++;return structuredClone(db);}};
 const timers=new Set(),context=vm.createContext({console,crypto,structuredClone,URL,window,document:window.document,location:window.location,FormData:window.FormData,confirm:()=>true,localStorage:window.localStorage,setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout,fetch:async()=>({ok:true,json:async()=>[]})});
 const source=await readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8'),module=new vm.SourceTextModule(source+`\nexport function configure(row){selected=structuredClone(row);all=[structuredClone(row)];config={payload:{catalog:[],company:{},shops:[]},revision:1};configBaseline=structuredClone(config);view='works';projectDirty=settingsDirty=dirty=false;render();}export {pdfDialog,shoppingDialog,shoppingMatchDialog,flushChanges,undoChanges,refreshLinkedInvestment,lineDialog};export const data=()=>selected;`,{context});
 await module.link(spec=>{const values=spec.includes('shopping.js')?Shopping:spec.includes('autosave')?Auto:spec.includes('core.js')?C:spec.includes('api.js')?api:spec.includes('pdf.js')?PDF:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context})});await module.evaluate();await new Promise(r=>setImmediate(r));module.namespace.configure(db);
 const $=s=>window.document.querySelector(s),fill=(name,value)=>{$(`[name="${name}"]`).value=String(value)},submit=()=>$('#modal-form').onsubmit({preventDefault(){},target:$('#modal-form')});
 return {n:module.namespace,db,writes,previews,$,fill,submit,window,fail:()=>failing=true,close:async()=>{for(const id of timers)clearTimeout(id);await window.happyDOM.abort()}};
}
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
function fixture(t){t.db.payload.rooms=[{id:'room',name:'Kuchnia'}];const line={id:'line',name:'Praca testowa',category:'Prace',unit:'szt.',qty:2.5,price:20,roomId:'room',included:true};t.db.payload.offer=[structuredClone(line)];t.db.payload.works=[structuredClone(line)];t.n.configure(t.db);}
test('quantity buttons update works and offer independently, handle expressions and decimals, clamp at zero and persist totals',async()=>{
 const t=await setup();try{fixture(t);
 const control=()=>t.$('.quantity-stepper'),plus=()=>control().querySelector('[data-delta="1"]'),minus=()=>control().querySelector('[data-delta="-1"]');
 assert.equal(plus().type,'button');assert.match(plus().getAttribute('aria-label'),/Zwiększ ilość/);assert.equal(control().querySelector('input').value,'2.5');
 control().querySelector('input').value='2,5+3';plus().click();await settle();assert.equal(t.db.payload.works[0].qty,6.5);assert.equal(C.lineValue(t.db.payload.works[0]),130);assert.equal(t.db.payload.offer[0].qty,2.5);
 minus().click();await settle();assert.equal(t.db.payload.works[0].qty,5.5);
 control().querySelector('input').value='0.25';minus().click();await settle();assert.equal(t.db.payload.works[0].qty,0);minus().click();await settle();assert.equal(t.db.payload.works[0].qty,0);
 t.$('[data-action="nav"][data-view="offer"]').click();await settle();plus().click();await settle();assert.equal(t.db.payload.offer[0].qty,3.5);assert.equal(t.db.payload.works[0].qty,0);
 // Pointer handling prevents a blur/change render from swallowing the first click.
 const event=new t.window.Event('pointerdown',{bubbles:true,cancelable:true});plus().dispatchEvent(event);assert(event.defaultPrevented);
 }finally{await t.close()}
});
test('dialog quantity buttons keep form open and require Save; invalid expressions are retained without writes',async()=>{
 const t=await setup();try{fixture(t);const before=t.writes.length;t.n.lineDialog('works','line');const step=t.$('#f-qty').closest('.quantity-stepper');
 step.querySelector('[data-delta="1"]').click();await settle();assert.equal(t.$('#f-qty').value,'3.5');assert(t.$('#dialog').open);assert.equal(t.db.payload.works[0].qty,2.5);assert.equal(t.writes.length,before);
 t.$('#f-qty').value='2+';step.querySelector('[data-delta="1"]').click();await settle();assert.equal(t.$('#f-qty').value,'2+');assert(t.$('#f-qty').validationMessage);assert.equal(t.writes.length,before);
 t.$('#f-qty').value='0,1';step.querySelector('[data-delta="1"]').click();step.querySelector('[data-delta="-1"]').click();assert.equal(t.$('#f-qty').value,'0.1');
 await t.submit();assert.equal(t.db.payload.works[0].qty,0.1);assert.equal(t.db.payload.offer[0].qty,2.5);
 t.n.lineDialog('offer');assert(t.$('#f-qty').closest('.quantity-stepper'));t.$('#f-qty').value='1';t.$('#f-qty').closest('.quantity-stepper').querySelector('[data-delta="1"]').click();assert.equal(t.$('#f-qty').value,'2');assert(t.$('#dialog').open);
 }finally{await t.close()}
});
