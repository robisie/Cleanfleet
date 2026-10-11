import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import {buildDocument} from '../app/robisie/pdf.js';

test('partial purchase payments flow into material and final balances and PDF',()=>{
 const p=C.newProject('Test','Investor');p.purchases=[{amount:1000,charge:1200,paid:true,paidAmount:400,shop:'Test'}];p.receipts=[{kind:'materials',amount:300}];
 assert.deepEqual(C.purchasePayment(p.purchases[0]),{paid:400,charged:480,remaining:600,state:'partial'});
 assert.equal(C.purchaseTotals(p).spent,400);assert.equal(C.purchaseTotals(p).balance,-180);assert.equal(C.purchaseTotals(p).outstanding,600);assert.equal(C.totals(p).remaining,180);
 p.calculationPrecision='source';assert.equal(C.totals(p).remaining,180);
 const html=buildDocument({contract_number:'UUR-RS/2026/10/001',payload:p},{company:{},catalog:[]},{modules:['purchases','payments']});
 assert.ok(html.includes('Częściowo opłacony'));assert.ok(html.includes(C.money(600)));assert.ok(html.includes(C.money(480)));
 p.purchases[0].paidAmount=1000;assert.equal(C.purchasePayment(p.purchases[0]).state,'full');assert.equal(C.purchaseTotals(p).outstanding,0);
 p.purchases[0].paid=false;assert.equal(C.purchaseTotals(p).spent,0);assert.equal(C.purchaseTotals(p).charged,0);assert.equal(C.purchaseTotals(p).outstanding,1000);
});

test('legacy imports keep full paid amounts and source precision, including zero purchase adjustments',()=>{
 const p=C.newProject('Legacy','Investor');p.purchases=[{amount:100,charge:110.004,paid:true},{amount:200,charge:220.004,paid:true},{amount:0,charge:15,paid:true},{amount:50,charge:60,paid:false}];
 assert.equal(C.purchaseTotals(p).spent,300);assert.equal(C.purchaseTotals(p).charged,345.01);assert.equal(C.purchaseTotals(p).outstanding,50);
 p.calculationPrecision='source';assert.equal(C.totals(p).remaining,345.01);
 assert.equal(C.purchasePayment({amount:100,paid:true,paidAmount:150,charge:120}).paid,100);
 assert.equal(C.purchasePayment({amount:100,paid:true,paidAmount:-10,charge:120}).paid,0);
});
