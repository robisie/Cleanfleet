import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as I from '../app/robisie/invoices.js';
const invoice=(id='fv',total='2000.00')=>({id,number:'A1',status:'issued',payload:{currency:'PLN',lines:[{qty:'1',price:total}],source:{app:'robisie',id:'p'}}});
function project(){const p=C.newProject('Test','Investor');p.offer=[{qty:1,price:2000}];p.works=[{qty:1,price:2000,done:true}];p.stages=[{id:'s1',percent:50,name:'I'},{id:'s2',percent:50,name:'II'}];p.purchases=[{id:'m',amount:800,charge:1000,paid:true,paidAmount:200}];return p;}
const apply=(p,rows,id='fv',total='2000.00')=>I.apply(p,invoice(id,total),rows,'2026-10-20');
test('invoice split across materials and two stages counts actual partial receipts once',()=>{
 const original=project(),p=apply(original,[{key:'purchase:m',amount:800,paid:300},{key:'stage:s1',amount:500,paid:200},{key:'stage:s2',amount:500,paid:100}]);
 assert.equal(C.purchasePayment(p.purchases[0]).paid,500);assert.equal(C.purchaseTotals(p).advances,500);assert.equal(C.purchaseTotals(p).outstanding,500);
 assert.equal(C.totals(p).paid,300);assert.equal(C.totals(p).remaining,2200);
 assert.equal(C.effectiveReceipts(p).find(r=>r.invoiceId==='fv').date,'2026-10-20');
 assert.equal(C.totals(original).paid,0);assert.equal(original.invoiceSettlements,undefined);
 const repeat=apply(p,[{key:'purchase:m',amount:800,paid:300},{key:'stage:s1',amount:500,paid:200},{key:'stage:s2',amount:500,paid:100}]);
 assert.equal(C.purchaseTotals(repeat).advances,500);assert.equal(repeat.invoiceSettlements.length,1);
});
test('planned assignments alone do not pay purchases or work; full receipt clears material balance',()=>{
 let p=apply(project(),[{key:'purchase:m',amount:800,paid:0}]);assert.equal(C.purchaseTotals(p).outstanding,800);
 p=apply(p,[{key:'purchase:m',amount:800,paid:800}]);assert.equal(C.purchasePayment(p.purchases[0]).state,'full');assert.equal(C.purchaseTotals(p).advances,1000);
 p=apply(p,[]);assert.equal(C.purchasePayment(p.purchases[0]).paid,200);assert.equal(C.purchaseTotals(p).advances,200);
});
test('editing one invoice preserves another; rejects exceeding invoice or outstanding amount',()=>{
 let p=apply(project(),[{key:'purchase:m',amount:300,paid:300}]);p=apply(p,[{key:'purchase:m',amount:200,paid:200}],'other');
 p=apply(p,[{key:'purchase:m',amount:100,paid:100}]);assert.equal(C.purchasePayment(p.purchases[0]).paid,500);
 assert.throws(()=>apply(p,[{key:'purchase:m',amount:900,paid:900}]));
 assert.throws(()=>apply(project(),[{key:'stage:s1',amount:1000,paid:0}],'fv','500.00'));
 assert.throws(()=>apply(project(),[{key:'stage:s1',amount:100,paid:101}]));
 assert.throws(()=>apply(project(),[{key:'stage:s1',amount:1000,paid:1000},{key:'work:all',amount:1500,paid:1500}],'fv','3000.00'));
});
test('manual full payment retains invoice attribution and does not double count advances',()=>{
 const p=apply(project(),[{key:'purchase:m',amount:300,paid:300}]);p.purchases[0].paidAmount=1000-C.invoicePurchasePaid(p.purchases[0]);
 assert.equal(C.purchasePayment(p.purchases[0]).paid,1000);assert.equal(C.purchaseTotals(p).advances,1000);
 const copy=C.copyProject(p,['purchases'],'Copy','Investor');assert.equal(copy.invoiceSettlements,undefined);assert.equal(C.invoicePurchasePaid(copy.purchases[0]),0);
});
test('cannot settle draft, correction, foreign currency or unknown target',()=>{
 for(const row of [{...invoice(),status:'draft'},{...invoice(),payload:{...invoice().payload,correction:{}}},{...invoice(),payload:{...invoice().payload,currency:'EUR'}}])assert.throws(()=>I.apply(project(),row,[],'2026-10-20'));
 assert.throws(()=>apply(project(),[{key:'purchase:missing',amount:1,paid:1}]));
});
test('linking existing advances and purchase payments changes invoice attribution without changing balances',()=>{
 const p=project();p.receipts=[{id:'advance',date:'2026-10-06',kind:'materials',amount:500,note:'Zaliczka'}];
 const before=C.totals(p),available=I.availableReceipts(p,'fv');assert.deepEqual(available.map(r=>r.id),['advance','purchase-payment:m']);
 const linked=I.apply(p,invoice(),[],'2026-10-20',['advance','purchase-payment:m']);
 assert.equal(I.paid(linked.invoiceSettlements[0]),700);assert.equal(I.assigned(linked.invoiceSettlements[0]),700);assert.deepEqual(C.totals(linked),before);
 assert.equal(C.effectiveReceipts(linked).find(r=>r.id==='advance').invoiceId,'fv');assert.equal(C.effectiveReceipts(linked).find(r=>r.id==='advance').date,'2026-10-06');
 const edited=I.apply(linked,invoice(),[],'2026-10-20',['advance','purchase-payment:m']);assert.deepEqual(C.totals(edited),before);assert.equal(I.paid(edited.invoiceSettlements[0]),700);
 assert.throws(()=>I.apply(linked,invoice('second'),[],'2026-10-20',['advance']));
 const unlinked=I.apply(linked,invoice(),[],'2026-10-20',[]);assert.deepEqual(C.totals(unlinked),before);assert.equal(C.effectiveReceipts(unlinked).find(r=>r.id==='advance').invoiceId,undefined);
});
test('existing receipts and new payments share the invoice limit and account separately',()=>{
 const p=project();p.receipts=[{id:'old',date:'2026-10-05',kind:'work',amount:400}];
 const linked=I.apply(p,invoice('fv','1000.00'),[{key:'stage:s2',amount:600,paid:600}],'2026-10-20',['old']);
 assert.equal(I.paid(linked.invoiceSettlements[0]),1000);assert.equal(C.totals(linked).paid,1000);
 assert.throws(()=>I.apply(p,invoice('fv','999.00'),[{key:'stage:s2',amount:600,paid:600}],'2026-10-20',['old']));
 assert.throws(()=>I.apply(p,invoice(),[],'2026-10-20',['missing']));
 assert.throws(()=>I.apply(p,invoice(),[],'2026-10-20',['old','old']));
});
test('receipt edits update linked invoice amounts and cannot exceed it or delete a linked receipt',()=>{
 const p=project();p.receipts=[{id:'old',date:'2026-10-05',kind:'materials',amount:500}];
 const linked=I.apply(p,invoice('fv','700.00'),[],'2026-10-20',['old']);
 linked.receipts[0].amount=600;I.refreshReceiptLinks(linked);assert.equal(I.paid(linked.invoiceSettlements[0]),600);
 linked.receipts[0].amount=800;assert.throws(()=>I.refreshReceiptLinks(linked));
 linked.receipts=[];assert.throws(()=>I.refreshReceiptLinks(linked));
});
