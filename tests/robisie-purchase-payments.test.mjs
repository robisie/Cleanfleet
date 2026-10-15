import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import {buildDocument} from '../app/robisie/pdf.js';

test('partial purchase payments flow into material and final balances and PDF',()=>{
 const p=C.newProject('Test','Investor');p.purchases=[{amount:1000,charge:1200,paid:true,paidAmount:400,shop:'Test'}];p.receipts=[{kind:'materials',amount:300}];
 assert.deepEqual(C.purchasePayment(p.purchases[0]),{paid:400,charged:1200,remaining:800,state:'partial'});
 assert.equal(C.purchaseTotals(p).spent,1000);assert.equal(C.purchaseTotals(p).balance,-500);assert.equal(C.purchaseTotals(p).outstanding,800);assert.equal(C.totals(p).remaining,500);
 p.calculationPrecision='source';assert.equal(C.totals(p).remaining,500);
 const html=buildDocument({contract_number:'UUR-RS/2026/10/001',payload:p},{company:{},catalog:[]},{modules:['purchases','payments']});
 assert.ok(html.includes('Opłacono częściowo'));assert.ok(html.includes(C.money(800)));assert.ok(html.includes(C.money(1200)));
 p.purchases[0].paidAmount=1200;assert.equal(C.purchasePayment(p.purchases[0]).state,'full');assert.equal(C.purchaseTotals(p).outstanding,0);
 p.purchases[0].paid=false;assert.equal(C.purchaseTotals(p).spent,1000);assert.equal(C.purchaseTotals(p).charged,1200);assert.equal(C.purchaseTotals(p).outstanding,1200);
});

test('legacy imports keep full paid amounts and source precision, including zero purchase adjustments',()=>{
 const p=C.newProject('Legacy','Investor');p.purchases=[{amount:100,charge:110.004,paid:true},{amount:200,charge:220.004,paid:true},{amount:0,charge:15,paid:true},{amount:50,charge:60,paid:false}];
 assert.equal(C.purchaseTotals(p).spent,300);assert.equal(C.purchaseTotals(p).charged,345.01);assert.equal(C.purchaseTotals(p).outstanding,50);
 p.calculationPrecision='source';assert.equal(C.totals(p).remaining,345.01);
 assert.equal(C.purchasePayment({amount:100,paid:true,paidAmount:150,charge:120}).paid,120);
 assert.equal(C.purchasePayment({amount:100,paid:true,paidAmount:-10,charge:120}).paid,0);
});

test('purchase settlement adds to existing advances once and follows edits, uncheck and deletion',()=>{
 const p=C.newProject('Schody','Inwestor');p.receipts=[{kind:'materials',amount:100}];p.purchases=[{id:'x',amount:2398,charge:2398,paid:true,paidAmount:1900}];
 assert.equal(C.purchaseTotals(p).advances,2000);assert.equal(C.purchaseTotals(p).balance,-398);assert.equal(C.purchaseTotals(p).spent,2398);assert.equal(C.totals(p).remaining,398);
 assert.equal(C.effectiveReceipts(p).length,2);assert.equal(C.purchaseTotals(p).advances,2000);assert.equal(p.receipts.length,1);
 p.purchases[0].paidAmount=2000;assert.equal(C.purchaseTotals(p).advances,2100);
 p.purchases[0].paid=false;assert.equal(C.purchaseTotals(p).advances,100);assert.equal(C.purchaseTotals(p).charged,2398);
 p.purchases=[];assert.equal(C.purchaseTotals(p).advances,100);
});
