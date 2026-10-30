import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fleetPaymentEvidence} from '../supabase/functions/cleanfleet-bill/fleet.js';
import {paymentStatus} from '../bill/payment-status.js';
const billId='10000000-0000-4000-8000-000000000001',cfId='20000000-0000-4000-8000-000000000001';
function database({linked=true,status='pending',error=null}={}){
 const reads=[],data={status};
 return {reads,data,from(table){return {select(columns){this.columns=columns;return this;},async in(column,ids){reads.push({table,column,ids});if(error)return {error:{message:error}};
  if(table==='bill_fleet_attachments')return {data:linked?[{invoice_id:billId,cf_invoice_id:cfId}]:[]};
  assert.equal(table,'invoices');assert.equal(column,'id');assert.deepEqual(ids,[cfId]);return {data:[{id:cfId,status:data.status}]};
 }}}};
}
test('payment lookup follows Bill attachment to the distinct CleanFleet invoice ID',async()=>{
 const db=database();assert.deepEqual(await fleetPaymentEvidence(db,[billId]),[{invoice_id:billId,paid:false}]);
 db.data.status='paid';assert.deepEqual(await fleetPaymentEvidence(db,[billId]),[{invoice_id:billId,paid:true}]);
 assert.equal(db.reads[0].table,'bill_fleet_attachments');assert.equal(db.reads[1].table,'invoices');
 assert.notEqual(billId,cfId);
});
test('missing links stay unknown and invalid batches cannot read tables',async()=>{
 const db=database({linked:false});assert.deepEqual(await fleetPaymentEvidence(db,[billId]),[]);assert.equal(db.reads.length,1);
 for(const ids of [undefined,['bad'],Array(51).fill(billId)])await assert.rejects(fleetPaymentEvidence(database(),ids),/Nieprawidłowy/);
 await assert.rejects(fleetPaymentEvidence(database({error:'Database unavailable'}),[billId]),/Database unavailable/);
});
test('Bill client refresh observes CleanFleet paid status through authorized endpoint',async()=>{
 const db=database(),calls=[];
 const context=vm.createContext({AbortController,Date,JSON,Map,Set,Promise,setTimeout,clearTimeout,fetch:async(url,options)=>{
  assert(url.endsWith('/functions/v1/cleanfleet-bill'));const body=JSON.parse(options.body);calls.push(body);assert.equal(body.action,'fleet-payments');
  return {ok:true,text:async()=>JSON.stringify(await fleetPaymentEvidence(db,body.ids))};
 }});
 const source=await readFile(new URL('../bill/api.js',import.meta.url),'utf8'),module=new vm.SourceTextModule(source,{context});await module.link(()=>{});await module.evaluate();
 const row={id:billId,status:'accepted',payload:{source:{app:'cleanfleet',fleetId:billId}}};
 assert.equal((await module.namespace.paymentEvidence([row])).fleet.get(billId),false);
 db.data.status='paid';const evidence=await module.namespace.paymentEvidence([row]);assert.equal(evidence.fleet.get(billId),true);assert.equal(evidence.fleet.has(cfId),false);
 assert.equal(paymentStatus(row,{kind:'cleanfleet',total:300,paid:evidence.fleet.get(billId)},{bank_cents:10000}).state,'paid');
 assert.equal(calls.length,2);
});
