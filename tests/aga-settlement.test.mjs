import test from 'node:test';import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';import * as A from '../app/aga-core.js';import * as PDF from '../app/robisie/pdf.js';import * as Completion from '../app/robisie/completion.js';
test('common ledger counts gross receipts and withholding once, and reads native works/purchases',()=>{
 const p=C.newProject('Mixed','Investor');p.mixedSettlement=true;
 p.works=[{id:'work',name:'Work',category:'Labour',qty:1,price:600,done:true,included:true,date:'2026-07-02'}];
 p.purchases=[{id:'material',description:'Material',amount:200,charge:200,paid:true,date:''}];
 p.receipts=[C.settlementReceipt({gross:1000,rate:9,date:'2026-07-01',description:'Payment',category:'Receipts'})];
 const s=C.settlementTotals(p);assert.equal(s.plus,1000);assert.equal(s.withheld,90);assert.equal(s.expenses,800);assert.equal(s.balance,110);assert.equal(C.totals(p).remaining,-110);assert.equal(C.totals(p).paid,710);assert.equal(C.totals(p).materials.advances,200);assert.equal(Completion.summary(p).due,0);assert.equal(Completion.summary(p).refund,110);assert.equal(s.rows.at(-1).balance,110);assert.equal(s.rows.at(-1).id,'material');
 p.purchases[0].charge=220;assert.equal(C.settlementTotals(p).balance,90);p.works[0].done=false;assert.equal(C.settlementTotals(p).balance,690);
 const html=PDF.buildDocument({id:'p',contract_number:'UUR-RS/2026/10/001',payload:p},{company:{},catalog:[]},{modules:['ledger'],logoUrl:'logo.png'});assert.match(html,/Wspólne rozliczenie/);assert.match(html,/Potrącenia/);
});
test('unknown dates preserve source order and supplied dates sort chronologically; category totals reconcile',()=>{
 const p=C.newProject('Mixed','Investor');p.purchases=[{id:'a',sourceSequence:4,charge:5,amount:5,paid:true,description:'A'},{id:'b',sourceSequence:3,charge:10,amount:10,paid:true,description:'B',dateHint:'24.07 — rok niepodany'},{id:'c',charge:2,amount:2,paid:true,description:'C',date:'2026-04-18'}];
 const s=C.settlementTotals(p);assert.deepEqual(s.rows.map(x=>x.id),['c','b','a']);assert.equal(s.balance,-17);assert.equal(s.groups.reduce((n,g)=>n+g.plus-g.minus,0),s.balance);assert.equal(s.undated,2);
});
test('reserve is configurable and zero tax is distinct from a missing tax period',()=>{
 const data={invoices:[A.invoice({date:'2026-01-10',amount:'1000',rate:9,received:true}),A.invoice({date:'2026-02-01',amount:'500',rate:10,received:null})],taxes:[]};
 let s=A.annualSummary(data,'2026');assert.equal(s.gross,1500);assert.equal(s.reserve,140);assert.equal(s.net,1360);assert.equal(s.difference,null);assert.equal(s.unknownReceived,500);assert.equal(s.received,1000);
 data.taxes.push(A.tax({date:'2026-02-20',period:'2026-01',amount:0}));s=A.annualSummary(data,'2026');assert.equal(s.months[0].tax,0);assert.equal(s.months[1].tax,null);assert.deepEqual(s.missing,['2026-02']);assert.equal(s.difference,140);
 assert.throws(()=>A.tax({date:'2026-04-20',period:'2026-Q1',amount:20},{},data.taxes),/już/);
});
test('annual/quarterly totals use the period of tax, not its payment date, without mixing years',()=>{
 const data={invoices:[A.invoice({date:'2025-12-31',amount:100,rate:9}),A.invoice({date:'2026-01-01',amount:200,rate:9})],taxes:[A.tax({date:'2026-01-20',period:'2025-Q4',amount:3})]};
 const s=A.annualSummary(data,'2025');assert.equal(s.gross,100);assert.equal(s.paidTax,3);assert.equal(s.difference,6);assert(s.months[11].quarter);assert.equal(s.months[11].tax,null);assert.equal(A.annualSummary(data,'2026').paidTax,0);
 assert.throws(()=>A.invoice({date:'2026-02-31',amount:100,rate:9}),/datę/);assert.throws(()=>C.settlementReceipt({gross:100,rate:100}),/potrącenie/);
});
