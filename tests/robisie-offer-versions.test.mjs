import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import {buildDocument} from '../app/robisie/pdf.js';
const fixture=()=>{const p=C.newProject('Test','Inwestor');p.offer=[{id:'a',roomId:'r',name:'Malowanie',unit:'m²',category:'Ściany',qty:10,price:20,included:true},{id:'b',name:'Przygotowanie',qty:1,price:50,included:true}];p.discount=10;p.receipts=[{id:'receipt',kind:'work',amount:50}];p.purchases=[{id:'purchase',paid:true,amount:10,charge:10}];return p;};
test('nowa V2 staje się obowiązująca, przenosi zakres i rabat zamiast pozostawiać V1',()=>{
 const p=C.acceptOfferVersion(fixture(),'2026-10-11');assert.equal(p.activeOfferVersion,1);assert.equal(p.works.length,2);
 p.works[0].done=true;p.offer[0].qty=15;p.offer=p.offer.slice(0,1);p.offer.push({id:'c',name:'Sufit',qty:5,price:30,included:true});p.discount=5;
 const before=structuredClone(p),v2=C.acceptOfferVersion(p,'2026-10-12');
 assert.deepEqual(p,before);assert.equal(v2.activeOfferVersion,2);assert.equal(v2.workDiscount,5);assert.deepEqual(v2.works.map(x=>x.id),['a','c']);assert.equal(v2.works[0].qty,15);assert.equal(v2.works[0].done,false);
 assert.equal(C.totals(v2).agreed,427.5);assert.equal(C.totals(v2).works.after,427.5);assert.equal(C.totals(v2).change,0);
 assert.equal(C.totals(v2).workRemaining,377.5);assert.deepEqual(v2.receipts,p.receipts);assert.deepEqual(v2.purchases,p.purchases);
 assert.equal(v2.acceptedOffers[0].lines[0].qty,10);assert.equal(v2.offerCalculations[1].works[0].done,true);
});
test('przełączanie V1/V2 odtwarza własne poprawki i wykonanie bez zmiany wersji oferty',()=>{
 let p=C.acceptOfferVersion(fixture());p.works[0].price=25;p.works[0].done=true;p.changes=[{id:'change',name:'Zmiana'}];
 p.offer[0].price=30;p=C.acceptOfferVersion(p);assert.equal(p.works[0].done,true);p.works[0].qty=12;p.works[0].done=false;
 const v2=structuredClone(p.works);p=C.selectOfferVersion(p,1);assert.equal(p.works[0].price,25);assert.equal(p.works[0].done,true);assert.equal(p.workDiscount,10);assert.equal(p.changes[0].id,'change');assert.equal(C.activeOffer(p).version,1);assert.equal(C.totals(p).agreed,225);assert.equal(C.totals(p).works.after,270);
 p=C.selectOfferVersion(p,2);assert.deepEqual(p.works,v2);assert.equal(C.activeOffer(p).version,2);assert.equal(p.acceptedOffers[0].lines[0].price,20);assert.equal(p.acceptedOffers[1].lines[0].price,30);assert.throws(()=>C.selectOfferVersion(p,99),/Nie znaleziono/);
});
test('starsze dane nie tracą kalkulacji przy pierwszym wyborze wersji i kopia nie dziedziczy wyboru',()=>{
 const p=fixture();p.works=[{id:'legacy',qty:1,price:123,done:true}];p.acceptedOffers=[{version:1,lines:structuredClone(p.offer),discount:10},{version:3,lines:[{id:'new',qty:1,price:500}],discount:0}];
 assert.equal(C.activeOffer(p).version,3);const chosen=C.selectOfferVersion(p,3);assert.equal(chosen.works[0].id,'new');assert.equal(chosen.offerCalculations[1].works[0].price,123);
 const next=C.acceptOfferVersion(chosen);assert.equal(next.activeOfferVersion,4);
 const copy=C.copyProject(next,['offer','works'],'Kopia','Inwestor');assert.equal(copy.activeOfferVersion,undefined);assert.equal(copy.offerCalculations,undefined);assert.equal(copy.acceptedOffers.length,0);
});
test('wybrana V1 jest używana w umowie i pakiecie PDF, a jawny wydruk V2 pozostaje możliwy',()=>{
 let p=C.acceptOfferVersion(fixture());p.offer[0].name='Tylko wersja druga';p.offer[0].price=30;p=C.acceptOfferVersion(p);p=C.selectOfferVersion(p,1);
 const project={contract_number:'UUR-RS/2026/10/001',payload:p},settings={company:{}};
 assert.ok(C.contractTemplate(project,settings).includes('OFE-RS/2026/10/001/V1'));
 const html=buildDocument(project,settings,{modules:['data','offer','works']});assert.ok(html.includes('OFE-RS/2026/10/001/V1'));assert.ok(!html.includes('Tylko wersja druga'));
 const explicit=buildDocument(project,settings,{modules:['offer'],offer:p.acceptedOffers[1]});assert.ok(explicit.includes('OFE-RS/2026/10/001/V2'));assert.ok(explicit.includes('Tylko wersja druga'));
 assert.equal(C.MODULES.find(([key])=>key==='works')[1],'Kalkulacja końcowa');
});
