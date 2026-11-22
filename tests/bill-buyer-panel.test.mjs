import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as C from '../bill/core.js';
import * as Groups from '../bill/invoice-groups.js';
import * as Payment from '../bill/payment-status.js';
import * as Demand from '../bill/payment-demand.js';
async function setup(){
 const context=vm.createContext({console,crypto,URL,URLSearchParams,structuredClone,location:{search:''},setTimeout:()=>0,clearTimeout(){},window:{addEventListener(){}},document:{querySelector:()=>({innerHTML:'',classList:{add(){},remove(){}}}),querySelectorAll:()=>[],addEventListener(){}}});
 const source=await readFile(new URL('../bill/app.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source+`\nexport function panel(payload,expanded=null){editor={id:'invoice',payload};data.parties=[];data.settings={};data.sources={companies:[{id:'cf',name:'Fleet'}],billing:[{id:'billing',name:'Billing'}],projects:[{id:'rs',name:'Project',number:'UUR1'}]};return buyerPanel(payload,expanded);}export {buyerReady,buyerSummary};`,{context});
 await module.link(spec=>{const values=spec.includes('invoice-groups')?Groups:spec.includes('payment-status')?Payment:spec.includes('payment-demand')?Demand:spec.startsWith('./core')?C:spec.startsWith('./api')?{restoreSession:()=>null}:{preview(){},previewHtml(){}};return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});});
 await module.evaluate();return module.namespace;
}
const buyer={kind:'company',name:'TVM Transport & Logistics GmbH',nip:'DE338759809',address:'Zollhof 8',city:'40221 Dusseldorf',country:'DE'};
test('complete imported and saved buyers show one summary with both panels collapsed, preserving source choices',async()=>{
 const ui=await setup();for(const app of ['cleanfleet','billing','robisie']){
  const p={buyer:structuredClone(buyer),source:{app,id:{cleanfleet:'cf',billing:'billing',robisie:'rs'}[app]}};const before=structuredClone(p),html=ui.panel(p);
  assert.match(html,/✓ Nabywca faktury/);assert.match(html,/TVM Transport &amp; Logistics GmbH/);assert.match(html,/DE338759809 · Niemcy/);
  assert.doesNotMatch(html,/<details id="buyer-(?:choice|details)"[^>]*\sopen/);
  assert.match(html,new RegExp(`value="${app}:${p.source.id}" selected`));assert.deepEqual(p,before);
 }
});
test('blank invoices offer sources and manual entry while incomplete buyers keep required fields open',async()=>{
 const ui=await setup(),blank=ui.panel(C.newInvoice());assert.match(blank,/<details id="buyer-choice"[^>]* open/);assert.match(blank,/data-action="buyer-manual"/);assert.match(blank,/Nie wybrano nabywcy/);
 const incomplete=ui.panel({buyer:{...buyer,nip:''}});assert.match(incomplete,/<details id="buyer-details"[^>]* open/);assert.match(incomplete,/Dane nabywcy do uzupełnienia/);assert.doesNotMatch(incomplete,/✓ Nabywca faktury/);
});
test('open panels survive editor rerenders; person buyers need no NIP; summaries escape entered text',async()=>{
 const ui=await setup();const p={buyer:{kind:'person',name:'Jan <img src=x>',address:'Testowa 1',city:'Warszawa',country:'PL'}};
 assert.equal(ui.buyerReady(p.buyer),true);const html=ui.panel(p,{choice:true,fields:true});assert.match(html,/<details id="buyer-choice"[^>]* open/);assert.match(html,/<details id="buyer-details"[^>]* open/);assert.match(html,/Jan &lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);assert.match(html,/Osoba prywatna/);
});
