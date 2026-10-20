import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as I from '../app/robisie/invoices.js';
import * as B from '../app/robisie/purchase-settlement.js';
const doc=(id,total)=>({id,number:'FV-'+id,status:'issued',payload:{issueDate:'2026-10-20',currency:'PLN',lines:[{qty:'1',price:String(total)}]}});
const receipt=(id,amount,date='2026-10-12')=>({id,amount,date,kind:'materials'});
const purchase=(id,charge,date)=>({id,charge,amount:charge,date,paid:false,paidAmount:0,shop:'Sklep',description:id});
const choice=(key,amount,newAmount=0)=>({key,amount,newAmount,date:'2026-10-20'});
function fixture(){const p=C.newProject('Test','Test');p.purchases=[purchase('new',600,'2026-10-15'),purchase('old',2398,'2026-10-06')];p.receipts=[receipt('a',1900),receipt('b',1000)];return p;}
test('selected advances settle oldest purchases first, preserve receipts and leave unused money available',()=>{
 const p=fixture(),before=structuredClone(p),r=B.plan(p,[],[choice('advance:a',1900),choice('advance:b',1000)]);
 assert.deepEqual(r.purchases.map(p=>[p.id,p.allocated,p.remaining]),[['old',2398,0],['new',502,98]]);assert.equal(r.newMoney,0);assert.equal(C.purchaseTotals(r.project).advances,2900);assert.deepEqual(r.project.receipts,p.receipts);assert.deepEqual(p,before);
 assert.throws(()=>B.plan(r.project,[],[choice('advance:b',0,0)]));
});
test('new invoice money is recorded once; excess remains available and is reused without a new inflow',()=>{
 const p=fixture();p.receipts=[];const docs=[doc('f',4000)],r=B.plan(p,docs,[choice('invoice:f',0,4000)]);
 assert.equal(r.allocated,2998);assert.equal(r.unallocated,1002);assert.equal(r.newMoney,4000);assert.equal(C.purchaseTotals(r.project).advances,4000);assert.equal(I.paid(r.project.invoiceSettlements[0]),4000);assert.equal(B.sources(r.project,docs)[0].available,1002);assert.equal(B.sources(r.project,docs)[0].capacity,0);
 r.project.purchases.push(purchase('later',1500,'2026-11-01'));
 const reused=B.plan(r.project,docs,[choice('invoice:f',1002)]);assert.equal(reused.newMoney,0);assert.equal(reused.allocated,1002);assert.equal(C.purchaseTotals(reused.project).advances,4000);assert.equal(reused.project.receipts.length,1);
});
test('invoice-linked advances appear once and share their budget with existing purchase allocations',()=>{
 const p=fixture();p.purchases[0].receiptPayments={a:500};p.invoiceSettlements=[{id:'f',number:'FV-f',total:3000,allocations:[],existingReceipts:[{id:'a',amount:1900,kind:'materials',date:'2026-10-12'}]}];
 const s=B.sources(p,[doc('f',3000)]);assert.deepEqual(s.map(x=>[x.key,x.available]),[['advance:b',1000],['invoice:f',1400]]);
 const r=B.plan(p,[doc('f',3000)],[choice('advance:b',1000),choice('invoice:f',1400)]);assert.equal(r.allocated,2400);assert.equal(C.purchaseTotals(r.project).advances,2900);assert.equal(I.paid(r.project.invoiceSettlements[0]),1900);assert.equal(r.project.purchases.find(x=>x.id==='new').receiptPayments.a,502);
});
test('recorded invoice pools are converted to linked receipts without increasing inflows or assignments',()=>{
 const p=fixture();p.receipts=[];p.invoiceSettlements=[{id:'f',number:'FV-f',total:3000,date:'2026-10-19',allocations:[{key:'materials:advance',kind:'materials',id:'advance',amount:2500,paid:1900}]}];
 const r=B.plan(p,[doc('f',3000)],[choice('invoice:f',1900,600)]);assert.equal(r.allocated,2500);assert.equal(C.purchaseTotals(r.project).advances,2500);assert.equal(I.assigned(r.project.invoiceSettlements[0]),2500);assert.equal(I.paid(r.project.invoiceSettlements[0]),2500);assert.equal(r.project.receipts.find(x=>x.amount===1900).date,'2026-10-19');
});
test('a sale invoice can document a selected earlier advance in the same operation without doubling it',()=>{
 const p=fixture(),r=B.plan(p,[doc('f',1900)],[choice('advance:a',1900),choice('invoice:f',0)],[{invoiceId:'f',receiptId:'a'}]);
 assert.equal(r.selected,1900);assert.equal(r.allocated,1900);assert.equal(r.newMoney,0);assert.equal(C.purchaseTotals(r.project).advances,2900);assert.equal(I.paid(r.project.invoiceSettlements[0]),1900);assert.equal(C.effectiveReceipts(r.project).filter(x=>x.invoiceId==='f').length,1);
 assert.throws(()=>B.plan(p,[doc('f',1900)],[choice('advance:a',1900),choice('invoice:f',0,1900)],[{invoiceId:'f',receiptId:'a'}]));
});
test('existing work and material allocations remain intact while only free money is used',()=>{
 const p=fixture();p.receipts=[];p.purchases[0].paidAmount=100;p.purchases[0].paid=true;
 p.invoiceSettlements=[{id:'f',number:'FV-f',total:5000,date:'2026-10-19',allocations:[{key:'work:all',kind:'work',id:'all',amount:1500,paid:1500},{key:'purchase:new',kind:'purchase',id:'new',amount:200,paid:200}]}];p.purchases[0].invoicePayments={f:200};
 const r=B.plan(p,[doc('f',5000)],[choice('invoice:f',0,1000)]);assert.equal(C.totals(r.project).paid,1500);assert.equal(r.project.purchases[0].paidAmount,100);assert.deepEqual(r.project.invoiceSettlements[0].allocations,p.invoiceSettlements[0].allocations);assert.equal(C.purchaseTotals(r.project).advances,1300);
});
test('cents are allocated exactly, with a partially paid last purchase',()=>{
 const p=fixture();p.purchases=[purchase('a',.03,'1'),purchase('b',.04,'2'),purchase('c',.1,'3')];p.receipts=[receipt('a',.13)];
 const r=B.plan(p,[],[choice('advance:a',.13)]);assert.equal(r.allocated,.13);assert.equal(r.unallocated,0);assert.deepEqual(r.purchases.map(x=>x.remaining),[0,0,.04]);
});
test('history receipts already consumed by legacy paid purchases are reserved',()=>{
 const p=fixture();p.purchases=[{id:'legacy',amount:1000,charge:1000,paid:true},purchase('new',500,'2026-10-20')];p.receipts=[receipt('old',1000,'2020-01-01'),receipt('new',200)];assert.deepEqual(B.sources(p,[]).map(x=>[x.id,x.available]),[['new',200]]);
});
test('invalid, overdrawn, duplicate and unpaid document selections cannot mutate the project',()=>{
 const p=fixture(),before=structuredClone(p),docs=[doc('f',1000)];
 for(const choices of [[],[choice('advance:a',2000)],[choice('advance:a',100),choice('advance:a',100)],[choice('invoice:f',0,1001)],[choice('invoice:f',100)],[choice('missing',1)]])assert.throws(()=>B.plan(p,docs,choices));
 assert.throws(()=>B.plan(p,[{...doc('f',1000),status:'draft'}],[choice('invoice:f',0,1000)]));assert.throws(()=>B.plan(p,docs,[{...choice('invoice:f',0,100),date:''}]));assert.deepEqual(p,before);
});
