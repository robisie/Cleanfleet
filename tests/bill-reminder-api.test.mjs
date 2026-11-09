import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
import {partyCountry} from '../supabase/functions/cleanfleet-bill/invoice.js';
import {reminderText,upgradeReminderTemplate} from '../supabase/functions/cleanfleet-bill/reminder.js';

test('reminder uses the contact from the directory and sends the confirmed preview',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const buyer={nip:'6351861297',country:'PL',email:'faktura@example.pl'};
 const invoice={id,creator_id:'owner',number:'A1/11/2026',payload:{buyer,currency:'PLN',dueDate:'2026-11-01'}};
 const contact={...buyer,email:'kartoteka@example.pl'};
 let contacts=[{payload:contact}],handler;
 const deliveries=[];
 const rows={user_roles:[{role:'admin'}],bill_invoices:[invoice],bill_smtp_credentials:[{ciphertext:'fixture'}]};
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){
  let result=table==='bill_parties'?contacts:rows[table]||[];
  return {
   select(){return this;},eq(){return this;},
   in(field,values){assert.equal(field,'payload->>nip');result=result.filter(row=>values.includes(row.payload.nip));return this;},
   order(){return this;},limit(){return this;},
   single:async()=>({data:result[0]}),maybeSingle:async()=>({data:result[0]||null}),
   then(resolve){resolve({data:result});},insert:async()=>({}),update(){return this;}
  };
 }};
 const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/cleanfleet-bill/index.ts',import.meta.url),'utf8'));
 const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].map(m=>[m[2],m[1].split(',').map(s=>s.trim())]));
 const implementations={createClient:()=>db,createArchiveService:()=>async()=>{},ksefApi:()=>async()=>{},createStateCodec:()=>({open:async()=>({})}),fleetPaymentEvidence:async()=>[],partyCountry};
 const context=vm.createContext({console,Request,Response,JSON,crypto,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [name,value] of Object.entries(values))this.setExport(name,value);},{context});
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:async spec=>{
  const values=spec==='./reminder.js'?{reminderAmount:()=>7000,reminderText,upgradeReminderTemplate}:{smtpTransport:async()=>({sendMail:async mail=>{deliveries.push(mail);return {};},close(){}})};
  const imported=synthetic(values);await imported.link(()=>{});await imported.evaluate();return imported;
 }});
 await module.link(spec=>synthetic(Object.fromEntries((imports.get(spec)||[]).map(name=>[name,implementations[name]||(()=>{})]))));
 await module.evaluate();
 async function request(action,fields={}){
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action,id,...fields})}));
  return {status:response.status,...await response.json()};
 }
 const preview=await request('reminder-preview');
 assert.equal(preview.recipient,'kartoteka@example.pl');
 assert.equal(preview.recipientSource,'party');
 assert.match(preview.subject,/A1\/11\/2026/);
 assert.match(preview.text,/70,00/);
 assert.equal(deliveries.length,0);
 const confirmation={recipient:preview.recipient,amount:preview.amount,subject:preview.subject,text:preview.text,requestId:crypto.randomUUID(),acknowledged:true};
 contact.email='nowy@example.pl';
 assert.match((await request('reminder-send',confirmation)).error,/Adres lub saldo faktury zmieniły się/);
 assert.equal(deliveries.length,0);
 contact.email=preview.recipient;
 assert.equal((await request('reminder-send',confirmation)).state,'sent');
 assert.equal(deliveries.length,1);
 assert.equal(deliveries[0].to,preview.recipient);
 assert.equal(deliveries[0].text,preview.text);
 contact.email='';
 assert.match((await request('reminder-preview')).recipientIssue,/Uzupełnij adres/);
 contacts=[];
 assert.equal((await request('reminder-preview')).recipientSource,'invoice');
});
