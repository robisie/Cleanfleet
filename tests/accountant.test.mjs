import test from 'node:test';import assert from 'node:assert/strict';
import * as C from '../pack/accountant-core.js';import {syncYear,readData} from '../pack/accountant-data.js';
const bill=(id,price,extra={})=>({id,number:id,status:'accepted',ksef_number:'K-'+id,payload:{issueDate:'2026-10-31',saleDate:'2026-10-31',currency:'PLN',buyer:{name:'TVM'},lines:[{price:String(price),qty:'1',vatRate:'zw'}],...extra}});
const purchase=(key,gross,net=gross)=>({metadata:{ksefNumber:key,invoiceNumber:key,issueDate:'2026-10-10',currency:'PLN',grossAmount:gross,netAmount:net,seller:{name:'Sklep'}}});
function configured(){const s=C.defaults();s.years['2026']={regime:'classic',rate:9,vat:'exempt',complete:false,loss:0,adjustment:0};return s;}
function confirm(data,s){const c=s.years['2026'];c.complete=true;c.confirmedThrough='2026-12-31';c.basis=C.signature(C.documents(data,s),'2026-01-01',c.confirmedThrough);}
const period={year:'2026',mode:'month',part:10};
test('Bill and KSeF sale duplicates and cost allocations are counted once; corrections keep their sign',()=>{
 const s=configured(),before=bill('A',1000).payload,correction=bill('KA',800,{correction:{before}}),data={bills:[bill('A',1000),correction],purchases:[purchase('P',246,200)],unlinked:[{id:'copy',source_ksef_number:'P',amount:246}],costs:[{ksef_number:'P',preview:{gross:246}}]};
 s.archives['2026']={sales:[{ksefNumber:'K-A',invoiceNumber:'A',issueDate:'2026-10-31',currency:'PLN',grossAmount:1000,netAmount:1000}],purchases:[purchase('P',246,200).metadata]};
 const rows=C.documents(data,s),sum=C.summary(rows,s,period);assert.equal(rows.length,3);assert.equal(sum.revenue,80000);assert.equal(sum.costs,24600);assert.equal(sum.profit,55400);assert.equal(sum.tax,null);
 s.overrides['purchases:P']={status:'include',percent:75,pln:24600,date:'2026-10-10'};confirm(data,s);const tax=C.summary(C.documents(data,s),s,period);assert.equal(tax.taxCosts,18450);assert.equal(tax.tax,5500);assert.equal(tax.base,61600);
});
test('VAT treatment uses gross for exemption and net for active VAT; missing FX never becomes zero',()=>{
 const s=configured(),data={purchases:[purchase('P',123,100)],bills:[bill('EUR',100,{currency:'EUR'})]};let rows=C.documents(data,s);assert.equal(rows.find(r=>r.kind==='purchases').base,12300);assert.equal(rows.find(r=>r.currency==='EUR').base,null);assert(C.summary(rows,s,period).incomplete);
 s.years['2026'].vat='active';rows=C.documents(data,s);assert.equal(rows.find(r=>r.kind==='purchases').base,10000);
 s.overrides['sales:K-EUR']={status:'include',percent:100,pln:43000,date:'2026-10-31'};assert.equal(C.documents(data,s).find(r=>r.kind==='sales').base,43000);
});
test('advance is excluded; final Bill includes full service value, not outstanding balance',()=>{
 const s=configured(),data={bills:[bill('Z',1000,{documentType:'advance',advanceAmount:'300'}),bill('R',1000,{documentType:'final',advances:[{amount:'300'}]})]};const rows=C.documents(data,s);assert.equal(rows.find(r=>r.number==='Z').status,'exclude');assert.equal(rows.find(r=>r.number==='R').base,100000);assert.equal(C.summary(rows,s,period).revenue,100000);
});
test('CIT uses year-to-date income, exact cents, rounding and payments assigned to correct tax year',()=>{
 const s=configured(),data={bills:[bill('A',1000,{saleDate:'2026-01-01'}),bill('B',1000)]};s.payments=[{id:'paid',date:'2026-09-20',name:'CIT',amount:9000,taxYear:'2026'},{id:'old',date:'2026-01-20',name:'Poprzedni rok',amount:5000,taxYear:'2025'}];confirm(data,s);let sum=C.summary(C.documents(data,s),s,period);assert.equal(sum.revenue,100000);assert.equal(sum.taxRevenue,200000);assert.equal(sum.tax,18000);assert.equal(sum.balance,9000);
 data.bills.push(bill('new',10));sum=C.summary(C.documents(data,s),s,period);assert.equal(sum.tax,null,'new documents invalidate completeness');
 s.years['2026'].regime='estonian';confirm(data,s);assert.equal(C.summary(C.documents(data,s),s,period).tax,null);
});
test('unknown rate, unreviewed costs and partial coverage prevent tax; no tax on loss',()=>{
 const s=configured(),data={bills:[bill('A',100)],purchases:[purchase('P',200)]};confirm(data,s);assert.equal(C.summary(C.documents(data,s),s,period).tax,null);s.overrides['purchases:P']={status:'include',percent:100,pln:20000,date:'2026-10-10'};confirm(data,s);assert.equal(C.summary(C.documents(data,s),s,period).tax,0);s.years['2026'].rate=null;assert.equal(C.summary(C.documents(data,s),s,period).tax,null);
 assert.equal(C.range('2024','month',2).to,'2024-02-29');assert.equal(C.range('2026','quarter',4).to,'2026-12-31');assert.throws(()=>C.range('2026','month',13));assert.throws(()=>C.amount('abc'));assert.equal(C.amount('-10,55'),-1055);
});
test('synchronization reads paginated quarters; partial response or cancel cannot publish partial archive',async()=>{
 const calls=[];const db={functions:{invoke:async(n,{body})=>{calls.push(body);return {data:{invoices:[{ksefNumber:body.kind+body.from+(body.page||0),grossAmount:10}],hasMore:body.page===0,ticket:'ticket'}};}}};
 const result=await syncYear(db,'2026',{asOf:'2026-03-31'});assert.equal(result.complete,true);assert.equal(calls.length,4);assert.equal(result.sales.length,2);assert.equal(calls[1].ticket,'ticket');
 await assert.rejects(syncYear({functions:{invoke:async()=>({data:{invoices:[],partial:true}})}},'2026'),/niepełne/);
 const controller=new AbortController();controller.abort();await assert.rejects(syncYear(db,'2026',{signal:controller.signal}),/anulowana/);
});
test('reader uses authorized Bill endpoint and pages cost tables beyond 500 rows',async()=>{
 const db={functions:{invoke:async()=>({data:[bill('A',100)]})},from(name){let from=0,to=499;const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,range:(a,b)=>{from=a;to=b;return q;},maybeSingle:async()=>({data:{revision:1,payload:{}}}),then(resolve){const source=name==='rs_ksef_documents'?Array.from({length:501},(_,i)=>({ksef_number:'P'+i})):[];return Promise.resolve({data:source.slice(from,to+1)}).then(resolve);}};return q;}};const data=await readData(db,'owner');assert.equal(data.bills.length,1);assert.equal(data.purchases.length,501);
});
