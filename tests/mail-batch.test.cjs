const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('combined export downloads only checked existing results, leaves selection intact, and never searches or loads configuration',async()=>{
 const nodes=new Map(),actions=[];let checked=[1];const node=()=>({value:'',dataset:{},style:{},querySelectorAll(){return checked.map(i=>({dataset:{index:String(i)}}));}});
 for(const name of ['Cancel','Results','Status'])nodes.set('#cfMail'+name,node());const root={querySelector:id=>nodes.get(id),querySelectorAll:()=>[]};let fail=false,abort=null;
 const context={AbortController,DOMException,CF_SUPABASE_URL:'https://example.com',CF_SUPABASE_KEY:'public',window:{cfBackupBridge:{isAdmin:()=>true,getClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'jwt'}}})}})}},fetch:async(url,options)=>{const body=JSON.parse(options.body);actions.push(body);assert.equal(body.action,'attachment');assert.equal(body.password,undefined);if(abort)abort.abort();if(fail&&body.ticket==='2')return Response.json({error:'attachment failed'},{status:500});return new Response('original '+body.ticket);}};
 vm.createContext(context);const source=fs.readFileSync('app/mail-documents.js','utf8');vm.runInContext(source.replace('window.CFAccountingMail={','root=globalThis.testRoot;items=globalThis.testItems;window.CFAccountingMail={'),Object.assign(context,{testRoot:root,testItems:[1,2].map(n=>({ticket:String(n),filename:'bank.pdf',received:'2026-09-01',size:4}))}));
 const files=await context.window.CFAccountingMail.exportFiles(new AbortController().signal);assert.equal(files.length,1);assert.equal(await files[0].blob.text(),'original 2');assert.equal(actions[0].ticket,'2');assert.deepEqual(checked,[1]);
 checked=[0,1];fail=true;await assert.rejects(context.window.CFAccountingMail.exportFiles(new AbortController().signal),/attachment failed/);
 fail=false;abort=new AbortController();await assert.rejects(context.window.CFAccountingMail.exportFiles(abort.signal),{name:'AbortError'});
 abort=null;checked=[];const count=actions.length;assert.equal((await context.window.CFAccountingMail.exportFiles(new AbortController().signal)).length,0);assert.equal(actions.length,count);
 assert.match(source,/<details id="cfMailSettings"[^>]*><summary/);assert.match(source,/<\/details>\s*\n <div class="cf-ksef-form"><label>Wiadomości/);
});
