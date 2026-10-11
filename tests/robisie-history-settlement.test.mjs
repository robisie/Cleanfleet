import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
test('confirmed historical totals preserve detail, separate materials and expire after financial edits',()=>{
 const p=C.newProject('Historia','Inwestor');p.calculationPrecision='source';p.offer=[{id:'o',name:'Praca',qty:10,price:100,included:true}];p.works=[{id:'w',name:'Praca',qty:20,price:100,included:true,done:true}];p.workDiscount=5;
 p.sourceCalculation={offer:{amount:800,basis:C.calculationBasis(p.offer,0)},works:{amount:1500,basis:C.calculationBasis(p.works,5)}};
 p.receipts=[{kind:'work',amount:1500},{kind:'materials',amount:200}];p.purchases=[{amount:290,charge:300,paid:true}];
 assert.equal(C.totals(p).offer.after,800);assert.equal(C.finalWorkAmount(p),1500);assert.equal(C.totals(p).works.done,1500);assert.equal(C.totals(p).workRemaining,0);assert.equal(C.totals(p).remaining,100);
 p.works[0].done=false;assert.equal(C.totals(p).works.after,1500);assert.equal(C.totals(p).works.done,0);
 const copy=C.copyProject(p,['offer','works'],'Nowa','Nowy');assert.equal(copy.sourceCalculation,undefined);
 p.works[0].price=101;assert.equal(C.totals(p).works.sourceAmountApplied,undefined);assert.equal(C.totals(p).works.after,1919);
 p.works[0].price=100;p.workDiscount=6;assert.equal(C.totals(p).works.sourceAmountApplied,undefined);
});
