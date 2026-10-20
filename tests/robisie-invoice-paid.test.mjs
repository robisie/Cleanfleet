import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as I from '../app/robisie/invoices.js';
import * as B from '../app/robisie/purchase-settlement.js';
const invoice={id:'fv',number:'A1',status:'issued',payload:{currency:'PLN',lines:[{qty:'1',price:'2900'}]}};
const pay=(p,amount,options={})=>I.markPaid(p,invoice,{amount,date:'2026-10-21',kind:'materials',...options});
test('quick paid confirmation makes the invoice money available for purchases and is idempotent when fully paid',()=>{
 const p=C.newProject('Test','Test'),before=structuredClone(p),next=pay(p,2900);assert.equal(I.paid(next.invoiceSettlements[0]),2900);assert.equal(C.purchaseTotals(next).advances,2900);assert.equal(B.sources(next,[invoice])[0].available,2900);assert.deepEqual(p,before);assert.deepEqual(pay(next,0),next);assert.throws(()=>pay(next,2900));
});
test('an existing advance can mark the invoice paid without a second inflow',()=>{
 const p=C.newProject('Test','Test');p.receipts=[{id:'old',kind:'materials',amount:1900,date:'2026-10-12'}];const next=pay(p,1000,{receiptIds:['old']});assert.equal(C.purchaseTotals(next).advances,2900);assert.equal(next.receipts.length,2);assert.equal(next.receipts[0].date,'2026-10-12');assert.equal(I.paid(next.invoiceSettlements[0]),2900);assert.throws(()=>pay(p,2900,{receiptIds:['old']}));
});
test('partial confirmations preserve earlier dates and add only the new amount',()=>{
 const p=pay(C.newProject('Test','Test'),1000,{date:'2026-10-12'}),next=pay(p,1900);assert.equal(next.receipts[0].date,'2026-10-12');assert.equal(next.receipts[1].date,'2026-10-21');assert.equal(C.purchaseTotals(next).advances,2900);assert.equal(I.paid(next.invoiceSettlements[0]),2900);
});
test('planned purchase and stage allocations are settled without duplicate money or lost existing payments',()=>{
 const p=C.newProject('Test','Test');p.purchases=[{id:'p',amount:1200,charge:1200,paid:false,paidAmount:0,invoicePayments:{fv:200}}];p.stages=[{id:'s',name:'I'}];p.invoiceSettlements=[{id:'fv',number:'A1',date:'2026-10-10',total:2900,allocations:[{key:'purchase:p',kind:'purchase',id:'p',amount:1200,paid:200},{key:'stage:s',kind:'stage',id:'s',amount:1700,paid:0}],existingReceipts:[]}];
 const next=pay(p,2700);assert.equal(I.assigned(next.invoiceSettlements[0]),2900);assert.equal(I.paid(next.invoiceSettlements[0]),2900);assert.equal(C.purchasePayment(next.purchases[0]).paid,1200);assert.equal(C.totals(next).paid,1700);assert.equal(C.purchaseTotals(next).advances,1200);assert.equal(next.purchases[0].invoicePayments.fv,200);assert.equal(next.receipts.find(r=>r.kind==='work').stageId,'s');
});
test('quick labour payment and invalid selections retain the correct purpose and invoice limits',()=>{
 const p=C.newProject('Test','Test'),next=pay(p,2900,{kind:'work'});assert.equal(C.totals(next).paid,2900);assert.equal(C.purchaseTotals(next).advances,0);
 assert.throws(()=>pay(p,-1));assert.throws(()=>pay(p,1,{date:''}));assert.throws(()=>pay(p,1,{receiptIds:['missing']}));assert.throws(()=>I.markPaid(p,{...invoice,status:'draft'},{amount:1,date:'2026-10-21',kind:'materials'}));
});
