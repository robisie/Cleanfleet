import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as I from '../app/robisie/invoices.js';
import * as P from '../app/robisie/purchase-payments.js';
const date='2026-10-20';
const invoice=(id='fv',total='1000')=>({id,number:'FV '+id,status:'issued',payload:{currency:'PLN',lines:[{qty:'1',price:total}]}});
function project(){const p=C.newProject('Materiały','Inwestor');p.purchases=[{id:'m',date,amount:800,charge:1000,paid:false,paidAmount:0,shop:'Sklep',description:'Materiały'}];return p;}
const apply=(p,state,rows,docs=[invoice()])=>P.apply(p,p.purchases[0],{state,rows},docs);
test('cash full, partial and corrections are idempotent and separate cost from received money',()=>{
 const p=project();const next=apply(p,'full',[{source:'cash',amount:1000,date}]);
 assert.equal(C.purchaseTotals(next).spent,800);assert.equal(C.purchaseTotals(next).advances,1000);assert.equal(C.purchaseTotals(next).outstanding,0);
 assert.equal(C.purchaseTotals(p).advances,0);
 const same=apply(next,'full',P.rows(next,next.purchases[0]));assert.deepEqual(C.totals(same),C.totals(next));
 const partial=apply(same,'partial',[{source:'cash',amount:400,date:'2026-10-19'}]);assert.equal(C.purchaseTotals(partial).advances,400);assert.equal(C.purchaseTotals(partial).outstanding,600);
 assert.equal(C.effectiveReceipts(partial)[0].date,'2026-10-19');
 assert.throws(()=>apply(partial,'full',[{source:'cash',amount:500,date}]),/Suma wpłat/);
});
test('purchase can be paid by several sales invoices and cash without duplicating invoice receipts',()=>{
 const p=project(),docs=[invoice('a','500'),invoice('b','500')];
 const rows=[{source:'cash',amount:100,date},{source:'invoice',id:'a',amount:400,date},{source:'invoice',id:'b',amount:500,date}];
 const next=apply(p,'full',rows,docs);assert.equal(C.purchasePayment(next.purchases[0]).paid,1000);assert.equal(C.purchaseTotals(next).advances,1000);assert.equal(C.totals(next).paid,0);
 assert.equal(C.effectiveReceipts(next).length,3);assert.equal(I.paid(next.invoiceSettlements[0]),400);
 assert.deepEqual(C.totals(apply(next,'full',rows,docs)),C.totals(next));
 assert.throws(()=>apply(p,'full',[{source:'invoice',id:'a',amount:1000,date}],docs),/Brak wolnej/);
 assert.throws(()=>apply(p,'full',[{source:'invoice',id:'a',amount:1000,date}],[{...docs[0],originKind:'purchases'}]));
});
test('reuse prior advances and protect them from overspending, changing purpose or deletion',()=>{
 const p=project();p.receipts=[{id:'cash-old',kind:'materials',amount:600,date:'2026-10-01'}];
 const next=apply(p,'partial',[{source:'advance',id:'cash-old',amount:600,date:'2026-10-01'}]);
 assert.equal(C.purchasePayment(next.purchases[0]).paid,600);assert.equal(C.purchaseTotals(next).advances,600);assert.equal(C.effectiveReceipts(next).length,1);
 assert.equal(C.purchaseTotals(next).outstanding,400);assert.equal(C.totals(next).remaining,400);
 const duplicate=structuredClone(next);duplicate.purchases.push({...next.purchases[0],id:'other'});assert.throws(()=>I.refreshReceiptLinks(duplicate));
 const changed=structuredClone(next);changed.receipts[0].kind='work';assert.throws(()=>I.refreshReceiptLinks(changed));
 changed.receipts=[];assert.throws(()=>I.refreshReceiptLinks(changed));
 const released=I.detachPurchase(next,'m');assert.equal(C.purchaseTotals(released).advances,600);assert.equal(C.purchasePayment(released.purchases[0]).paid,0);
});
test('reuse an invoiced advance without a second inflow; preserve other purchase and work allocations',()=>{
 let p=project();p.purchases.push({id:'other',amount:100,charge:100,paid:false,paidAmount:0});p.works=[{qty:1,price:2000,done:true}];
 p=I.apply(p,invoice('fv','2000'),[{key:'materials:advance',amount:1000,paid:1000},{key:'purchase:other',amount:100,paid:100},{key:'work:all',amount:200,paid:200}],date);
 const next=apply(p,'full',[{source:'invoice',id:'fv',amount:1000,date}],[invoice('fv','2000')]);
 assert.equal(C.purchaseTotals(next).advances,1100);assert.equal(C.purchaseTotals(next).outstanding,0);assert.equal(C.totals(next).paid,200);assert.equal(I.paid(next.invoiceSettlements[0]),1300);
 const released=apply(next,'unpaid',[],[invoice('fv','2000')]);assert.equal(C.purchaseTotals(released).advances,1100);assert.equal(C.purchasePayment(released.purchases[0]).paid,0);
 assert.equal(I.paid(released.invoiceSettlements[0]),1300);
});
test('an earlier receipt linked to a sales invoice is still counted once when assigned to the purchase',()=>{
 let p=project();p.receipts=[{id:'old',kind:'materials',amount:1000,date}];p=I.apply(p,invoice(),[],date,['old']);
 const next=apply(p,'full',[{source:'advance',id:'old',amount:1000,date}]);
 assert.equal(C.purchaseTotals(next).advances,1000);assert.equal(I.paid(next.invoiceSettlements[0]),1000);assert.equal(C.effectiveReceipts(next).length,1);
 assert.equal(C.effectiveReceipts(next)[0].invoiceId,'fv');assert.equal(C.purchasePayment(next.purchases[0]).paid,1000);
});
test('unchanged legacy and modern sources remain unchanged during a description or KSeF edit',()=>{
 const p=project();p.purchases[0]={id:'m',date,amount:100,charge:120,paid:true};
 const next=P.apply(p,{...p.purchases[0],description:'Edited'},{unchanged:true,state:'full',rows:P.rows(p,p.purchases[0])},[]);
 assert.equal(next.purchases[0].paidAmount,undefined);assert.equal(C.purchaseTotals(next).advances,0);assert.equal(C.purchaseTotals(next).charged,120);
 const modern=project();modern.purchases[0].paid=true;modern.purchases[0].paidAmount=1000;
 assert.throws(()=>P.apply(modern,{...modern.purchases[0],amount:100,charge:100},{unchanged:true,state:'full',rows:[]},[]),/nie pokrywają/);
});
