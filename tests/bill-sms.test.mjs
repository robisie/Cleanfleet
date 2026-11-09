import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=(await readFile(new URL('../supabase/functions/bill-sms/index.ts',import.meta.url),'utf8')).replace(/\?:string\b|\?:unknown\b|:string\b|:any\b|:unknown\b|:Response\b|!;/g,match=>match==='!;'?';':'').replace(/\)!/g,')');
async function setup(role='admin'){
 const rows=new Map(),calls=[];let handler;
 const db={auth:{getUser:async()=>({data:{user:{id:'user-1'}}})},from(table){return {
  select(){return {eq(){return {single:async()=>({data:{role}}),maybeSingle:async()=>({data:rows.get('user-1')||null})}}}},
  upsert(row){rows.set(row.user_id,row);return Promise.resolve({data:row})},
  delete(){return {eq(){rows.delete('user-1');return Promise.resolve({data:true})}}}
 }}};
 const fakeFetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('/account')?{scopes:['send','read'],test_credits:24,balance_grosze:0,sender_name:'PRZYPOMINAM'}:{id:'msg_123',status:'queued'}),{status:url.endsWith('/account')?200:201});};
 const context=vm.createContext({Deno:{env:{get:()=> 'secret'},serve:fn=>{handler=fn}},fetch:fakeFetch,Response,AbortSignal,JSON,Date,Error,Map});
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(spec.startsWith('npm:')?['createClient']:['createStateCodec'],function(){if(spec.startsWith('npm:'))this.setExport('createClient',()=>db);else this.setExport('createStateCodec',()=>({seal:async value=>JSON.stringify(value),open:async(value,userId,scope)=>{const state=JSON.parse(value);assert.equal(state.userId,userId);assert.equal(state.scope,scope);return state;}}));},{context}));
 await module.evaluate();
 const request=(body,origin='https://cleanfleet.pl')=>handler(new Request('https://example.com/functions/v1/bill-sms',{method:'POST',headers:{Authorization:'Bearer user-token',Origin:origin},body:JSON.stringify(body)})).then(async res=>({status:res.status,...await res.json()}));
 return {request,calls,rows};
}
test('Only an admin can save the key; validation reads the account without sending SMS',async()=>{
 const denied=await setup('worker');assert.equal((await denied.request({action:'sms-save',key:'pk_test_'+'a'.repeat(32)})).status,403);assert.equal(denied.calls.length,0);
 const app=await setup();const saved=await app.request({action:'sms-save',key:'pk_test_'+'a'.repeat(32)});
 assert.equal(saved.configured,true);assert.equal(saved.mode,'test');assert.equal(app.calls.length,1);assert.match(app.calls[0].url,/\/account$/);
 assert.doesNotMatch(JSON.stringify(saved),/pk_test_/);
});
test('Test send validates the phone, uses a stable idempotency key, and refuses live credentials',async()=>{
 const app=await setup();await app.request({action:'sms-save',key:'pk_test_'+'b'.repeat(32)});
 const requestId='7bd50315-9d3f-418e-bbe4-a4ef9d69f5bb';
 assert.equal((await app.request({action:'sms-test',number:'123',requestId})).status,400);
 assert.equal(app.calls.length,1);
 const sent=await app.request({action:'sms-test',number:'+48512345678',requestId});
 assert.equal(sent.status,'queued');assert.equal(app.calls.length,2);
 const {options}=app.calls[1];assert.equal(options.headers['Idempotency-Key'],requestId);
 assert.equal(JSON.parse(options.body).from,undefined);
 await app.request({action:'sms-save',key:'pk_live_'+'c'.repeat(32)});
 assert.equal((await app.request({action:'sms-test',number:'+48512345678',requestId})).status,400);
 assert.equal(app.calls.length,3);
});
