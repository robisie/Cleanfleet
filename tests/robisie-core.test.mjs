import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
test('pomiary sumują części i odliczają otwory oraz wspólne ściany',()=>{
 const area=C.roomArea({parts:[{length:4,width:3,height:2.6},{length:2,width:1,height:2.6}],openings:2,sharedWalls:5.2});
 assert.equal(area.floor,14);assert.equal(area.ceiling,14);assert.equal(area.walls,44.8);
});
test('historyczny pomiar źródłowy obowiązuje do zmiany geometrii',()=>{
 const room={parts:[{length:1.12,width:3.31,height:2.6},{length:1.22,width:2.32,height:2.6}],openings:0,sharedWalls:0};room.sourceAreas={geometry:JSON.stringify([room.parts,0,0]),values:{floor:3.7072,ceiling:3.7072,walls:41.444}};
 assert.equal(C.roomArea(room).floor,3.7072);room.parts=room.parts.map(p=>({height:p.height,width:p.width,length:p.length}));assert.equal(C.roomArea(room).floor,3.7072);room.parts[1].width=3;assert.equal(C.roomArea(room).floor,7.3672);
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
test('pomiary mają dwa miejsca i zaokrąglenie w górę bez błędu zmiennoprzecinkowego',()=>{
 assert.equal(C.roundUp(1.001),1.01);assert.equal(C.roundUp('2,345'),2.35);assert.equal(C.roundUp(1.1),1.1);assert.equal(C.roundUp(1.12),1.12);assert.equal(C.measurement(3.7072),'3,71');assert.equal(C.measurement(2),'2,00');
});
test('kopia ma nowe identyfikatory i relacje, bez starych wpłat, numerów i akceptacji',()=>{
 const source=C.newProject('Stara','Inwestor','2025-01-01');source.status='zakonczona';source.rooms=[{id:'room',name:'Hol',length:2,width:3,height:2.6}];source.offer=[{id:'offer',roomId:'room',name:'Praca',qty:10,price:20,done:true}];source.works=[{id:'work',roomId:'room',qty:8,price:20,done:true}];source.receipts=[{kind:'work',amount:160},{kind:'materials',amount:50}];source.acceptedOffers=[{version:3,lines:source.offer}];source.changes=[{accepted:true}];source.contractText='Stary numer UUR-RS/2025/01/001';source.sourceImport={fileName:'Historia'};source.purchases=[{id:'purchase',date:'2025-01-01',shop:'Sklep',amount:50,charge:60,paid:true,invoice:'STARA FV'}];source.journal=[{id:'journal',roomId:'room',date:'2025-01-01',description:'Opis',investorConfirmed:true}];source.stages[0].due='2025-01-01';source.stages[0].invoice='FV';source.handover={date:'2025-01-01',notes:'Uwagi',accepted:true};const snapshot=structuredClone(source);
 const copy=C.copyProject(source,C.COPY_SECTIONS.map(x=>x[0]),'Nowa','Nowy inwestor','2026-10-09');
 assert.deepEqual(source,snapshot);assert.equal(copy.name,'Nowa');assert.equal(copy.investor,'Nowy inwestor');assert.equal(copy.contractDate,'2026-10-09');assert.equal(copy.status,'przygotowanie');
 assert.notEqual(copy.rooms[0].id,'room');assert.equal(copy.offer[0].roomId,copy.rooms[0].id);assert.equal(copy.works[0].roomId,copy.rooms[0].id);assert.equal(copy.journal[0].roomId,copy.rooms[0].id);assert.notEqual(copy.offer[0].id,'offer');assert.equal(copy.works[0].done,false);
 assert.equal(copy.receipts.length,0);assert.equal(copy.acceptedOffers.length,0);assert.equal(copy.changes.length,0);assert.equal(copy.contractText,'');assert.equal(copy.sourceImport,undefined);assert.equal(copy.purchases[0].paid,false);assert.equal(copy.purchases[0].invoice,'');assert.equal(copy.stages[0].due,'');assert.equal(copy.stages[0].invoice,'');assert.equal(copy.journal[0].date,'');assert.equal(copy.journal[0].investorConfirmed,false);assert.equal(copy.handover.accepted,false);assert.equal(C.totals(copy).paid,0);assert.equal(C.purchaseTotals(copy).spent,0);
 const partial=C.copyProject(source,['offer'],'Częściowa','Test');assert.equal(partial.offer.length,1);assert.equal(partial.rooms.length,1);assert.equal(partial.works.length,0);assert.equal(partial.purchases.length,0);assert.equal(partial.journal.length,0);
});
test('zestawienie sortuje liczby numerycznie w obu kierunkach i nie zmienia danych',()=>{
 const rows=[{name:'B',category:'Ściany',qty:10,value:100},{name:'A',category:'Podłogi',qty:2,value:200}];assert.deepEqual(C.sortSummary(rows,'qty').map(x=>x.qty),[2,10]);assert.deepEqual(C.sortSummary(rows,'value',-1).map(x=>x.value),[200,100]);assert.deepEqual(C.sortSummary(rows,'name').map(x=>x.name),['A','B']);assert.equal(rows[0].name,'B');
});
test('kwota wiersza inwestycji bierze kalkulację prac, a przed realizacją ofertę',()=>{
 const p=C.newProject('Test','Test');p.offer=[{qty:1,price:100}];p.discount=10;assert.equal(C.finalWorkAmount(p),90);p.works=[{qty:2,price:100}];p.workDiscount=20;assert.equal(C.finalWorkAmount(p),160);
});
test('ryczałt i obniżka z historii nie tworzą fikcyjnych wpłat',()=>{
 const p=C.newProject('Historia','Test');p.calculationPrecision='source';p.offer=[{qty:1,price:90,calculationPrecision:'source'}];p.acceptedOffers=[{lines:p.offer,discount:0,agreedAmount:100}];p.works=[{qty:1,price:150,calculationPrecision:'source'}];p.receipts=[{kind:'work',amount:100},{kind:'materials',amount:20}];p.purchases=[{paid:true,amount:22,charge:25}];p.workCredit=30;
 const t=C.totals(p);assert.equal(t.agreed,100);assert.equal(t.paid,100);assert.equal(t.workRemaining,20);assert.equal(t.remaining,25);assert.equal(C.finalWorkAmount(p),120);
 const copied=C.copyProject(p,['offer','works'],'Kopia','Test');assert.equal(copied.workCredit,undefined);assert.equal(copied.acceptedOffers.length,0);
});
test('kategorie korzystają z istniejącej pisowni bez duplikatów spacji i wielkości liter',()=>{
 const names=C.categoryNames([' Malowanie  ścian ','MALOWANIE ŚCIAN','Hydraulika','',null]);
 assert.equal(names.length,2);assert.equal(C.canonicalCategory('  malowanie   ŚCIAN ',names),'Malowanie ścian');assert.equal(C.canonicalCategory('Nowa kategoria',names),'Nowa kategoria');assert.throws(()=>C.canonicalCategory('  ',names));
});
test('wybrane ściany liczą tylko zaznaczone powierzchnie z indywidualnymi odliczeniami',()=>{
 const walls=C.roomWalls({length:4,width:3,height:2.6,openings:7});assert.equal(walls.length,4);
 assert.equal(C.selectedWallArea([{...walls[0],deduction:'1,2+0,8'},{...walls[1],deduction:1}]),15.2);
 assert.throws(()=>C.selectedWallArea([]));assert.throws(()=>C.selectedWallArea([{...walls[0],deduction:11}]));assert.throws(()=>C.selectedWallArea([{...walls[0],deduction:'2+'}]));
 assert.equal(C.roomWalls({height:2.6,parts:[{length:4,width:3},{length:2,width:1,height:3}]}).at(-1).area,3);
});
test('powierzchnie łączą dwie ściany z sufitem i podłogą bez podwójnego liczenia ścian',()=>{
 const room={length:4,width:3,height:2.6,openings:2},walls=C.roomWalls(room).slice(0,2).map((wall,i)=>({...wall,deduction:i===0?2:0}));
 assert.equal(C.selectedSurfaceArea(room,walls,{ceiling:true}),28.2);
 assert.equal(C.selectedSurfaceArea(room,walls,{ceiling:true,floor:true}),40.2);
 assert.equal(C.selectedSurfaceArea(room,[],{ceiling:true}),12);
 assert.equal(C.selectedSurfaceArea(room,walls,{walls:true,ceiling:true}),46.4);
 assert.throws(()=>C.selectedSurfaceArea(room,[],{}));
});
