import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import {duplicatePurchases,selectedAmount} from '../bill/purchase-import.js';
import * as Demand from '../bill/payment-demand.js';
import * as Bill from '../bill/core.js';
test('document threshold: exactly 450, missing document, receipt and KSeF invoice',()=>{
 assert.equal(C.purchaseNeedsInvoice({amount:450}),false);assert.equal(C.purchaseNeedsInvoice({amount:450.01}),true);
 assert.equal(C.purchaseNeedsInvoice({amount:700,invoice:'123',documentType:'nip-receipt'}),true);
 assert.equal(C.purchaseNeedsInvoice({amount:700,documentType:'invoice'}),false);
 assert.equal(C.purchaseNeedsInvoice({amount:700,sourceKsefNumber:'ksef'}),false);
});
test('room labour respects exclusions, discount and authoritative historical settlement',()=>{
 const p={discount:0,workDiscount:10,works:[{id:'a',roomId:'r',qty:2,price:100},{id:'b',roomId:'r',qty:3,price:200,included:false},{id:'c',roomId:'s',qty:1,price:100}]};
 assert.equal(C.roomWorkAmount(p,'r'),180);assert.equal(C.roomWorkAmount(p,'s'),90);
 p.sourceCalculation={works:{amount:240,basis:C.calculationBasis(p.works,10)}};assert.equal(C.roomWorkAmount(p,'r'),160);assert.equal(C.roomWorkAmount(p,'s'),80);
});
test('duplicate detection uses selected gross amount and cents, including multiple candidates',()=>{
 const preview={gross:151.11,items:[{index:1,gross:100.10},{index:2,gross:51.01}]};
 assert.equal(selectedAmount(preview,[1]),100.1);assert.equal(selectedAmount(preview,null),151.11);
 const rows=[{id:'1',amount:100.1},{id:'2',amount:100.10},{id:'3',amount:151.11}];assert.deepEqual(duplicatePurchases(rows,selectedAmount(preview,[1])).map(x=>x.id),['1','2']);
});
const row=()=>({id:'i',number:'A/1',status:'issued',payload:{...Bill.newInvoice('robisie'),dueDate:'2026-10-19',lines:[{name:'Prace',qty:'1',price:'100',unit:'usł.'}]}});
test('payment demand is available for issued invoices before, on and after the due date',()=>{
 const r=row();for(const dueDate of ['2026-10-18','2026-10-20','2026-10-30']){r.payload.dueDate=dueDate;assert.equal(Demand.canDemand(r),true);}
 r.status='draft';assert.equal(Demand.canDemand(r),false);r.status='accepted';r.payload.lines[0].price='0';assert.equal(Demand.canDemand(r),false);
});
test('demand deducts linked advances and allocations, validates balance, escapes content',()=>{
 const r=row();r.payload.buyer.name='<script>';assert.equal(Demand.outstanding(r,{invoiceSettlements:[{id:'i',existingReceipts:[{amount:30}],allocations:[{paid:20}]}]}),5000);
 globalThis.location={origin:'https://cleanfleet.pl'};const html=Demand.demandHtml(r,{amount:5000,deadline:'2026-10-27',date:'2026-10-20'});assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('A/1'));assert.throws(()=>Demand.demandHtml(r,{amount:10001,deadline:'2026-10-27',date:'2026-10-20'}));assert.throws(()=>Demand.demandHtml(r,{amount:5000,deadline:'2026-10-20',date:'2026-10-20'}));
});

test('before the original due date, demand uses neutral wording and cannot shorten the payment term',()=>{
 const r=row();r.payload.dueDate='2026-10-30';globalThis.location={origin:'https://cleanfleet.pl'};
 const html=Demand.demandHtml(r,{amount:5000,deadline:'2026-10-30',date:'2026-10-20'});
 assert.ok(html.includes('z terminem płatności 2026-10-30'));assert.ok(!html.includes('zaległej należności'));assert.ok(!html.includes('termin płatności upłynął'));
 assert.throws(()=>Demand.demandHtml(r,{amount:5000,deadline:'2026-10-27',date:'2026-10-20'}),/wcześniejszy/);
 r.payload.dueDate='2026-10-20';assert.ok(Demand.demandHtml(r,{amount:5000,deadline:'2026-10-27',date:'2026-10-20'}).includes('z terminem płatności 2026-10-20'));
});
