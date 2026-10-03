const test=require('node:test'),assert=require('node:assert/strict'),fx=require('../app/exchange-rate.js');
test('mixed sums use PLN, unpaid values follow quote and paid values stay fixed',()=>{
 const unpaid={currency:'EUR',cost:100,paid:false,wash_date:'2026-10-01'},paid={...unpaid,paid:true,pln_rate:4.25,pln_amount:425},pln={currency:'PLN',cost:150};
 fx.set({rate:4.25});assert.equal(fx.sum([unpaid,paid,pln]),1000);
 fx.set({rate:4.5});assert.equal(fx.amount(unpaid),450);assert.equal(fx.amount(paid),425);assert.equal(fx.sum([unpaid,paid,pln]),1025);
 assert.match(fx.format(unpaid),/€/);assert.match(fx.format(unpaid),/≈/);assert.doesNotMatch(fx.format(paid),/≈/);
 assert.equal(fx.amount({...paid,paid:false}),450);assert.equal(fx.amount({...paid,wash_date:null}),450);
});
test('round individual amounts before summing and keep split of linked earnings',()=>{
 fx.set({rate:4.2454});assert.equal(fx.amount({currency:'EUR',cost:225}),955.22);
 const e=fx.earnings({total_amount:100,employee_amount:30,my_amount:70},{currency:'EUR',cost:100});assert.equal(e.total_amount,424.54);assert.equal(e.employee_amount,127.36);assert.equal(e.my_amount,297.18);
});
test('report totals and saved old templates aggregate PLN but retain original EUR',()=>{
 global.CFExchange=fx;const E=require('../app/reports-engine.js');fx.set({rate:4.25});
 const data={wash_records:[{id:'a',cost:100,currency:'EUR',paid:false,wash_date:'2026-10-01'},{id:'b',cost:150,currency:'PLN'}]};
 const report=E.report(data,{source:'wash_records',filters:[],groups:[]});assert.equal(report.metrics.find(m=>m.id==='sum').value,575);assert.equal(report.rows[0].cost,100);
 const legacy=E.report(data,{source:'wash_records',filters:[],groups:[],amountField:'cost'});assert.equal(legacy.metrics.find(m=>m.id==='sum').value,575);
 delete global.CFExchange;
});
