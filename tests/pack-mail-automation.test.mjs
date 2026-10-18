import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {bankPeriod,mergeStatement} from '../supabase/functions/pack-bank-mail/import.mjs';
const P=createRequire(import.meta.url)('../app/priv/engine.js');
test('bank dates start on seventh and target previous month, including January',()=>{
 assert.equal(bankPeriod('2026-11-06'),null);
 assert.equal(bankPeriod('2026-11-07').period,'2026-10');
 assert.equal(bankPeriod('2027-01-07').period,'2026-12');
});
test('automatic imports retain real repeated payments and user overrides without duplicate reimports',()=>{
 const t={date:'2026-10-02',recipient:'ZUS',title:'Składka',account:'',amount:10000,currency:'PLN'};
 const state={version:1,rules:[{id:'r',recipient:'ZUS',currency:'PLN'}],transactions:[],incomes:[],imports:[],cash:[{id:'untouched'}]};
 const b={name:'mBiznes.pdf',hash:'hash',period:'2026-10',range:{from:'2026-10-01',to:'2026-10-31'},warnings:[],transactions:[t,t,{...t,recipient:'Nieśledzony'}],incomes:[{...t,recipient:'Pracodawca'}]};
 let next=mergeStatement(state,b,P);assert.equal(next.transactions.length,2);assert.equal(next.incomes.length,1);assert.equal(next.imports[0].complete,false);
 next.incomes[0].excluded=true;next.incomes[0].salary=true;next.transactions[0].assignment='r';
 next=mergeStatement(next,b,P);assert.equal(next.transactions.length,2);assert.equal(next.incomes.length,1);assert.equal(next.incomes[0].excluded,true);assert.equal(next.incomes[0].salary,true);assert.equal(next.imports.length,1);assert.deepEqual(next.cash,state.cash);assert.equal(state.transactions.length,0);
 assert.throws(()=>mergeStatement(state,{...b,period:'2026-09'},P),/innego miesiąca/);
 assert.throws(()=>mergeStatement(state,{...b,warnings:['nieodczytana kwota']},P),/ręcznego/);
});
test('deployed finance engine and vault are exact copies of browser implementations',async()=>{
 const {readFile}=await import('node:fs/promises');for(const name of ['engine.js','vault.js'])assert.equal(await readFile(new URL('../app/priv/'+name,import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/pack-bank-mail/'+name,import.meta.url),'utf8'));
});
