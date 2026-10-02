import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {requestBody,normalize} from '../supabase/functions/cleanfleet-wash-sheet/core.mjs';
test('serwer wymaga administratora i zwraca datę wspólną po odczycie',async()=>{
 let handler,role='employee',calls=0;
 const source=fs.readFileSync('supabase/functions/cleanfleet-wash-sheet/index.ts','utf8').replace(/^import .*;\n/gm,'').replaceAll(':unknown','').replaceAll(':Request','').replaceAll(':any','').replaceAll("')!","')");
 const context={Request,Response,AbortSignal,console,requestBody,normalize,Deno:{env:{get:()=> 'test'},serve:h=>handler=h},createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'test'}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role}})})})})}),fetch:async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.model,'gpt-5.4');assert.equal(body.input[1].content[0].detail,'original');return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({common_date_text:'02.10.2026',sheet_year:'',rows:[{plate:'SB252FU',date_text:'',date_scope:'common',confidence:'high'}]})}]}]});}};
 vm.runInNewContext(source,context);
 const req=()=>new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,AAAA'})});
 assert.equal((await handler(new Request('https://example.com',{method:'POST'}))).status,401);
 assert.equal((await handler(req())).status,403);assert.equal(calls,0);
 role='admin';const result=await handler(req());assert.equal(result.status,200);const data=await result.json();assert.equal(data.rows[0].wash_date,'2026-10-02');assert.equal(calls,1);
});
