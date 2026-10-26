import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
async function setup(authResult){
 let handler,calls=0;
 const db={auth:{getUser:async()=>{calls++;return authResult||{error:true,data:{user:null}};}}};
 const context=vm.createContext({Request,Response,TextEncoder,console,Deno:{env:{get:()=>''},serve:h=>handler=h}});
 const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/cleanfleet-reminder-mail-now/index.ts',import.meta.url),'utf8'));
 const module=new vm.SourceTextModule(source,{context});
 await module.link(async spec=>new vm.SyntheticModule(spec.includes('supabase')?['createClient']:['ImapFlow'],function(){this.setExport(spec.includes('supabase')?'createClient':'ImapFlow',spec.includes('supabase')?()=>db:class{constructor(){throw Error('Must not access mailbox');}});},{context}));
 await module.evaluate();return {run:handler,calls:()=>calls};
}
test('browser preflight succeeds on both official origins without auth or mailbox access',async()=>{
 const s=await setup();
 for(const origin of ['https://cleanfleet.pl','https://www.cleanfleet.pl']){
  const r=await s.run(new Request('https://edge.test',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info'}}));
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.equal(r.headers.get('vary'),'Origin');assert.match(r.headers.get('access-control-allow-methods'),/POST/);
  for(const header of ['authorization','apikey','content-type','x-client-info'])assert.ok(r.headers.get('access-control-allow-headers').includes(header));
 }
 assert.equal(s.calls(),0);
});
test('errors retain CORS and authentication remains required',async()=>{
 const s=await setup();
 for(const [method,authorization,status] of [['GET','',405],['POST','',401],['POST','Bearer invalid',401]]){
  const r=await s.run(new Request('https://edge.test',{method,headers:{Origin:'https://cleanfleet.pl',...(authorization?{Authorization:authorization}:{})}}));
  assert.equal(r.status,status);assert.equal(r.headers.get('access-control-allow-origin'),'https://cleanfleet.pl');
  assert.ok((await r.json()).error);
 }
 assert.equal(s.calls(),1);
});
test('foreign origins cannot start a mailbox scan',async()=>{
 const s=await setup();for(const method of ['OPTIONS','POST'])assert.equal((await s.run(new Request('https://edge.test',{method,headers:{Origin:'https://other.test'}}))).status,403);
 assert.equal(s.calls(),0);
});
