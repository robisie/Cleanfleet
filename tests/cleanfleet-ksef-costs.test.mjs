import test from 'node:test';
import assert from 'node:assert/strict';
import {editCosts,selectedTotal} from '../app/ksef-costs.js';

function surface(){
 let dialog;
 globalThis.document={body:{append(){}},createElement(){
  const nodes=new Map(),rows=[];
  dialog={showModal(){},close(){},remove(){},querySelector:s=>nodes.get(s),querySelectorAll:()=>rows};
  Object.defineProperty(dialog,'innerHTML',{set(html){dialog.html=html;for(const key of ['[data-all]','[data-none]','[data-total]','[data-error]','[data-cancel]','[type=submit]','form'])nodes.set(key,{disabled:false,textContent:''});
   for(const match of html.matchAll(/<section class="cf-ksef-line" data-line="(\d+)">([\s\S]*?)<\/section>/g)){
    const [,index,body]=match,map=new Map();
    const checkbox=body.match(/<input type="checkbox"[^>]*>/)[0];map.set('[data-select]',{checked:checkbox.includes('checked'),disabled:checkbox.includes('disabled')});
    for(const type of ['category','company']){const part=body.match(new RegExp('<select data-'+type+'[^>]*>([\\s\\S]*?)</select>'))[1];const options=[...part.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];const selected=options.find(o=>o[1].includes('selected'))||options[0];map.set('[data-'+type+']',{value:selected[1].match(/value="([^"]*)"/)?.[1]??selected[2]});}
    map.set('[data-note]',{value:body.match(/data-note value="([^"]*)"/)[1]});rows.push({dataset:{line:index},querySelector:s=>map.get(s)});
   }
  }});return dialog;
 }};
 return ()=>dialog;
}
const preview={canSelect:true,items:[{index:1,name:'<img onerror=bad>',gross:123,quantity:2},{index:2,name:'Farba',gross:54,quantity:1}]};
test('selection sums money in cents',()=>{assert.equal(selectedTotal([{index:1,gross:.1},{index:2,gross:.2}],[1,2]),.3);});
test('new costs exclude Robisie positions, persist chosen category and company, escape invoice text',async()=>{
 const get=surface(),calls=[];const done=editCosts({number:'TEST',xml:'<Faktura/>',preview,context:{link:null,purchases:[],blocked:[2]},companies:[{id:'client',name:'Klient'}],save:async x=>calls.push(x)});
 const d=get(),rows=d.querySelectorAll();assert.ok(d.html.includes('&lt;img onerror=bad&gt;'));assert.equal(rows[1].querySelector('[data-select]').disabled,true);d.querySelector('[data-all]').onclick();assert.equal(rows[1].querySelector('[data-select]').checked,false);
 rows[0].querySelector('[data-category]').value='Chemia';rows[0].querySelector('[data-company]').value='client';
 await d.querySelector('form').onsubmit({preventDefault(){}});assert.equal(await done,true);assert.equal(calls.length,1);assert.deepEqual(calls[0].entries,[{index:1,category:'Chemia',company_id:'client',note:''}]);assert.equal(calls[0].revision,null);
});
test('editing restores only saved selection and preserves revision; removal needs explicit confirmation',async()=>{
 const get=surface(),calls=[];let confirmations=0;globalThis.confirm=()=>{confirmations++;return true;};
 const done=editCosts({number:'TEST',context:{link:{preview,revision:4},purchases:[{source_ksef_index:2,category:'Sprzęt',note:'retain'}]},save:async x=>calls.push(x)});
 const d=get(),rows=d.querySelectorAll();assert.equal(rows[0].querySelector('[data-select]').checked,false);assert.equal(rows[1].querySelector('[data-select]').checked,true);assert.equal(rows[1].querySelector('[data-note]').value,'retain');
 d.querySelector('[data-none]').onclick();await d.querySelector('form').onsubmit({preventDefault(){}});assert.equal(await done,true);assert.equal(confirmations,1);assert.deepEqual(calls[0].entries,[]);assert.equal(calls[0].revision,4);assert.equal(calls[0].xml,null);
});
test('failed save keeps the modal and prevents a second simultaneous submission',async()=>{
 const get=surface();let reject,calls=0;const done=editCosts({number:'TEST',preview,context:{link:null},save:()=>{calls++;return new Promise((_,r)=>reject=r);}});
 const d=get(),first=d.querySelector('form').onsubmit({preventDefault(){}});await d.querySelector('form').onsubmit({preventDefault(){}});assert.equal(calls,1);reject(Error('Dane zmieniły się'));await first;assert.equal(d.querySelector('[data-error]').textContent,'Dane zmieniły się');d.querySelector('[data-cancel]').onclick();assert.equal(await done,false);
});
test('unsupported corrections and foreign currency never open a save flow',async()=>{await assert.rejects(editCosts({context:{link:null},preview:{canSelect:false,items:[]}}),/osobnego rozliczenia/);});
