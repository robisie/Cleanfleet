const test=require('node:test'),assert=require('node:assert/strict'),S=require('../app/additional-services.js');
test('multiple additional services preserve exact cents and a separate wash amount',()=>{
 const items=S.normalize([{name:' Ozonowanie ',price:'100,50'},{name:'Usunięcie naklejek',price:'79.50'}]);
 assert.deepEqual(items,[{name:'Ozonowanie',price:100.5},{name:'Usunięcie naklejek',price:79.5}]);assert.equal(S.sum(items),180);
 const row={cost:580,wash_base_cost:400,additional_services:items,currency:'PLN'};assert.equal(S.base(row),400);assert.match(S.lines(row),/Pranie: 400,00 PLN/);assert.match(S.lines(row),/Ozonowanie: 100,50 PLN/);
 assert.equal(S.base({cost:580,additional_services:items}),400);assert.equal(S.base({cost:400}),400);
});
test('an additional service needs a description and an exact nonnegative amount',()=>{
 for(const item of [{name:'',price:10},{name:'A',price:''},{name:'A',price:-1},{name:'A',price:0.001},{name:'A',price:Infinity},{name:'A',price:'1e2'},{name:'A',price:10000000},{name:'A\nB',price:1}])assert.throws(()=>S.normalize([item]));
 assert.deepEqual(S.normalize([{name:'Gratis',price:0}]),[{name:'Gratis',price:0}]);assert.throws(()=>S.normalize(Array.from({length:21},()=>({name:'A',price:1}))));
});
test('saved descriptions are escaped in history; catalog identity is retained as a snapshot',()=>{
 const saved=S.normalize([{name:'<img src=x onerror=alert(1)>',price:'10.25',catalog_id:'catalog'}]);assert.equal(saved[0].catalog_id,'catalog');
 const html=S.html({cost:410.25,wash_base_cost:400,currency:'EUR',additional_services:saved});assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert.match(html,/10,25 EUR/);
 assert.equal(S.html({cost:400}), '');
});
