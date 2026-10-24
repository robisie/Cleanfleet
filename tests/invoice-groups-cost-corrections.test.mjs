import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceGroups} from '../bill/invoice-groups.js';
import * as C from '../app/robisie/core.js';

const row=(id,date,originalId)=>({id,number:id,payload:{issueDate:date,...(originalId?{correction:{originalId}}:{})}});
test('Bill always anchors on original and groups correction chains across month and search filters',()=>{
 const source=row('original','2026-01-01'),first=row('correction','2026-04-01','original'),second=row('next','2026-05-01','correction'),other=row('other','2026-05-02');
 const all=[second,other,first,source],result=invoiceGroups([second],all);
 assert.deepEqual(result.map(r=>r.id),['original','correction','next']);assert.equal(result[0].related,false);assert.equal(result[1].related,true);assert.equal(result[0].outsideFilter,true);assert.equal(result[2].outsideFilter,false);
 assert.deepEqual(invoiceGroups(all,all).map(r=>r.id),['original','correction','next','other']);
});
test('Bill does not join unrelated printed numbers or duplicate cyclic correction rows',()=>{
 const a=row('a','2026-01-01','b'),b=row('b','2026-01-02','a'),other=row('other','2026-01-03');a.number=b.number=other.number='A1';
 assert.equal(invoiceGroups([a,b,other]).length,3);assert.equal(invoiceGroups([other],[a,b,other]).length,1);
});
test('cost correction reduces actual and investor costs and preserves paid cash as credit',()=>{
 const item={id:'purchase',amount:480,charge:480,paid:true,paidAmount:600,invoicePayments:{},receiptPayments:{},ksefCorrections:[{amount:-120}]};
 const project={purchases:[item],receipts:[],invoiceSettlements:[]},t=C.purchaseTotals(project);
 assert.equal(t.spent,480);assert.equal(t.charged,480);assert.equal(t.advances,600);assert.equal(t.balance,120);assert.equal(C.purchasePayment(item).paid,600);assert.equal(C.purchasePayment(item).overpaid,120);assert.equal(C.purchasePayment(item).remaining,0);assert.match(C.purchasePaymentLabel(item),/Nadpłata po korekcie/);
});
test('cost correction preserves invoice payments and historical receipt totals',()=>{
 const correction=[{amount:-120}],invoiceItem={id:'p',amount:480,charge:480,paid:false,paidAmount:0,invoicePayments:{sale:600},ksefCorrections:correction};
 const project={purchases:[invoiceItem],receipts:[],invoiceSettlements:[{id:'sale',number:'A1',allocations:[{kind:'purchase',id:'p',paid:600}]}]};
 assert.equal(C.purchaseTotals(project).advances,600);assert.equal(C.purchaseTotals(project).balance,120);
 const legacy={purchases:[{id:'p',amount:480,charge:480,paid:true,correctionPaidBaseline:600,ksefCorrections:correction}],receipts:[{kind:'materials',amount:600}]};
 assert.equal(C.purchaseTotals(legacy).spent,480);assert.equal(C.purchaseTotals(legacy).balance,120);assert.equal(C.effectiveReceipts(legacy).length,1);assert.equal(C.purchasePayment(legacy.purchases[0]).paid,600);
});
