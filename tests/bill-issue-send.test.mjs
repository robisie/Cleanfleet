import * as Payment from '../bill/payment-status.js';
import * as Demand from '../bill/payment-demand.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
import * as C from '../bill/core.js';import * as F from '../supabase/functions/cleanfleet-bill/fleet.js';
const id='10000000-0000-4000-8000-000000000001';
function draft(){return {id,revision:1,status:'draft',number:null,payload:{...C.newInvoice('robisie'),payment:'cash',buyer:{kind:'person',name:'  Jan Testowy  ',address:'Testowa 1',city:'00-001 Warszawa',country:'PL'},lines:[{name:'Usługa',qty:'1',unit:'szt.',price:'10.00'}]}};}
test('server rejects sending drafts and issues ordinary invoices without any KSeF access',async()=>{
 let row=draft(),handler,authCalls=0,rpcCalls=0;
 function from(table){const q={select(){return q;},eq(){return q;},single:async()=>({data:table==='user_roles'?{role:'admin'}:row}),maybeSingle:async()=>({data:table==='bill_fleet_attachments'?null:table==='cf_ksef_credentials'?{nip:C.SELLER.nip,ciphertext:'test-only'}:row})};return q;}
 const context=vm.createContext({console,Request,Response,JSON,crypto,Deno:{env:{get:()=>''},serve:h=>handler=h}});
 const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/cleanfleet-bill/index.ts',import.meta.url),'utf8'));
 const m=new vm.SourceTextModule(source,{context});await m.link(spec=>{
 const values=spec.includes('pack-bank-mail/vault.js')?{openAccount:async()=>({state:{}})}:spec.includes('bill-bank-match.js')?{reconcileBillPayments:async()=>{}}:spec.includes('payment-status')?Payment:spec.includes('payment-demand')?Demand:spec.includes('npm:')?{createClient:()=>({from,auth:{getUser:async()=>({data:{user:{id:'admin'}}})},rpc:async(name,args)=>{rpcCalls++;assert.equal(name,'bill_issue_prepared');assert.equal(args.p_revision,1);assert.equal(args.p_payload.buyer.name,'Jan Testowy');row={...row,payload:args.p_payload,revision:2,status:'issued',number:'A9/10/2026'};return {data:row};}})}:spec.includes('fleet.js')?F:spec.includes('invoice.js')?C:spec.includes('archive.js')?{acceptedBillMetadata(){},createArchiveService:()=>()=>{}}:spec.includes('gus.js')?{gus:{},lookupWithFallback(){}}:spec.includes('registry.js')?{lookupCompany(){}}:spec.includes('billing.js')?{stageInvoiceSeed(){},investmentInvoiceSeed(){}}:spec.includes('ksef/core')?{hash(){},createStateCodec:()=>({open:async()=>({environment:'production',nip:C.SELLER.nip,token:'fake'})})}:{ksefApi:()=>()=>{throw Error('Unexpected network');},authenticate:()=>{authCalls++;throw Error('TEST STOP before network');},openSession(){},invoiceStatus(){},KsefError:Error};
 return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 const req=async action=>{const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action,id,revision:1})}));return {status:response.status,data:await response.json()};};
 let result=await req('send');assert.match(result.data.error,/Najpierw wystaw/);assert.equal(authCalls,0);assert.equal(rpcCalls,0);assert.equal(row.status,'draft');
 result=await req('issue-only');assert.equal(result.status,200);assert.equal(result.data.status,'issued');assert.ok(result.data.number);assert.equal(authCalls,0);assert.equal(rpcCalls,1);
 await req('issue-only');assert.equal(rpcCalls,1);assert.equal(authCalls,0);
 result=await req('send');assert.equal(authCalls,1);assert.match(result.data.error,/TEST STOP/);assert.equal(row.status,'issued');
});
test('client issue and send are independent explicit operations',async()=>{
 const calls=[],nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',classList:{add(){},remove(){}},style:{}});return nodes.get(s);};let current=draft();
 const context=vm.createContext({console,crypto,URL,URLSearchParams,structuredClone,location:{search:''},setTimeout:()=>0,clearTimeout(){},window:{addEventListener(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},body:{}}});
 const source=await readFile(new URL('../bill/app.js',import.meta.url),'utf8');const m=new vm.SourceTextModule(source+`\nrefresh=async()=>{};render=()=>{};toast=()=>{};export function setup(r){selected=r;view='detail';}export {issueSavedInvoice,sendSavedInvoice};`,{context});
 await m.link(spec=>{const values=spec.includes('pack-bank-mail/vault.js')?{openAccount:async()=>({state:{}})}:spec.includes('bill-bank-match.js')?{reconcileBillPayments:async()=>{}}:spec.includes('payment-status')?Payment:spec.includes('payment-demand')?Demand:spec.includes('./core')?C:spec.includes('./api')?{restoreSession:()=>null,call:async body=>{calls.push(body.action);current={...current,status:body.action==='issue-only'?'issued':'pending',number:'A9/10/2026'};return current;}}:{preview(){},previewHtml(){}};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 m.namespace.setup(current);await assert.rejects(m.namespace.sendSavedInvoice(),/Najpierw/);assert.deepEqual(calls,[]);
 await m.namespace.issueSavedInvoice();assert.deepEqual(calls,['issue-only']);await m.namespace.sendSavedInvoice();assert.deepEqual(calls,['issue-only','send']);
});
