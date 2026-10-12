import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as C from '../app/robisie/core.js';
import * as PDF from '../app/robisie/pdf.js';
const trip=()=>({name:'Budowa',points:[{label:'Poufny adres startu',coords:[18.9,50.1]},{label:'Poufny adres końca',coords:[19,50]}],meters:44685.4,consumption:9,price:6.5,back:true});
test('Robisię calculator matches CleanFleet fuel arithmetic without shared application state',async()=>{
 const original={window:{}},adapted={window:{}};vm.runInNewContext(await fs.readFile(new URL('../app/dojazdy.js',import.meta.url),'utf8'),original);vm.runInNewContext(await fs.readFile(new URL('../app/robisie/dojazdy.js',import.meta.url),'utf8'),adapted);
 for(const values of [[150000,9,6.5],[44685.4,9,6.5],[0,9,6.5]])assert.equal(JSON.stringify(adapted.window.RSDojazdy.calculate(...values)),JSON.stringify(original.window.CFDojazdy.calculate(...values)));
 assert.equal(adapted.window.CFDojazdy,undefined);assert.equal(adapted.window.RSDojazdy.number('6,50'),6.5);assert.throws(()=>adapted.window.RSDojazdy.calculate(10000,0,6.5));
});
test('saved trip uses full distance and precise fuel calculation; offer price is an immutable snapshot',()=>{
 const saved=C.savedTrip(trip(),'trip');assert.equal(saved.km,44.6854);assert.equal(saved.cost,26.14);const line={id:'line',qty:3,...C.tripLineData(saved)};assert.equal(C.lineValue(line),78.42);saved.price=10;saved.cost=99;saved.name='Zmiana';assert.equal(line.price,26.14);assert.equal(line.travelBasis.name,'Budowa');assert.equal(C.isTravelService(line.name),true);assert.equal(C.isTravelService('Malowanie'),false);
 assert.throws(()=>C.savedTrip({...trip(),meters:-1}));assert.throws(()=>C.savedTrip({...trip(),price:0}));assert.throws(()=>C.savedTrip({...trip(),points:[]}));
});
test('PDF prints the offer travel line only, never the calculator or stored route details',()=>{
 const p=C.newProject('Test','Inwestor');p.trips=[C.savedTrip(trip(),'trip')];p.offer=[{id:'line',category:'Logistyczne',included:true,qty:3,...C.tripLineData(p.trips[0])}];
 const html=PDF.buildDocument({contract_number:'UUR-RS/2026/10/001',payload:p},{company:{}},{modules:['offer']});assert.ok(html.includes('Dojazd — Budowa'));assert.ok(html.includes('78,42'));assert.ok(!html.includes('Poufny adres'));assert.ok(!html.includes('Spalanie'));assert.ok(!PDF.MODULES.some(([key])=>key==='trips'));
});
