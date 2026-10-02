const test=require('node:test'),assert=require('node:assert/strict');const d=require('../app/accounting-decisions.js'),{reconcile}=require('../app/accounting-reconcile.js');
const scope={month:'2026-09',nip:'6351861297',environment:'production'},account='12345678901234567890123456';
const invoice={nrKSeF:'1234567890-20260831-123456789abc-ab',nip:'1234567890',number:'FV/08/2026',date:'2026-08-31',gross:'500.00',currency:'PLN',seller:'Szoltysek Transport',accounts:[]};
const op=(party='Szoltysek Transport',extra={})=>({booked:'2026-09-10',operated:'2026-09-10',amount:-50000n,party,title:'FV/08/2026',description:'PRZELEW',...extra});
const result=(operations=[op()],bankAccount=account,invoices=[invoice])=>reconcile({month:scope.month,bankResults:[{month:scope.month,statement:{account:bankAccount,currency:'PLN',operations}}],history:{expected:['2026-08'],snapshots:[{month:'2026-08',invoices}]}});
function client(){const records=new Map();let user='owner',failure=null;const c={auth:{getUser:async()=>({data:{user:{id:user}}})},from:table=>{assert.equal(table,'cf_accounting_review_decisions');return {upsert:(updates,options)=>{c.last={updates,options};if(failure)return Promise.resolve({error:{message:failure}});updates.forEach(row=>records.set(JSON.stringify([row.user_id,row.environment,row.nip,row.month,row.transaction_key]),row));return Promise.resolve({count:updates.length,error:null});},select:()=>{const filters={};const q={eq:(k,v)=>{filters[k]=v;return q;},in:(k,v)=>{filters[k]=v;return q;},abortSignal:()=>q,then:resolve=>resolve(failure?{error:{message:failure}}:{data:[...records.values()].filter(row=>Object.entries(filters).every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v)),error:null})};return q;}}},user:id=>user=id,fail:message=>failure=message};return c;}
test('bulk decisions persist across fresh reconciliation and row reorder, change and reset immediately replace prior decisions',async()=>{
 const c=client(),r=result([op(),op('Lidl',{title:'card purchase'})]);await d.load(c,scope,r.rows);await d.save(c,{...scope,userId:'owner'},r,[r.rows[0].id],'no_invoice');
 const fresh=result([op('Lidl',{title:'card purchase'}),op()]);const saved=await d.load(c,scope,fresh.rows);assert.equal(d.restore(fresh,saved.records),1);assert.equal(fresh.rows[1].reviewStatus,'no_invoice');assert.equal(fresh.rows[0].reviewStatus,undefined);
 await d.save(c,scope,fresh,[fresh.rows[1].id],'needs_document');let again=result();d.restore(again,(await d.load(c,scope,again.rows)).records);assert.equal(again.rows[0].reviewStatus,'needs_document');
 await d.save(c,scope,again,[again.rows[0].id],'reset');again=result();d.restore(again,(await d.load(c,scope,again.rows)).records);assert.equal(again.rows[0].reviewStatus,undefined);assert.equal(c.last.updates[0].review_status,null);assert.equal(c.last.updates[0].invoice_ref,null);
});
test('decisions stay isolated by account, month, NIP, environment, owner and modified transaction details; identical occurrences have separate keys',async()=>{
 const c=client(),r=result([op(),op()]);await d.save(c,scope,r,[r.rows[0].id],'checked');assert.notEqual(await d.key(r.rows[0]),await d.key(r.rows[1]));assert.match(await d.key(r.rows[0]),/^[a-f0-9]{64}$/);
 for(const context of [{...scope,nip:'1111111111'},{...scope,month:'2026-08'},{...scope,environment:'test'}])assert.equal((await d.load(c,context,r.rows)).records.length,0);
 assert.equal((await d.load(c,scope,result([op()],'99945678901234567890123456').rows)).records.length,0);assert.equal((await d.load(c,scope,result([op('',{amount:-50001n})]).rows)).records.length,0);
 c.user('other');assert.equal((await d.load(c,scope,r.rows)).records.length,0);await assert.rejects(d.save(c,{...scope,userId:'owner'},r,[r.rows[0].id],'checked'),/Konto zmienione/);
});
test('manual invoice assignment uses invoice identity across reordered candidates; changed or absent invoice becomes attention, not a false green match',async()=>{
 const c=client(),r=result();await d.save(c,scope,r,[r.rows[0].id],'checked',invoice);
 const fresh=result([op()],account,[{...invoice,nrKSeF:'other',number:'FV/other'},invoice]);d.restore(fresh,(await d.load(c,scope,fresh.rows)).records);assert.equal(fresh.rows[0].manualInvoiceIndex,1);assert.equal(fresh.rows[0].reviewStatus,'checked');
 const changed=result([op()],account,[{...invoice,gross:'600.00'}]);d.restore(changed,(await d.load(c,scope,changed.rows)).records);assert.equal(changed.rows[0].manualInvoiceIndex,undefined);assert.equal(changed.rows[0].reviewStatus,'needs_document');assert.match(changed.rows[0].savedDecisionIssue,/FV\/08\/2026/);
 await d.save(c,scope,fresh,[fresh.rows[0].id],'no_invoice');assert.equal(c.last.updates[0].invoice_ref,null);
});
test('failed bulk save makes no local status change and load errors stay explicit',async()=>{
 const c=client(),r=result([op(),op('Lidl')]);c.fail('denied');await assert.rejects(d.save(c,scope,r,r.rows.map(row=>row.id),'checked'),/zapisać.*denied/);assert.ok(r.rows.every(row=>row.reviewStatus===undefined));await assert.rejects(d.load(c,scope,r.rows),/odczytać.*denied/);await assert.rejects(d.save(c,scope,r,[r.rows[0].id],'invalid'),/Nieznana/);
});
