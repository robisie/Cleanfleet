import test from 'node:test';
import assert from 'node:assert/strict';
import {stockMarkup,stockDestinationsMarkup} from '../bill/stock.js';
const row={metadata:{ksefNumber:'receipt-test',source:'nip-receipt',invoiceNumber:'123',issueDate:'2026-10-30',currency:'PLN',seller:{name:'Sklep'}},item:{index:1,name:'Farba',unit:'szt.',gross:100},capacity:10,assigned:6,returned:0,available:4};
test('warehouse row shows each destination and its allocated quantity beneath purchase totals',()=>{
 const html=stockMarkup([{...row,destinations:[{kind:'robisie',name:'Schody',quantity:2},{kind:'robisie',name:'Łazienka',quantity:1},{kind:'cleanfleet',name:'TVM',quantity:1},{kind:'auto',quantity:1},{kind:'firmowe',quantity:1}]}]);
 assert.match(html,/Zakupiono: 10 szt\./);assert.match(html,/Schody: 2 szt\./);assert.match(html,/Łazienka: 1 szt\./);assert.match(html,/CleanFleet · TVM: 1 szt\./);assert.match(html,/Auto: 1 szt\./);assert.match(html,/Koszty firmowe: 1 szt\./);
 assert(html.indexOf('stock-destination')>html.indexOf('Zakupiono:'));
});
test('destination names are escaped, zero assignments hidden, and fully allocated stock stays hidden',()=>{
 const assigned={...row,destinations:[{kind:'robisie',name:'<img src=x>',quantity:1},{kind:'auto',quantity:0}]};
 assert.match(stockDestinationsMarkup(assigned),/&lt;img src=x&gt;: 1 szt\./);assert.doesNotMatch(stockDestinationsMarkup(assigned),/Auto:/);
 assert.doesNotMatch(stockMarkup([{...assigned,available:0}]),/stock-destination/);
 assert.equal(stockDestinationsMarkup({...row,destinations:[]}), '');
});
