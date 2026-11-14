import test from 'node:test';import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as PDF from '../app/robisie/pdf.js';
import {settlementSelection} from '../app/robisie/core.js';
const rows=[{id:'a',category:'Materiały',description:'Panele do salonu',date:'2026-11-01',plus:0,minus:100.1,balance:-100.1},{id:'b',category:'Materiały',description:'Zwrot za panele',date:'',plus:200.2,minus:0,balance:100.1},{id:'c',category:'Inne',description:'Dostawa',date:'',plus:0,minus:50.3,balance:49.8}];
test('ledger summary combines category, search and date filters without changing global balances',()=>{
 const before=structuredClone(rows),all=settlementSelection(rows);
 assert.deepEqual([all.count,all.income,all.expense,all.balance],[3,200.2,150.4,49.8]);
 const selected=settlementSelection(rows,{category:'Materiały',search:' PANELE ',dateFilter:'undated'});
 assert.deepEqual([selected.count,selected.income,selected.expense,selected.balance],[1,200.2,0,200.2]);
 assert.equal(selected.rows[0].balance,100.1);assert.deepEqual(rows,before);
 const empty=settlementSelection(rows,{category:'Materiały',search:'Dostawa'});
 assert.deepEqual([empty.count,empty.income,empty.expense,empty.balance],[0,0,0,0]);
});

test('shared ledger omits purchase settlement credits from rows, balances, filters and PDF without changing purchase accounting',()=>{
 const p=C.newProject('Mixed','Investor');p.mixedSettlement=true;
 p.receipts=[{id:'advance',amount:1000,kind:'materials',date:'2026-10-24',note:'Wpłata inwestora'}];
 p.purchases=[{id:'screws',amount:126.84,charge:126.84,paid:true,paidAmount:126.84,paidDate:'2026-10-26',date:'2026-07-14',description:'Wkręty',shop:'Alicja Kuźnik'}];
 // Linking the generated purchase payment to an invoice must not make it visible again.
 p.invoiceSettlements=[{id:'invoice',number:'A1',existingReceipts:[{id:'purchase-payment:screws'}],allocations:[{key:'stage:s',kind:'stage',id:'s',paid:200,date:'2026-10-27'}]}];
 const before=structuredClone(p),accounting=C.totals(p),receipts=C.effectiveReceipts(p),s=C.settlementTotals(p);
 assert.equal(receipts.find(r=>r.purchaseId==='screws').invoiceId,'invoice');
 assert.deepEqual(s.rows.map(r=>r.id),['screws','advance','invoice:invoice:stage:s']);
 assert.equal(s.plus,1200);assert.equal(s.minus,126.84);assert.equal(s.balance,1073.16);
 assert.equal(s.rows.at(-1).balance,1073.16);
 const filtered=C.settlementSelection(s.rows,{category:'Materiały i zakupy',search:'Wkręty'});
 assert.deepEqual([filtered.count,filtered.income,filtered.expense,filtered.balance],[1,0,126.84,-126.84]);
 assert.equal(C.settlementSelection(s.rows,{search:'Rozliczenie zakupu'}).count,0);
 const html=PDF.buildDocument({id:'p',contract_number:'UUR-RS/2026/10/001',payload:p},{company:{},catalog:[]},{modules:['ledger']});
 assert.doesNotMatch(html,/Rozliczenie zakupu/);assert.match(html,/Wkręty/);assert.match(html,/Wpłata inwestora/);
 assert.deepEqual(p,before);assert.deepEqual(C.totals(p),accounting);assert.deepEqual(C.effectiveReceipts(p),receipts);
});
