import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import {investmentInvoiceSeed,detailedInvoiceSeed} from '../app/robisie/billing.js';

test('Bill proposal uses the same mixed work/material pool as the investment ledger',()=>{
 const p=C.newProject('Test','Test');
 p.mixedSettlement=true;p.works=[{name:'Work',unit:'szt.',qty:1,price:1000,done:true}];
 p.purchases=[{id:'purchase',amount:300,charge:400,paid:false,paidAmount:0}];
 p.receipts=[{id:'work',kind:'work',amount:1000},{id:'materials',kind:'materials',amount:200}];
 const before=structuredClone(p),totals=C.totals(p),seed=investmentInvoiceSeed({id:'project',payload:p});
 assert.equal(totals.paid,800);assert.equal(totals.workRemaining,200);
 assert.equal(seed.amountOptions.find(o=>o.id==='work-remaining').amount,'200.00');
 assert.equal(seed.amountOptions.find(o=>o.id==='remaining').amount,totals.remaining.toFixed(2));
 assert.deepEqual(p,before,'Invoice preparation must not rewrite receipts or calculations');
});
test('source precision and work credit survive preparation of the invoice options',()=>{
 const p=C.newProject('Test','Test');p.calculationPrecision='source';
 p.offer=[{qty:1,price:90,calculationPrecision:'source'}];p.acceptedOffers=[{lines:p.offer,discount:0,agreedAmount:100}];
 p.works=[{name:'Work',unit:'szt.',qty:1,price:150,done:true,calculationPrecision:'source'}];
 p.receipts=[{kind:'work',amount:100},{kind:'materials',amount:20}];p.purchases=[{paid:true,amount:22,charge:25}];p.workCredit=30;
 const seed=investmentInvoiceSeed({id:'project',payload:p});
 assert.equal(seed.amountOptions.find(o=>o.id==='work-remaining').amount,'20.00');
 assert.equal(seed.amountOptions.find(o=>o.id==='remaining').amount,'25.00');
 assert.equal(detailedInvoiceSeed({payload:p}).total,'150.00');
});
