import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../app/robisie/api.js',import.meta.url),'utf8');
async function api(fetch,session={access_token:'test',expires_at:9999999999},timeout=false){const storage=new Map([['robisie-auth-session-v1',JSON.stringify(session)]]);const context=vm.createContext({fetch,AbortController,structuredClone,clearTimeout,setTimeout:timeout?(fn)=>setTimeout(fn,20):setTimeout,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});const mod=new vm.SourceTextModule(source,{context});await mod.link(()=>{});await mod.evaluate();mod.namespace.restoreSession();return mod.namespace;}
const response=value=>({ok:true,text:async()=>JSON.stringify(value)});
test('completion submits the saved revision and full calculated amount in one RPC',async()=>{
 let url,args;const a=await api(async(u,o)=>{url=u;args=JSON.parse(o.body);return response({id:'p',revision:8,payload:{status:'zakonczona'}});});
 const row=await a.finishProject({id:'p',revision:7},1234.56);
 assert.ok(url.endsWith('/rs_finish_project_with_earnings'));
 assert.deepEqual(args,{p_id:'p',p_revision:7,p_amount:1234.56});assert.equal(row.payload.status,'zakonczona');
});
test('small edit sends only changed fields and reconstructs the confirmed full project from metadata',async()=>{
 let args,url;const a=await api(async(u,o)=>{url=u;args=JSON.parse(o.body);return response({id:'p',revision:2,updated_at:'now'});});
 const before={name:'A',catalog:'x'.repeat(100000),works:[{id:'l',qty:2}]},after={...before,name:'B',_undo:{savedAt:'stamp',payload:before}};
 const row=await a.saveProject({id:'p',contract_number:'UUR',revision:1,payload:before},after);assert.ok(url.endsWith('/rs_save_project_fast'));assert.deepEqual(JSON.parse(JSON.stringify(args.p_fields)),{name:'B'});assert.ok(JSON.stringify(args).length<250);assert.equal(row.revision,2);assert.equal(row.contract_number,'UUR');assert.deepEqual(row.payload,after);
});
test('field removals and settings updates do not resend unchanged catalog or full undo',async()=>{
 let args;const a=await api(async(u,o)=>{args=JSON.parse(o.body);return response({revision:3});});const before={company:{name:'A'},catalog:'big',obsolete:1},after={company:{name:'B'},catalog:'big'};
 await a.saveSettings(after,2,before);assert.deepEqual(args.p_fields,{company:{name:'B'}});assert.deepEqual(args.p_remove_keys,['obsolete']);assert.equal(args.p_undo_saved_at,null);
});
test('lost write response is confirmed with one read instead of duplicate write',async()=>{
 const calls=[],payload={name:'B'},before={id:'p',revision:1,payload:{name:'A'}};const a=await api(async(u,o)=>{calls.push(o.method||'GET');if(o.method==='POST')throw new TypeError('Disconnected');return response([{id:'p',revision:2,payload}]);});const row=await a.saveProject(before,payload);assert.equal(row.revision,2);assert.deepEqual(calls,['POST','GET']);
});
test('timeout frees the request; unmatched server state is never accepted as saved',async()=>{
 const a=await api(async(u,o)=>o.method==='POST'?new Promise(()=>{}):response([{id:'p',revision:2,payload:{name:'OTHER'}}]),undefined,true);await assert.rejects(a.saveProject({id:'p',revision:1,payload:{name:'A'}},{name:'B'}));
});
test('concurrent requests share one token refresh',async()=>{
 let refresh=0;const a=await api(async(u)=>{if(u.includes('/auth/')){refresh++;await new Promise(resolve=>setTimeout(resolve,10));return response({access_token:'new',expires_in:3600});}return response([]);},{access_token:'old',refresh_token:'refresh',expires_at:1});await Promise.all([a.projects(),a.settings()]);assert.equal(refresh,1);
});
