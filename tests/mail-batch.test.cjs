const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('monthly mail export refreshes search, downloads all attachments, and rejects partial output',async()=>{
 const nodes=new Map(),actions=[];const node=()=>({value:'',dataset:{},style:{},addEventListener(){},querySelectorAll(){return[];},replaceChildren(){},append(){}});
 for(const name of ['Email','Password','Folder','From','To','Cancel','Results','Download','Status'])nodes.set('#cfMail'+name,node());
 nodes.get('#cfMailEmail').value='me@o2.pl';nodes.get('#cfMailFolder').value='INBOX/mBank - zestawienia';nodes.get('#cfMailPassword').dataset.saved='true';nodes.get('#cfMailFrom').value='2026-08-01';nodes.get('#cfMailTo').value='2026-09-07';
 const root={querySelector:id=>nodes.get(id),querySelectorAll:()=>[]};let fail=false,abort=null;
 const context={AbortController,DOMException,CF_SUPABASE_URL:'https://example.com',CF_SUPABASE_KEY:'public',document:{createElement:node,createTextNode:text=>text},window:{cfBackupBridge:{isAdmin:()=>true,getClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'jwt'}}})}})}},fetch:async(url,options)=>{
  const body=JSON.parse(options.body);actions.push(body.action);assert.equal(body.password,undefined);
  if(body.action==='config')return Response.json({configured:true,email:'me@o2.pl',folder:'INBOX/mBank - zestawienia'});
  if(body.action==='list'){assert.equal(body.from,'2026-08-01');assert.equal(body.to,'2026-09-07');return Response.json({attachments:[1,2].map(n=>({ticket:String(n),filename:'bank.pdf',received:'2026-09-01',size:4}))});}
  if(abort)abort.abort();if(fail&&body.ticket==='2')return Response.json({error:'attachment failed'},{status:500});return new Response('original');
 }};
 vm.createContext(context);vm.runInContext(fs.readFileSync('app/mail-documents.js','utf8').replace('window.CFAccountingMail={','root=globalThis.testRoot;window.CFAccountingMail={'),Object.assign(context,{testRoot:root}));
 const files=await context.window.CFAccountingMail.exportFiles(new AbortController().signal);assert.equal(files.length,2);assert.equal(await files[0].blob.text(),'original');assert.equal(files[1].name,'2026-09-01_002_bank.pdf');assert.deepEqual(actions,['config','list','attachment','attachment']);
 fail=true;await assert.rejects(context.window.CFAccountingMail.exportFiles(new AbortController().signal),/attachment failed/);
 fail=false;abort=new AbortController();await assert.rejects(context.window.CFAccountingMail.exportFiles(abort.signal),{name:'AbortError'});
 abort=null;nodes.get('#cfMailFolder').value='OTHER';await assert.rejects(context.window.CFAccountingMail.exportFiles(new AbortController().signal),/Kliknij Zapisz/);
});
