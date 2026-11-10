import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {readFile} from 'node:fs/promises';
import {partyCountry} from '../supabase/functions/cleanfleet-bill/invoice.js';
import {receiptText,DEFAULT_RECEIPT_TEMPLATE} from '../supabase/functions/cleanfleet-bill/receipt.js';

test('Bill asks before sending, records one receipt, and never sends a duplicate',async()=>{
 const id='10000000-0000-4000-8000-000000000001';
 const row={id,creator_id:'owner',number:'A1/11/2026',status:'accepted',payload:{buyer:{name:'Klient',email:'klient@example.pl'},currency:'PLN',lines:[{name:'Usługa',qty:'1',unit:'szt.',price:'100.00'}],vatTreatment:'exempt',globalDiscount:'0'}};
 const rows={user_roles:[{user_id:'owner',role:'admin'}],bill_invoices:[row],bill_smtp_credentials:[{user_id:'owner',ciphertext:'fixture'}],bill_payment_evidence:[{invoice_id:id,bank_cents:3000,manual_paid:false}],bill_payment_receipt_emails:[]};
 let handler;const deliveries=[];
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(table){
  const q={filters:[],mutation:null,select(){return this;},eq(key,value){this.filters.push([key,value]);return this;},order(){return this;},limit(){return this;},
   insert(value){this.mutation=['insert',value];return this;},update(value){this.mutation=['update',value];return this;},
   run(){const collection=rows[table]||[],found=collection.filter(x=>this.filters.every(([k,v])=>x[k]===v));
    if(this.mutation?.[0]==='insert'){
     if(table==='bill_payment_receipt_emails'&&collection.some(x=>x.invoice_id===this.mutation[1].invoice_id))return {data:null,error:{code:'23505'}};
     const item={...this.mutation[1]};collection.push(item);return {data:item,error:null};
    }
    if(this.mutation?.[0]==='update'){for(const item of found)Object.assign(item,this.mutation[1]);return {data:found[0]||null,error:null};}
    return {data:found[0]||null,error:null};},
   single(){return Promise.resolve(this.run());},maybeSingle(){return Promise.resolve(this.run());},then(resolve){resolve(this.run());}
  };return q;
 }};
 const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/cleanfleet-bill/index.ts',import.meta.url),'utf8'));
 const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].map(m=>[m[2],m[1].split(',').map(s=>s.trim())]));
 const implementations={createClient:()=>db,createArchiveService:()=>async()=>{},ksefApi:()=>async()=>{},createStateCodec:()=>({open:async()=>({})}),partyCountry};
 const context=vm.createContext({console,Request,Response,JSON,crypto,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [name,value] of Object.entries(values))this.setExport(name,value);},{context});
 const module=new vm.SourceTextModule(source,{context,importModuleDynamically:async spec=>{
  const values=spec==='./receipt.js'?{receiptText,DEFAULT_RECEIPT_TEMPLATE}:spec==='./smtp.js'?{smtpTransport:async()=>({sendMail:async mail=>{deliveries.push(mail);return {accepted:[mail.to],messageId:'test'};},close(){}})}:{};
  const imported=synthetic(values);await imported.link(()=>{});await imported.evaluate();return imported;
 }});
 await module.link(spec=>synthetic(Object.fromEntries((imports.get(spec)||[]).map(name=>[name,implementations[name]||(()=>{})]))));await module.evaluate();
 const request=async(action,fields={})=>{const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action,id,...fields})}));return response.json();};
 const preview=await request('receipt-preview');
 assert.equal(preview.recipient,'klient@example.pl',JSON.stringify(preview));assert.equal(preview.amount,3000);assert.equal(preview.remaining,7000);
 assert.equal(deliveries.length,0);
 assert.match((await request('receipt-send',{recipient:preview.recipient,subject:preview.subject,text:preview.text,amount:preview.amount,requestId:crypto.randomUUID()})).error,/Potwierdź/);
 const body={recipient:preview.recipient,subject:preview.subject,text:preview.text,amount:preview.amount,requestId:crypto.randomUUID(),acknowledged:true};
 assert.equal((await request('receipt-send',body)).state,'sent');assert.equal(deliveries.length,1);
 assert.equal((await request('receipt-send',{...body,requestId:crypto.randomUUID()})).state,'sent');assert.equal(deliveries.length,1);
 assert.equal((await request('receipt-dismiss')).state,'sent');
});
