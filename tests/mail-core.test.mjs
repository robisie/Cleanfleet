import test from 'node:test';
import assert from 'node:assert/strict';
import {createMailHandler,cleanConfig,attachments,period,MAX_PART} from '../supabase/functions/cleanfleet-mail/core.js';
const part={part:'2',size:4,disposition:'attachment',dispositionParameters:{filename:'../faktura.pdf'}};
const message={uid:15,internalDate:new Date('2026-08-15T10:00:00Z'),envelope:{subject:'Wyciąg',from:[{address:'bank@example.pl'}]},bodyStructure:{childNodes:[part,{part:'1',size:100,disposition:'inline',parameters:{name:'logo.png'}}]}};
test('mail filters validate exact sender addresses, valid dates and safe attachment names',()=>{
  assert.deepEqual(cleanConfig({email:'test@o2.pl',senders:'bank@example.pl; BANK@example.pl',folder:'INBOX'}).senders,['bank@example.pl']);
  assert.throws(()=>cleanConfig({email:'test@gmail.com',senders:'bank@example.pl'}));
  assert.throws(()=>period('2026-02-30','2026-03-01'));
  assert.throws(()=>period('2026-01-01','2026-08-01'));
  assert.equal(attachments(message.bodyStructure).length,1);assert.equal(attachments(message.bodyStructure)[0].filename,'faktura.pdf');
});
test('persistent encrypted connection, read-only mailbox, authorized part download and failure gates',async()=>{
  const rows=new Map();const credentialStore={get:async uid=>rows.get(uid),set:async(uid,value)=>rows.set(uid,value)};
  let closes=0,clientCalls=0,huge=false,wrongSender=false,uidValidity=10n;
  const handler=createMailHandler({secret:'test-secret',credentialStore,authorize:async request=>request.headers.get('test-owner')||'admin',makeClient:config=>{
    clientCalls++;assert.equal(config.password,'app-password');
    return {mailbox:{uidValidity},connect:async()=>{},mailboxOpen:async(folder,options)=>{assert.equal(folder,'INBOX');assert.deepEqual(options,{readOnly:true});},close:()=>{closes++;},
      search:async(query,options)=>{assert.equal(query.or[0].from,'bank@example.pl');assert.equal(options.uid,true);return [15];},
      fetchAll:async()=>[{...message,envelope:{...message.envelope,from:[{address:wrongSender?'other@example.pl':'bank@example.pl'}]},bodyStructure:huge?{...part,size:MAX_PART+1}:message.bodyStructure}],
      fetchOne:async()=>message,download:async(uid,path,options)=>{assert.equal(uid,15);assert.equal(path,'2');assert.equal(options.uid,true);return {content:(async function*(){yield new Uint8Array([1,2,3,4]);})()};}
    };
  }});
  const call=(body,owner='admin')=>handler(new Request('https://edge.example',{method:'POST',headers:{'test-owner':owner,Origin:'https://cleanfleet.pl'},body:JSON.stringify(body)}));
  const saved=await(await call({action:'save',email:'test@o2.pl',password:'app-password',senders:'bank@example.pl',folder:'INBOX'})).json();
  assert.equal(saved.configured,true);assert.ok(saved.session);assert.ok(!JSON.stringify(saved).includes('app-password'));
  const config=await(await call({action:'config',session:saved.session})).json();assert.equal(config.email,'test@o2.pl');assert.equal(config.password,undefined);
  assert.equal((await call({action:'config',session:saved.session},'another-user')).status,401);
  assert.ok(!JSON.stringify([...rows]).includes('app-password'));
  assert.equal((await(await call({action:'config'})).json()).configured,true);
  assert.equal((await(await call({action:'config'},'another-user')).json()).configured,false);
  const body={action:'list',session:saved.session,from:'2026-08-01',to:'2026-08-31'};
  const listed=await(await call(body)).json();assert.equal(listed.attachments.length,1);assert.equal(listed.messageCount,1);
  const downloaded=await call({action:'attachment',session:saved.session,ticket:listed.attachments[0].ticket});assert.equal(downloaded.status,200);assert.equal((await downloaded.arrayBuffer()).byteLength,4);
  uidValidity=11n;assert.equal((await call({action:'attachment',session:saved.session,ticket:listed.attachments[0].ticket})).status,409);
  uidValidity=10n;huge=true;assert.equal((await call(body)).status,422);
  huge=false;wrongSender=true;assert.equal((await(await call(body)).json()).attachments.length,0);
  assert.equal(closes,clientCalls);
  assert.equal((await call({action:'attachment',session:saved.session,ticket:'tampered'})).status,401);
  const resaved=await call({action:'save',email:'test@o2.pl',useSavedPassword:true,senders:'bank@example.pl',folder:'INBOX'});assert.equal(resaved.status,200);
  assert.equal((await call({action:'attachment',ticket:listed.attachments[0].ticket})).status,409);
  assert.equal((await call({action:'save',email:'other@o2.pl',useSavedPassword:true,senders:'bank@example.pl'})).status,400);
  assert.equal((await(await call({action:'config'})).json()).email,'test@o2.pl');
});
test('mail errors distinguish server login rejection, folder and DNS without leaking credentials',async t=>{
 const logs=[];t.mock.method(console,'warn',value=>logs.push(value));
 for(const [phase,error,expected] of [
  ['connect',Object.assign(new Error('secret-password'),{authenticationFailed:true,serverResponseCode:'AUTHENTICATIONFAILED'}),/Serwer o2 odrzucił logowanie/],
  ['folder',new Error('private folder details'),/Zalogowano do o2.*folderu/],
  ['connect',Object.assign(new Error('secret-password'),{code:'ENOTFOUND'}),/DNS: ENOTFOUND/]
 ]){
  const handler=createMailHandler({secret:'test-secret',authorize:async()=> 'owner',credentialStore:{get:async()=>null,set:async()=>assert.fail('failed login must not save')},makeClient:()=>({connect:async()=>{if(phase==='connect')throw error;},mailboxOpen:async()=>{throw error;},close(){}})});
  const response=await handler(new Request('https://edge.example',{method:'POST',body:JSON.stringify({action:'save',email:'me@o2.pl',password:'secret-password',senders:'bank@example.com'})}));
  assert.equal(response.status,502);const text=await response.text();assert.match(text,expected);assert.ok(!text.includes('secret-password'));assert.ok(!text.includes('private folder details'));
 }
 assert.equal(logs.length,3);assert.ok(!JSON.stringify(logs).includes('secret-password'));assert.ok(!JSON.stringify(logs).includes('me@o2.pl'));
});
