import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import * as Core from '../app/aga-core.js';
async function setup({delayed=false}={}){
 const nodes=new Map(),writes=[],saves=[];let allowed=true,fail=false,release;
 function node(key){if(nodes.has(key))return nodes.get(key);const n={innerHTML:'',textContent:'',isConnected:true,hidden:false,handlers:{},dataset:{},values:{},querySelector:node,querySelectorAll:()=>[],addEventListener:(kind,fn)=>n.handlers[kind]=fn,append(el){this.child=el},remove(){n.isConnected=false},scrollIntoView(){}};nodes.set(key,n);return n;}
 const host=node('host');host.querySelector=s=>s==='#cfAgaOverlay'?(host.child?.isConnected?host.child:null):node(s);
 const stored={owner_id:'owner',revision:3,payload:{agaAnnual:{invoices:[{id:'i',date:'2026-01-01',amount:1000,rate:9,received:null}],taxes:[],projectId:'project'}}};
 const db={
  auth:{getUser:async()=>({data:{user:{id:'owner'}}})},
  from:()=>({select:()=>({eq:(key,value)=>{
   assert.equal(key,'owner_id');assert.equal(value,'owner');
   return {single:async()=>{if(delayed)await new Promise(r=>release=r);return {data:structuredClone(stored)}}};
  }})}),
  rpc:async(name,args)=>{saves.push({name,args});if(fail)return {error:{message:'RS_CONFLICT'}};return {data:{revision:4}}}
 };
 const context=vm.createContext({AgaCore:Core,structuredClone,console,confirm:()=>true,FormData:class extends Map{constructor(f){super(Object.entries(f.values))}},document:{createElement:()=>node('root')},window:{cfIsAdmin:()=>true,cfBackupBridge:{getClient:()=>db},open:()=>({document:{write:html=>writes.push(html),close(){}}})}});
 let source=await fs.readFile(new URL('../pack/aga.js',import.meta.url),'utf8');source=source.replace("await import('/app/aga-core.js?v=20261024-1')",'globalThis.AgaCore');vm.runInContext(source,context);
 const pending=context.window.CFAga.open(host,()=>allowed);if(!delayed)await pending;
 const click=(action,id)=>node('root').handlers.click({target:{dataset:{id},closest:()=>({dataset:{aga:action}})}});
 return {nodes,node,host,writes,saves,pending,click,deny:()=>allowed=false,fail:v=>fail=v,release:()=>release()};
}
test('annual tool preserves unknown receipt status, scopes settings writes, renders PDF, and retains failed form',async()=>{
 const t=await setup();assert(t.node('root').innerHTML.includes('Aga - rozliczenie'));assert(t.node('root').innerHTML.includes('Do potwierdzenia'));assert(t.node('root').innerHTML.includes('view=ledger'));
 t.click('edit-invoice','i');assert.match(t.node('#aga-form-host').innerHTML,/value="unknown" selected/);
 const form=t.node('.aga-form');form.values={date:'2026-01-01',amount:'2000',rate:'9',number:'FV/1',description:'Test <unsafe>',received:'unknown',note:'note'};
 t.fail(true);await form.onsubmit({preventDefault(){}});assert.match(t.node('.aga-status').textContent,/Nie zapisano.*RS_CONFLICT/);assert.match(t.node('#aga-form-host').innerHTML,/Edytuj/);
 t.fail(false);await form.onsubmit({preventDefault(){}});assert.equal(t.saves.at(-1).name,'rs_save_settings_fast');assert.equal(t.saves.at(-1).args.p_revision,3);assert.deepEqual(Object.keys(t.saves.at(-1).args.p_fields),['agaAnnual']);assert.equal(t.saves.at(-1).args.p_fields.agaAnnual.invoices[0].received,null);
 t.click('pdf');assert.equal(t.writes.length,1);assert.match(t.writes[0],/Test &lt;unsafe&gt;/);assert(!t.writes[0].includes('data-aga="edit-invoice"'));
 t.click('back');assert.equal(t.node('#cfEarningsOverlay').hidden,false);
});
test('authorization loss during load never renders private annual entries',async()=>{
 const t=await setup({delayed:true});await new Promise(r=>setImmediate(r));t.deny();t.release();await t.pending;assert(!t.node('root').innerHTML.includes('1000'));assert.equal(t.saves.length,0);
});
