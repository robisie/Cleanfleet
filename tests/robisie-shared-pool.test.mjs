import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as S from '../app/robisie/purchase-settlement.js';
import * as P from '../app/robisie/purchase-payments.js';
import * as I from '../app/robisie/invoices.js';

function project(){
 const p=C.newProject('Wspólne rozliczenie','Inwestor');p.mixedSettlement=true;
 p.receipts=[{id:'received',kind:'work',amount:1000,date:'2026-07-01',note:'Wpłata'}];
 p.works=[{id:'work',qty:1,price:600,done:true,included:true,name:'Praca'}];
 p.purchases=[{id:'purchase',date:'2026-07-02',amount:200,charge:200,paid:false,paidAmount:0,description:'Materiał'}];
 return p;
}
test('shared costs exist before allocation; allocating existing money does not alter cash or the final balance',()=>{
 const p=project();assert.equal(C.settlementTotals(p).balance,200);assert.equal(C.totals(p).remaining,-200);
 assert.equal(P.advances(p,'purchase')[0].available,1000);
 const next=S.plan(p,[],[{key:'advance:received',amount:200,newAmount:0}]).project;
 I.validateReceiptAllocations(next);
 assert.equal(C.purchasePayment(next.purchases[0]).remaining,0);
 assert.equal(C.effectiveReceipts(next).reduce((s,r)=>s+r.amount,0),1000);
 assert.equal(C.receiptRows(next).length,1);assert.equal(C.settlementTotals(next).balance,200);
 assert.equal(C.totals(next).paid,800);assert.equal(S.sources(next,[])[0].available,800);
 const detached=I.detachPurchase(next,'purchase');assert.equal(C.settlementTotals(detached).balance,200);
 assert.equal(C.effectiveReceipts(detached).length,1);assert.equal(S.sources(detached,[])[0].available,1000);
});
test('ordinary investments retain separate work and material advances',()=>{
 const p=project();p.mixedSettlement=false;
 assert.equal(P.advances(p,'purchase').length,0);assert.equal(S.sources(p,[]).length,0);
 p.purchases[0].receiptPayments={received:200};assert.throws(()=>I.validateReceiptAllocations(p),/zaliczki/);
});
test('grouped display keeps separate receipt IDs available for settlements and editing',()=>{
 const p=project();p.receipts=[200,200,250,100].map((amount,i)=>({id:'r'+i,kind:'work',amount,note:'Za Włochy',displayGroup:'italy',settlementCategory:'Zwroty'}));
 const rows=C.receiptRows(p);assert.equal(rows.length,1);assert.equal(rows[0].amount,750);
 assert.equal(rows[0].parts.length,4);assert.equal(C.effectiveReceipts(p).length,4);
 assert.equal(C.settlementTotals(p).rows.filter(r=>r.plus).length,1);
 assert.equal(S.sources(p,[]).reduce((n,r)=>n+r.available,0),750);
});
test('actual cash received at a shared purchase is counted in every balance once',()=>{
 let p=project();p.receipts=[];p=P.apply(p,p.purchases[0],{state:'full',rows:[{source:'cash',amount:200,date:'2026-07-02'}]},[]);
 assert.equal(C.effectiveReceipts(p).length,1);assert.match(C.receiptRows(p)[0].note,/Wpłata inwestora/);
 assert.equal(C.settlementTotals(p).balance,-600);assert.equal(C.totals(p).remaining,600);
});
