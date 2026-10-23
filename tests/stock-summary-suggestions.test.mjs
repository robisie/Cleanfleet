import test from 'node:test';
import assert from 'node:assert/strict';
import {stockSummaryData,stockSummaryMarkup} from '../bill/stock-summary.js';
import {similarInvoiceCandidates,supplierSuggestionMarkup} from '../bill/stock-suggestions.js';

const metadata=(id,nip='1234567890',extra={})=>({ksefNumber:id,invoiceNumber:'FV/'+id,issueDate:'2026-10-01',currency:'PLN',seller:{nip,name:'BNP Paribas'},...extra});
const item=(id,index,extra={})=>({metadata:metadata(id),item:{index,name:'Towar '+index,unit:'szt.',gross:100},capacity:10,available:10,assigned:0,returned:0,projectAssigned:0,cleanfleetAssigned:0,classifiedAuto:0,classifiedCompany:0,...extra});

test('summary values partial allocations, returns once and remaining goods in every destination',()=>{
 const row=item('a',1,{capacity:10,available:2,assigned:7,returned:1,manualReturned:1,correctedReturned:1,projectAssigned:3,cleanfleetAssigned:1,classifiedAuto:1,classifiedCompany:2});
 const {totals,byUnit}=stockSummaryData([row]);
 for(const [key,cents] of Object.entries({purchased:10000,assigned:7000,returned:1000,available:2000,robisie:3000,cleanfleet:1000,auto:1000,company:2000}))assert.equal(totals[key].amounts.get('PLN'),cents,key);
 assert.equal(byUnit.get('szt.').available,2);
 const html=stockSummaryMarkup([row]);for(const label of ['Koszty firmowe','Auto','CleanFleet','Robisię · inwestycje','Na stanie','Zwrócono','Stan ilościowy','Sklep / wystawca'])assert.ok(html.includes(label),label);
 assert.match(html,/Co zostało w magazynie — 1 pozycji/);
});
test('summary keeps distinct currencies and units, counts invoices once and shows conflicts',()=>{
 const rows=[item('a',1),item('a',2,{item:{index:2,name:'<script>','unit':'m2',gross:50}}),item('b',1,{metadata:metadata('b','555',{currency:'EUR'}),conflict:true,warning:'Sprawdź korektę'})];
 const {totals,byUnit}=stockSummaryData(rows);assert.equal(totals.purchased.invoices.size,2);assert.equal(totals.available.positions,3);assert.equal(totals.available.amounts.get('PLN'),15000);assert.equal(totals.available.amounts.get('EUR'),10000);assert.equal(byUnit.get('szt.').available,20);assert.equal(byUnit.get('m²').available,10);
 const html=stockSummaryMarkup(rows,{incomplete:true});assert.match(html,/150,00\s+zł/);assert.match(html,/100,00\s+€/);assert.match(html,/&lt;script&gt;/);assert.match(html,/przekraczają zakupioną ilość/);assert.match(html,/Część dokumentów/);
 assert.doesNotMatch(stockSummaryMarkup([]),/NaN|Infinity/);
});
test('supplier proposals use all months and all invoice rows, ignoring used or returned invoices',()=>{
 const rows=[item('source',1,{available:0,assigned:10,classifiedCompany:10}),item('old',1,{metadata:metadata('old','PL 123-456-78-90',{issueDate:'2026-01-01'})}),item('old',2,{metadata:metadata('old','1234567890',{issueDate:'2026-01-01'})}),item('used',1),item('used',2,{available:9,assigned:1}),item('returned',1,{available:0,returned:10}),item('other',1,{metadata:metadata('other','9999999999')}),item('foreign',1,{metadata:metadata('foreign','1234567890',{currency:'EUR'})})];
 const {candidates,unavailable}=similarInvoiceCandidates(rows,'source');assert.equal(candidates.length,1);assert.equal(candidates[0].metadata.ksefNumber,'old');assert.deepEqual(candidates[0].indices,[1,2]);assert.equal(candidates[0].amount,200);assert.equal(unavailable,3);
 const html=supplierSuggestionMarkup(candidates,'Koszty firmowe',unavailable);assert.equal((html.match(/name="invoice"/g)||[]).length,1);assert.match(html,/value="old" checked/);assert.match(html,/2026-01-01/);assert.match(html,/200,00\s+zł/);
});
test('supplier name fallback requires both NIPs missing and escapes invoice labels',()=>{
 const rows=[item('source',1,{metadata:metadata('source','',{seller:{name:'BNP   Paribas'}})}),item('same',1,{metadata:metadata('same','',{seller:{name:' BNP Paribas '},invoiceNumber:'<img>'})}),item('different',1,{metadata:metadata('different','1111111111')}),item('empty',1,{metadata:metadata('empty','',{seller:{}})})];
 const {candidates}=similarInvoiceCandidates(rows,'source');assert.equal(candidates.length,1);assert.match(supplierSuggestionMarkup(candidates,'<Auto>'),/&lt;img&gt;/);assert.match(supplierSuggestionMarkup(candidates,'<Auto>'),/&lt;Auto&gt;/);
});
