import test from 'node:test';
import assert from 'node:assert/strict';
import {orderPurchases} from '../app/robisie/core.js';
const purchase=(id,date,paidAmount=0)=>({id,date,amount:100,charge:100,paid:paidAmount>0,paidAmount});
test('unsettled and partial purchases precede settled purchases, with newest dates first in each group',()=>{
 const rows=[purchase('paid-old','2026-10-06',100),purchase('partial','2026-10-23',20),purchase('unpaid-new','2026-10-27'),purchase('paid-new','2026-11-02',100),purchase('unpaid-old','2026-10-01')];
 const original=structuredClone(rows);
 assert.deepEqual(orderPurchases(rows).map(x=>x.id),['unpaid-new','partial','unpaid-old','paid-new','paid-old']);
 assert.deepEqual(rows,original,'Display sorting must not reorder or modify stored data');
});
test('equal dates place later-added rows first; undated rows come last within their status group',()=>{
 const rows=[purchase('older-addition','2026-10-27'),purchase('undated',''),purchase('newer-addition','2026-10-27'),purchase('paid-undated',null,100),purchase('paid-dated','2026-10-01',100)];
 assert.deepEqual(orderPurchases(rows).map(x=>x.id),['newer-addition','older-addition','undated','paid-dated','paid-undated']);
});
test('settlements from invoices and advances use the same status as the displayed label',()=>{
 const rows=[{...purchase('invoice-full','2026-10-30'),invoicePayments:{a:100}},{...purchase('advance-partial','2026-10-25'),receiptPayments:{b:40}},purchase('unpaid','2026-10-27')];
 assert.deepEqual(orderPurchases(rows).map(x=>x.id),['unpaid','advance-partial','invoice-full']);
 assert.deepEqual(orderPurchases([]),[]);
});
