import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';
test('KSeF reminder endpoint authenticates independently and supports browser preflight',async()=>{
 let handler,authCalls=0;
 const db={auth:{getUser:async()=>{authCalls++;return {error:true,data:{user:null}};}}};
 const context=vm.createContext({Request,Response,TextEncoder,console,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/cleanfleet-reminder-ksef/index.ts',import.meta.url),'utf8'));
 const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].map(m=>[m[2],m[1].split(',').map(s=>s.trim())]));
 const implementations={createClient:()=>db,createStateCodec:()=>({})};
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>{const names=imports.get(spec)||[];return new vm.SyntheticModule(names,function(){for(const name of names)this.setExport(name,implementations[name]||(()=>{throw Error('Must not read invoices or mailbox before authorization');}));},{context});});await module.evaluate();
 const request=(method,origin='https://cleanfleet.pl',authorization='')=>handler(new Request('https://edge.test',{method,headers:{Origin:origin,...(authorization?{Authorization:authorization}:{})}}));
 assert.equal((await request('OPTIONS')).status,204);assert.equal(authCalls,0);
 assert.equal((await request('POST')).status,401);assert.equal(authCalls,0);
 assert.equal((await request('POST','https://cleanfleet.pl','Bearer invalid')).status,401);assert.equal(authCalls,1);
 assert.equal((await request('POST','https://foreign.test')).status,403);assert.equal(authCalls,1);
});
