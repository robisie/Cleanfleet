import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
import {partyCountry} from '../supabase/functions/cleanfleet-bill/invoice.js';
import {reminderText,upgradeReminderTemplate} from '../supabase/functions/cleanfleet-bill/reminder.js';
import {sendReminderMail} from '../supabase/functions/cleanfleet-bill/smtp.js';
import {invoiceMailAttachment,MAX_REMINDER_PDF_BASE64,reminderPdfName} from '../bill/reminder-attachment.js';

test('reminder uses the contact from the directory and sends the confirmed preview',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const buyer={nip:'6351861297',country:'PL',email:'faktura@example.pl'};
 const invoice={id,creator_id:'owner',number:'A1/11/2026',updated_at:'2026-11-02T10:00:00+00:00',payload:{buyer,currency:'PLN',dueDate:'2026-11-01'}};
 const contact={...buyer,email:'kartoteka@example.pl'};
 let contacts=[{payload:contact}],handler,smtpError;
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
 const implementations={createClient:()=>db,createArchiveService:()=>async()=>{},ksefApi:()=>async()=>{},createStateCodec:()=>({open:async()=>({})}),fleetPaymentEvidence:async()=>[],partyCountry,invoiceMailAttachment,MAX_REMINDER_PDF_BASE64,reminderPdfName};
 const context=vm.createContext({console,Request,Response,JSON,crypto,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [name,value] of Object.entries(values))this.setExport(name,value);},{context});
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:async spec=>{
  const values=spec==='./reminder.js'?{reminderAmount:()=>7000,reminderText,upgradeReminderTemplate}:{sendReminderMail,smtpTransport:async()=>({sendMail:async mail=>{deliveries.push(mail);if(mail.attachments&&smtpError)throw smtpError;return {};},close(){}})};
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
 assert.equal(preview.attachmentName,'Faktura_A1-11-2026.pdf');
 assert.match(preview.text,/70,00/);
 assert.equal(deliveries.length,0);
 const confirmation={recipient:preview.recipient,amount:preview.amount,subject:preview.subject,text:preview.text,requestId:crypto.randomUUID(),acknowledged:true};
 contact.email='nowy@example.pl';
 assert.match((await request('reminder-send',confirmation)).error,/Adres lub saldo faktury zmieniły się/);
 assert.equal(deliveries.length,0);
 contact.email=preview.recipient;
 const without=await request('reminder-send',confirmation);
 assert.equal(without.state,'sent');
 assert.equal(without.attached,false);
 assert.equal(deliveries.length,1);
 assert.equal(deliveries[0].to,preview.recipient);
 assert.equal(deliveries[0].text,preview.text);
 assert.equal(deliveries[0].attachments,undefined);
 const pdf=btoa('%PDF-1.4\n%%EOF\n'),attachment={invoiceId:id,version:invoice.updated_at,pdf};
 const send=fields=>request('reminder-send',{...confirmation,requestId:crypto.randomUUID(),...fields});
 assert.equal((await send({attachment})).attached,true);
 assert.deepEqual(deliveries[1].attachments[0],{filename:'Faktura_A1-11-2026.pdf',content:pdf,encoding:'base64',contentType:'application/pdf'});
 assert.equal((await send({attachment:{...attachment,version:'stale'}})).attached,false);
 assert.equal(deliveries[2].attachments,undefined);
 assert.equal((await send({attachment:{...attachment,pdf:btoa('not a PDF')}})).attached,false);
 assert.equal(deliveries[3].attachments,undefined);
 smtpError=Object.assign(Error('Rejected'),{command:'DATA',responseCode:552,response:'552 5.3.4 Message size exceeds fixed limit'});
 assert.equal((await send({attachment})).attached,false);
 assert.ok(deliveries[4].attachments);
 assert.equal(deliveries[5].attachments,undefined);
 smtpError=Object.assign(Error('Connection lost'),{command:'DATA',code:'ECONNECTION'});
 assert.match((await send({attachment})).error,/Nie udało się potwierdzić wysyłki/);
 assert.equal(deliveries.length,7);
 contact.email='';
 assert.match((await request('reminder-preview')).recipientIssue,/Uzupełnij adres/);
 contacts=[];
 assert.equal((await request('reminder-preview')).recipientSource,'invoice');
});
