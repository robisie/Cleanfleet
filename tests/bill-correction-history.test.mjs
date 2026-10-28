import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const apiSource=await readFile(new URL('../bill/api.js',import.meta.url),'utf8');
const serverSource=await readFile(new URL('../supabase/functions/cleanfleet-bill/index.ts',import.meta.url),'utf8');
const parentId='10000000-0000-4000-8000-000000000001';
const correctionId='10000000-0000-4000-8000-000000000002';

async function clientWith(respond){
 const requests=[];
 const context=vm.createContext({AbortController,Date,JSON,Map,Set,Promise,localStorage:{getItem:()=>null},setTimeout,clearTimeout,
  fetch:async(url,options)=>{
   requests.push({url,options,body:JSON.parse(options.body)});
   return {ok:true,text:async()=>JSON.stringify(await respond(requests.at(-1).body))};
  }});
 const module=new vm.SourceTextModule(apiSource,{context});await module.link(()=>{throw Error('Unexpected dependency');});await module.evaluate();
 return {requests,invoiceFamilies:module.namespace.invoiceFamilies};
}

test('correction history uses authenticated Bill endpoint and resolves older originals',async()=>{
 const child={id:correctionId,payload:{correction:{originalId:parentId}}};
 const parent={id:parentId,payload:{}};
 const {requests,invoiceFamilies}=await clientWith(body=>body.action==='correction-history'?[child]:parent);
 const result=await invoiceFamilies([]);
 assert.deepEqual(Array.from(result,r=>r.id),[correctionId,parentId]);
 assert.deepEqual(Array.from(requests,r=>r.body.action),['correction-history','document']);
 assert(requests.every(r=>r.url.endsWith('/functions/v1/cleanfleet-bill')&&r.options.method==='POST'));
});

test('history pagination preserves invoices beyond the initial page',async()=>{
 const corrections=Array.from({length:1000},(_,i)=>({id:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`,payload:{correction:{originalId:parentId}}}));
 const {requests,invoiceFamilies}=await clientWith(body=>body.action==='correction-history'?(body.page===0?corrections:[]):{id:parentId,payload:{}});
 const result=await invoiceFamilies([]);
 assert.equal(result.length,1001);
 assert.deepEqual(Array.from(requests,r=>[r.body.action,r.body.page]),[['correction-history',0],['correction-history',1],['document',undefined]]);
});

test('server validates page after administrator authorization and filters correction rows',()=>{
 const auth=serverSource.indexOf("role.data?.role!=='admin'");
 const history=serverSource.indexOf("body.action==='correction-history'");
 const search=serverSource.indexOf("body.action==='search'");
 assert(auth>0&&history>auth&&search>history);
 const route=serverSource.slice(history,search);
 assert.match(route,/Number\.isSafeInteger\(page\)/);
 assert.match(route,/\.not\('payload->correction','is',null\)/);
 assert.match(route,/\.range\(page\*1000,page\*1000\+999\)/);
});
