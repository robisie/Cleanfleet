import test from 'node:test';import assert from 'node:assert/strict';import {stockMarkup} from '../bill/stock.js';import {wholeInvoiceFree,similarInvoiceCandidates} from '../bill/stock-suggestions.js';
const row=(index,hidden=false)=>({metadata:{ksefNumber:'DOC',invoiceNumber:'FV',currency:'PLN',seller:{name:'Sklep',nip:'1234567890'}},item:{index,name:'Towar '+index,unit:'szt.',gross:20},capacity:1,assigned:0,returned:0,available:1,hidden});
test('hidden goods leave regular filters, appear in hidden view and can be restored',()=>{const rows=[row(1),row(2,true)];const normal=stockMarkup(rows,'',{status:'available'}),hidden=stockMarkup(rows,'',{status:'hidden'});assert.match(normal,/Towar 1/);assert.doesNotMatch(normal,/Towar 2/);assert.match(hidden,/Towar 2/);assert.doesNotMatch(hidden,/Towar 1/);assert.match(hidden,/Przywróć na listę/);assert.doesNotMatch(hidden,/data-kf="stock-invoice-assign"/);assert.doesNotMatch(normal,/Przypisz całą fakturę/);assert.match(stockMarkup(rows,'',{blocked:true}),/data-kf="stock-hide"[^>]*>Ukryj/);assert.match(stockMarkup([{...rows[1],hidden:false}]),/Towar 2/);});
test('hidden lines are excluded from supplier-wide assignment proposals',()=>{const goods=row(1,true),source={...row(2),metadata:{...goods.metadata,ksefNumber:'SOURCE'}};assert.equal(wholeInvoiceFree([goods]),false);assert.equal(similarInvoiceCandidates([source,goods],'SOURCE').candidates.length,0);});

test('receipt and invoice headings offer whole-document visibility in every stock filter',()=>{
 for(const receipt of [false,true])for(const status of ['available','returned','hidden']){
 const goods={...row(1,status==='hidden'),returned:1,manualReturned:1,metadata:{...row(1).metadata,...(receipt?{source:'nip-receipt'}:{})}};
 const html=stockMarkup([goods],'',{status,blocked:true}),heading=html.split('<article')[0];
 assert.match(heading,/data-kf="stock-document-hide" data-number="DOC"/);
 assert.match(heading,new RegExp('data-hidden="'+(status==='hidden'?'false':'true')+'"'));
 assert.match(heading,status==='hidden'?/Przywróć cały dokument/:receipt?/Ukryj cały paragon/:/Ukryj całą fakturę/);
 }
});
