import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
test('one invoice paid on one date displays one summed row while preserving accounting allocations',()=>{
 const p=C.newProject('Test','Investor');p.invoiceSettlements=[{id:'fv',number:'A1/10/2026',date:'2026-10-19',allocations:[498,180.81,640.52,364.92,81.4].map((paid,i)=>({key:'purchase:'+i,kind:'purchase',paid}))}];
 const before=structuredClone(p),detailed=C.effectiveReceipts(p),rows=C.receiptRows(p);
 assert.equal(rows.length,1);assert.equal(rows[0].amount,1765.65);assert.equal(rows[0].invoiceId,'fv');assert.equal(rows[0].date,'2026-10-19');assert.equal(rows[0].kindLabel,'Zaliczka na materiały');assert.equal(detailed.length,5);assert.deepEqual(p,before);
});
test('grouping keeps invoices, dates and manual payments separate and describes mixed allocations',()=>{
 const p=C.newProject('Test','Investor');p.stages=[{id:'s',name:'Etap II'}];
 p.receipts=[{id:'manual',date:'2026-10-19',amount:10,kind:'work'}];
 p.invoiceSettlements=[{id:'a',number:'A',date:'2026-10-19',allocations:[{key:'p',kind:'purchase',paid:100},{key:'s',kind:'stage',id:'s',paid:200}]},{id:'b',number:'B',date:'2026-10-19',allocations:[{kind:'work',paid:50}]},{id:'a',number:'A',date:'2026-10-20',allocations:[{kind:'work',paid:25}]}];
 const rows=C.receiptRows(p);assert.equal(rows.length,4);assert.equal(rows[1].amount,300);assert.equal(rows[1].kindLabel,'Materiały i prace');assert.equal(rows[1].stageLabel,'Materiały, Etap II');
 assert.equal(rows.reduce((s,r)=>s+r.amount,0),C.effectiveReceipts(p).reduce((s,r)=>s+r.amount,0));
});
