import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile,writeFile} from 'node:fs/promises';
import * as C from '../app/robisie/core.js';import * as Auto from '../app/robisie/autosave.js';import * as PDF from '../app/robisie/pdf.js';
const {Window}=await import(process.env.SHOPPING_DOM_MODULE||'happy-dom');
test('ledger keeps full descriptions, moves balance to details and updates filtered summary while typing',async()=>{
 const window=new Window({url:'https://example.test/app/robisie/'}),document=window.document;document.body.innerHTML='<div id="app"></div><dialog id="dialog"></dialog><div id="toast"></div>';window.scrollTo=()=>{};
 const description='Panele winylowe — pełny opis ze wszystkimi szczegółami. '.repeat(15)+'<img src=x>\nDruga linia opisu.';
 const payload=C.newProject('Rozliczenie','Inwestor');payload.mixedSettlement=true;
 payload.purchases=[{id:'a',description,amount:100,charge:100,paidAmount:0,date:'2026-11-01',settlementCategory:'Materiały'},{id:'b',description:'Inny zakup',amount:50,charge:50,paidAmount:0,date:'',settlementCategory:'Inne'}];
 payload.receipts=[{id:'r',date:'2026-11-02',kind:'work',amount:200,note:'Zwrot za panele',settlementCategory:'Materiały'}];
 const context=vm.createContext({window,document,location:window.location,URL,crypto,structuredClone,console,FormData:window.FormData,localStorage:window.localStorage,setTimeout,clearTimeout});
 const source=await readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source+`\nexport function configure(row){selected=row;all=[row];config={payload:{company:{},catalog:[]},revision:1};configBaseline=structuredClone(config);view='ledger';render();}`,{context});
 const api={restoreSession:()=>null,getSession:()=>({user:{id:'owner'}})};
 await module.link(spec=>{const values=spec.includes('core.js')?C:spec.includes('autosave')?Auto:spec.includes('api.js')?api:spec.includes('pdf.js')?PDF:spec.includes('receipt-import')?{openReceiptImport(){}}:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});});
 try{
  await module.evaluate();await new Promise(r=>setImmediate(r));module.namespace.configure({id:'project',contract_number:'UM/1',revision:1,payload});
  assert.equal(document.querySelector('.ledger-description').textContent,description);assert.equal(document.querySelector('.ledger-description img'),null);
  assert.deepEqual([...document.querySelectorAll('.ledger-table th')].map(x=>x.textContent),['Data','Opis','Wpływ','Wydatek','']);
  if(process.env.LEDGER_PREVIEW_PATH){const css=await readFile(new URL('../app/robisie/style.css',import.meta.url),'utf8');await writeFile(process.env.LEDGER_PREVIEW_PATH,'<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>'+css+'</style></head><body>'+document.body.innerHTML+'</body></html>');}
  assert.equal(document.querySelector('.ledger-row-details').open,false);assert.match(document.querySelector('.ledger-row-details').textContent,/Saldo całego rozliczenia/);
  const summary=()=>document.querySelector('.ledger-filter-summary').textContent;
  const category=document.querySelector('#ledger-category');category.value='Materiały';category.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(document.querySelectorAll('.ledger-table tbody tr').length,2);assert.match(summary(),/200,00/);assert.match(summary(),/100,00/);
  const input=document.querySelector('#ledger-search');input.focus();input.value='Zwrot';input.dispatchEvent(new window.Event('input',{bubbles:true}));
  assert.equal(document.activeElement,input);assert.equal(document.querySelectorAll('.ledger-description').length,1);assert.match(summary(),/200,00/);assert.match(summary(),/0,00/);
  const dates=document.querySelector('#ledger-dates');dates.value='undated';dates.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(document.querySelectorAll('.ledger-description').length,0);assert.match(summary(),/0,00/);assert.match(document.querySelector('.metric.gold').textContent,/50,00/);
 }finally{await window.happyDOM.abort()}
});
