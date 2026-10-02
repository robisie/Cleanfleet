import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {requestBody,normalize} from '../supabase/functions/cleanfleet-wash-sheet/core.mjs';
import {signJob,readJob} from '../supabase/functions/cleanfleet-wash-sheet/jobs.mjs';
test('token odczytu jest podpisany, przypisany użytkownikowi i wygasa',async()=>{
 const token=await signJob('resp_abc','admin1','secret',1000);
 assert.equal((await readJob(token,'admin1','secret',2000)).id,'resp_abc');
 assert.equal(await readJob(token,'admin2','secret',2000),null);
 assert.equal(await readJob(token,'admin1','different',2000),null);
 assert.equal(await readJob(token,'admin1','secret',600000),null);
 assert.equal(await readJob(token+'x','admin1','secret',2000),null);
});
test('start i wielokrotne sprawdzenie statusu uruchamiają analizę tylko raz',async()=>{
 let handler,posts=0,gets=0;
 const source=fs.readFileSync('supabase/functions/cleanfleet-wash-sheet/index.ts','utf8').replace(/^import .*;\n/gm,'').replaceAll(':unknown','').replaceAll(':Request','').replaceAll(':any','').replaceAll("')!","')");
 vm.runInNewContext(source,{Request,Response,AbortSignal,console,requestBody,normalize,signJob,readJob,Deno:{env:{get:()=> 'test-secret'},serve:h=>handler=h},createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'admin'}})})})})}),fetch:async(url,options)=>{
  if(options.method==='POST'){posts++;assert.equal(JSON.parse(options.body).background,true);return Response.json({id:'resp_test',status:'queued'});}
  gets++;assert.match(url,/responses\/resp_test$/);
  if(gets===1)return Response.json({id:'resp_test',status:'in_progress'});
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({common_date_text:'02.10.2026',rows:[{plate:'SB252FU',date_scope:'common',confidence:'high'}]})}]}]});
 }});
 const call=body=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)}));
 const first=await (await call({action:'start',image:'data:image/jpeg;base64,AAAA'})).json();assert.equal(first.pending,true);
 const second=await (await call({action:'status',job:first.job})).json();assert.equal(second.pending,true);
 const result=await (await call({action:'status',job:first.job})).json();assert.equal(result.rows[0].wash_date,'2026-10-02');assert.equal(posts,1);assert.equal(gets,2);
 assert.equal((await call({action:'status',job:first.job+'x'})).status,403);assert.equal(gets,2);
});
