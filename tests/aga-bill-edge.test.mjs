import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
async function setup({role='admin',valid=true}={}){
 let handler;const calls=[];const db={auth:{getUser:async()=>({data:{user:valid?{id:'verified-owner'}:null}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role}})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{invoiceId:args.p_id,status:'draft'}}}};
 const context=vm.createContext({Request,Response,console,Deno:{env:{get:()=>''},serve:h=>handler=h}}),source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/aga-bill-draft/index.ts',import.meta.url),'utf8'));
 const mod=new vm.SourceTextModule(source,{context});await mod.link(()=>new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>db)},{context}));await mod.evaluate();
 return {calls,request:(body={},headers={Authorization:'Bearer test'})=>handler(new Request('https://example.test',{method:'POST',headers,body:JSON.stringify(body)}))};
}
test('Aga draft endpoint requires verified admin before touching invoice data',async()=>{
 for(const config of [{valid:false},{role:'employee'}]){const t=await setup(config),r=await t.request();assert([401,403].includes(r.status));assert.equal(t.calls.length,0)}
 const t=await setup();assert.equal((await t.request({},{})).status,401);assert.equal(t.calls.length,0);
});
test('Aga endpoint forwards verified actor, never issues or sends an invoice',async()=>{
 const t=await setup(),id='10000000-0000-4000-8000-000000000001',r=await t.request({id,date:'2026-10-25',amount:1000,rate:9,revision:3,p_actor:'forged-owner'});
 assert.equal(r.status,200);assert.equal(t.calls.length,1);assert.equal(t.calls[0].name,'rs_aga_bill_draft');assert.equal(t.calls[0].args.p_actor,'verified-owner');assert.equal(t.calls[0].args.p_amount,1000);assert.equal((await r.json()).status,'draft');
 assert.equal((await t.request({id:'bad',date:'2026-10-25'})).status,400);assert.equal(t.calls.length,1);
});
