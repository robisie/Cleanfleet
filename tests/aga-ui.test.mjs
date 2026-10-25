import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import * as Core from '../app/aga-core.js';
async function setup({delayed=false,taxes=[],cash=null,billError=false}={}){
 const nodes=new Map(),writes=[],saves=[],drafts=[],messages=[];let allowed=true,fail=false,release;
 function node(key){if(nodes.has(key))return nodes.get(key);const n={replaceChildren(){this.innerHTML=''},innerHTML:'',textContent:'',value:'',isConnected:true,hidden:false,handlers:{},dataset:{},values:{},querySelector:node,querySelectorAll:()=>[],addEventListener:(kind,fn)=>n.handlers[kind]=fn,append(el){this.child=el},remove(){n.isConnected=false},scrollIntoView(){}};nodes.set(key,n);return n;}
 const host=node('host');host.querySelector=s=>s==='#cfAgaOverlay'?(host.child?.isConnected?host.child:null):node(s);
 const stored={owner_id:'owner',revision:3,payload:{agaAnnual:{invoices:[{id:'i',date:'2026-01-01',amount:1000,rate:9,received:null}],taxes,projectId:'project'}}};
 const db={functions:{invoke:async(name,args)=>{drafts.push({name,args});return billError?{error:Error('Brak połączenia')}:{data:{invoiceId:args.body.id}}}},
  auth:{getUser:async()=>({data:{user:{id:'owner'}}})},
  from:()=>({select:()=>({eq:(key,value)=>{
   assert.equal(key,'owner_id');assert.equal(value,'owner');
   return {single:async()=>{if(delayed)await new Promise(r=>release=r);return {data:structuredClone(stored)}}};
  }})}),
  rpc:async(name,args)=>{saves.push({name,args});if(fail)return {error:{message:'RS_CONFLICT'}};return {data:{revision:4}}}
 };
 const context=vm.createContext({AgaCore:Core,structuredClone,console,URL,location:{origin:'https://cleanfleet.pl'},confirm:()=>true,FormData:class extends Map{constructor(f){super(Object.entries(f.values))}},document:{createElement:()=>node('root')},window:{parent:{postMessage:(...args)=>messages.push(args)},cfIsAdmin:()=>true,cfBackupBridge:{getClient:()=>db},open:()=>({document:{write:html=>writes.push(html),close(){}}})}});
 let source=await fs.readFile(new URL('../pack/aga.js',import.meta.url),'utf8');source=source.replace("await import('/app/aga-core.js?v=20261025-1')",'globalThis.AgaCore');vm.runInContext(source,context);
 const pending=context.window.CFAga.open(host,()=>allowed,{getCashBalance:()=>cash});if(!delayed)await pending;
 const click=(action,id)=>node('root').handlers.click({target:{dataset:{id},closest:()=>({dataset:{aga:action}})}});
 return {nodes,node,host,writes,saves,drafts,messages,pending,click,deny:()=>allowed=false,fail:v=>fail=v,release:()=>release()};
}
test('annual tool preserves unknown receipt status, scopes settings writes, renders PDF, and retains failed form',async()=>{
 const t=await setup();assert(t.node('root').innerHTML.includes('Aga - rozliczenie'));assert(t.node('root').innerHTML.includes('Do potwierdzenia'));assert(t.node('root').innerHTML.includes('view=ledger'));
 t.click('edit-invoice','i');assert.match(t.node('#aga-form-host').innerHTML,/value="unknown" selected/);
 const form=t.node('.aga-form');form.values={date:'2026-01-01',amount:'2000',rate:'9',number:'FV/1',description:'Test <unsafe>',received:'unknown',note:'note'};
 t.fail(true);await form.onsubmit({preventDefault(){}});assert.match(t.node('.aga-status').textContent,/Nie zapisano.*RS_CONFLICT/);assert.match(t.node('#aga-form-host').innerHTML,/Edytuj/);
 t.fail(false);await form.onsubmit({preventDefault(){}});assert.equal(t.saves.at(-1).name,'rs_save_settings_fast');assert.equal(t.saves.at(-1).args.p_revision,3);assert.deepEqual(Object.keys(t.saves.at(-1).args.p_fields),['agaAnnual']);assert.equal(t.saves.at(-1).args.p_fields.agaAnnual.invoices[0].received,null);
 t.click('pdf');assert.equal(t.writes.length,1);assert.match(t.writes[0],/Test &lt;unsafe&gt;/);assert.match(t.writes[0],/robisie-logo\.png/);assert.match(t.writes[0],/document-header/);assert.match(t.writes[0],/print-color-adjust:exact/);assert.match(t.writes[0],/thead\{display:table-header-group\}/);assert.match(t.writes[0],/<details class=\"aga-extra\" open>/);assert(!t.writes[0].includes('data-aga="edit-invoice"'));
 t.click('back');assert.equal(t.node('#cfEarningsOverlay').hidden,false);
});
test('authorization loss during load never renders private annual entries',async()=>{
 const t=await setup({delayed:true});await new Promise(r=>setImmediate(r));t.deny();t.release();await t.pending;assert(!t.node('root').innerHTML.includes(Core.money(1000)));assert.equal(t.saves.length,0);
});

test('four primary cards show invoice total, 9 percent, paid tax and exact remainder in UI and PDF',async()=>{
 const t=await setup({taxes:[{id:'tax',period:'2026-01',date:'2026-02-10',amount:40}]});
 for(const html of [t.node('root').innerHTML,(t.click('pdf'),t.writes[0])]){
  const cards=html.split('aria-label="Najważniejsze kwoty rozliczenia">')[1].split('</div><p>')[0];
  assert.equal((cards.match(/class="aga-metric"/g)||[]).length,4);
  for(const label of ['Suma wystawionych faktur','Suma podatku 9%','Zapłacony podatek','Pozostało po zapłacie podatku'])assert(cards.includes(label));
  for(const value of [1000,90,40,50])assert(cards.includes('<strong>'+Core.money(value)+'</strong>'));
  assert(cards.includes(Core.money(90)+' − '+Core.money(40)));
 }
});
test('remainder stays numeric without payments and preserves negative balances',async()=>{
 const empty=await setup();assert(empty.node('root').innerHTML.includes('Brak wpisanych wpłat podatku'));assert(empty.node('root').innerHTML.includes('<strong>'+Core.money(90)+'</strong>'));
 const over=await setup({taxes:[{id:'tax',period:'2026-01',date:'2026-02-10',amount:120}]});assert(over.node('root').innerHTML.includes('<strong>'+Core.money(-30)+'</strong>'));
});

test('monthly ledger groups invoice and tax rows together, highlights the correct remainder and prints all months',async()=>{
 const t=await setup({taxes:[{id:'tax',period:'2026-01',date:'2026-02-10',amount:40}]});
 const html=t.node('root').innerHTML,months=[...html.matchAll(/<details class="aga-month"[^>]*>([\s\S]*?)<\/details>/g)];assert.equal(months.length,12);
 const january=months[0][1];assert(january.includes('Styczeń 2026'));assert(january.includes('01.01.2026'));assert(january.includes('10.02.2026'));assert(january.includes('Wpłata podatku'));assert(january.includes('data-id="i"'));assert(january.includes('data-id="tax"'));assert(january.includes('Suma miesiąca'));assert(january.includes('<td class="aga-balance">'+Core.money(50)));
 assert(!months[1][1].includes('data-id="tax"'));assert.equal(html.split('data-id="i"').length-1,1);assert(!html.includes('<h3>Faktury</h3>'));
 t.click('pdf');assert.equal((t.writes[0].match(/<details class="aga-month" open>/g)||[]).length,12);assert(!t.writes[0].includes('data-id="i"'));
});
test('quarterly tax is never subtracted separately from each month',async()=>{
 const t=await setup({taxes:[{id:'quarter',period:'2026-Q1',date:'2026-04-10',amount:40}]});
 const months=[...t.node('root').innerHTML.matchAll(/<details class="aga-month"[^>]*>([\s\S]*?)<\/details>/g)];
 for(const m of months.slice(0,3)){assert(m[1].includes('podatek kwartalny'));assert(m[1].includes('W kwartale'));assert(!m[1].includes('data-id="quarter"'));assert(m[1].includes('<td class="aga-balance">—'));}
});

test('invoice form suggests gross from cash after 9 percent without changing cash or auto-saving',async()=>{
 const t=await setup({cash:91000});t.click('new-invoice');assert.match(t.node('#aga-cash-hint').innerHTML,/910,00/);assert.match(t.node('#aga-cash-hint').innerHTML,/1000,00|1.?000,00/);assert.equal(t.saves.length,0);
 t.node('[data-use-cash]').onclick();assert.equal(t.node('[name=amount]').value,'1000');assert.equal(t.node('[name=rate]').value,'9');assert.match(t.node('#aga-invoice-preview').textContent,/910,00/);assert.equal(t.saves.length,0);
 t.node('[name=amount]').value='2000';t.node('[name=amount]').oninput();assert.match(t.node('#aga-invoice-preview').textContent,/1820,00|1.?820,00/);
 const missing=await setup();missing.click('new-invoice');assert.match(missing.node('#aga-cash-hint').innerHTML,/niedostępna/);assert.equal(missing.saves.length,0);
});

test('Bill action prepares one linked draft and opens Bill without manually saving annual entries',async()=>{
 const t=await setup({cash:483000});t.click('new-invoice');assert.match(t.node('#aga-form-host').innerHTML,/Wystaw fakturę w Bill/);
 t.node('.aga-form').values={date:'2026-10-25',amount:'5307.69',rate:'9',received:'unknown',note:'Test'};
 await t.node('[data-issue-bill]').onclick();assert.equal(t.drafts.length,1);assert.equal(t.saves.length,0);assert.equal(t.drafts[0].name,'aga-bill-draft');assert.equal(t.drafts[0].args.body.amount,5307.69);assert.equal(t.drafts[0].args.body.received,null);assert.equal(t.messages.length,1);assert.match(t.messages[0][0].url,/\/bill\/\?invoice=.*&edit=1/);assert.equal(t.messages[0][1],'https://cleanfleet.pl');
});
test('Bill errors retain the form and retry the same invoice intent',async()=>{
 const t=await setup({billError:true});t.click('new-invoice');t.node('.aga-form').values={date:'2026-10-25',amount:'1000',rate:'9',received:'no',note:''};
 await t.node('[data-issue-bill]').onclick();await t.node('[data-issue-bill]').onclick();assert.equal(t.drafts.length,2);assert.equal(t.drafts[0].args.body.id,t.drafts[1].args.body.id);assert.equal(t.saves.length,0);assert.equal(t.messages.length,0);assert.match(t.node('.aga-status').textContent,/Formularz pozostał zachowany/);
});
