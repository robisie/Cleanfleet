import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
test('pomiary sumują części i odliczają otwory oraz wspólne ściany',()=>{
 const area=C.roomArea({parts:[{length:4,width:3,height:2.6},{length:2,width:1,height:2.6}],openings:2,sharedWalls:5.2});
 assert.equal(area.floor,14);assert.equal(area.ceiling,14);assert.equal(area.walls,44.8);
});
test('historyczny pomiar źródłowy obowiązuje do zmiany geometrii',()=>{
 const room={parts:[{length:1.12,width:3.31,height:2.6},{length:1.22,width:2.32,height:2.6}],openings:0,sharedWalls:0};room.sourceAreas={geometry:JSON.stringify([room.parts,0,0]),values:{floor:3.7072,ceiling:3.7072,walls:41.444}};
 assert.equal(C.roomArea(room).floor,3.7072);room.parts[1].width=3;assert.equal(C.roomArea(room).floor,7.3672);
});
test('import Numbers zaokrągla sumę, zachowując precyzję cen i salda',()=>{
 const lines=[{qty:1,price:1.004,done:true,calculationPrecision:'source'},{qty:1,price:1.004,done:true,calculationPrecision:'source'}];assert.equal(C.workTotals(lines).after,2.01);
 const p=C.newProject('Historia','Test');p.calculationPrecision='source';p.works=lines;p.receipts=[{kind:'work',amount:2.014}];assert.equal(C.totals(p).remaining,-.01);
});
test('zakres, wykonanie i rabat są liczone osobno',()=>{
 const t=C.workTotals([{qty:10,price:20,done:true},{qty:5,price:30,done:false},{qty:5,price:100,included:false,done:true}],10);
 assert.deepEqual({before:t.before,after:t.after,done:t.done},{before:350,after:315,done:180});
});
test('saldo nie podwaja zaliczek na materiały ani wpłat za pracę',()=>{
 const p=C.newProject('Test','Test');p.offer=[{qty:1,price:1000}];p.works=[{qty:1,price:1200,done:true}];p.acceptedOffers=[{lines:[{qty:1,price:1000}],discount:0}];
 p.receipts=[{kind:'work',amount:400},{kind:'materials',amount:500}];p.purchases=[{amount:550,charge:600,paid:true},{amount:100,charge:100,paid:false}];
 const t=C.totals(p);assert.equal(t.change,200);assert.equal(t.paid,400);assert.equal(t.materials.balance,-100);assert.equal(t.materials.actualBalance,-50);assert.equal(t.remaining,900);
});
test('załączniki zachowują identyfikator umowy i wersję',()=>{
 const p={contract_number:'UUR-RS/2026/06/001'};assert.equal(C.attachment(p,'WYM'),'WYM-RS/2026/06/001');assert.equal(C.attachment(p,'OFE',2),'OFE-RS/2026/06/001/V2');
});
test('zestawienie sumuje usługę w wielu pomieszczeniach, nie miesza jednostek',()=>{
 const result=C.aggregate([{serviceId:'a',name:'Malowanie',category:'Ściany',unit:'m²',qty:20,price:10},{serviceId:'a',name:'Malowanie',category:'Ściany',unit:'m²',qty:30,price:12}]);
 assert.equal(result.length,1);assert.equal(result[0].qty,50);assert.equal(result[0].value,560);
});
