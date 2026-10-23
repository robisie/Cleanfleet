import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentStatus} from '../bill/payment-status.js';
import {hint,remember} from '../bill/cost-suggestions.js';

test('invoice delivery never implies receipt; linked receipts and allocations count once',()=>{
 const invoice={id:'invoice',status:'accepted',payload:{currency:'PLN'}};
 assert.equal(paymentStatus(invoice,null).state,'unknown');
 const project={invoiceSettlements:[{id:'invoice',allocations:[{paid:120.32,amount:300}],existingReceipts:[{id:'advance',amount:79.68}]}]};
 assert.deepEqual(paymentStatus(invoice,{kind:'robisie',total:300,project}),{state:'partial',received:200,remaining:100});
 assert.deepEqual(paymentStatus(invoice,{kind:'robisie',total:200,project}),{state:'paid',received:200,remaining:0});
 assert.deepEqual(paymentStatus(invoice,{kind:'cleanfleet',total:300,paid:false}),{state:'unpaid',received:0,remaining:300});
 assert.equal(paymentStatus({...invoice,status:'draft'},{kind:'robisie',total:300,project}).state,'unknown');
});

test('KSeF suggestions stay scoped to account and seller and never include line allocations',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 remember(storage,'owner','1234567890',{project:'investment'});
 remember(storage,'owner','1234567890',{cleanfleet:{category:'Chemia',company_id:'company'}});
 assert.deepEqual(hint(storage,'owner','1234567890'),{project:'investment',cleanfleet:{category:'Chemia',company_id:'company'}});
 assert.equal(hint(storage,'other','1234567890'),null);
 assert.equal(hint(storage,'owner','another'),null);
});
