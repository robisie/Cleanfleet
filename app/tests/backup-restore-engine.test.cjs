const assert=require('node:assert/strict');
const {applyRestore,orderTax}=require('../../supabase/functions/cleanfleet-backup-restore/restore-engine.js');
const queryLog=[];
const tx={unsafe:async(sql,params)=>{queryLog.push([sql,params]);return []}};
(async()=>{
  const operations=[
    {scope:'a',action:'delete',table:'invoice_items',rows:[{id:'item'}]},
    {scope:'a',action:'insert',table:'billing_companies',rows:[{id:'billing',company_id:'a'}]},
    {scope:'a',action:'insert',table:'cf_tax_payments',rows:[{id:'parent'},{id:'child',inherited_from_id:'parent'}]}
  ];
  const result=await applyRestore(tx,operations,[]);
  assert.equal(result.deleted,1);assert.equal(result.inserted,3);
  assert.match(queryLog[0][0],/^DELETE FROM public.invoice_items t USING jsonb_populate_recordset/);
  assert.match(queryLog[1][0],/^INSERT INTO public.billing_companies SELECT \* FROM jsonb_populate_recordset/);
  assert.deepEqual(orderTax([{id:'child',inherited_from_id:'parent'},{id:'parent'}]).map(x=>x.id),['parent','child']);
  queryLog.length=0;
  await applyRestore(tx,[{scope:'admin',action:'merge',tables:{
    companies:[{id:'a',name:'Firma'}],cf_user_activity_daily:[{user_id:'u',activity_date:'2026-09-29'}],
    push_subscriptions:[{id:'sub'}],website_events:[{id:'event'}]
  }}],[]);
  assert.equal(queryLog.length,7);
  assert.match(queryLog[1][0],/ON CONFLICT \("user_id","activity_date"\)/);
  assert.equal(queryLog.filter(([sql])=>sql.includes('DELETE FROM public.cf_notifications WHERE NOT')).length,2);
  assert.ok(queryLog.some(([sql])=>sql.includes('OVERRIDING SYSTEM VALUE')));
  assert.ok(queryLog.some(([sql])=>sql.includes('setval(')));
  await assert.rejects(applyRestore(tx,[{action:'delete',scope:'a',table:'untrusted',rows:[{id:'x'}]}],[]),/Nieobsługiwana tabela/);
  await assert.rejects(applyRestore(tx,[{action:'insert',scope:'a',table:'vehicles',rows:[{company_id:'a'}]}],[]),/Niepoprawny rekord/);
  console.log('PASS: plan odtwarzania używa jawnych tabel, kluczy i kolejności podatków.');
})().catch(e=>{console.error(e);process.exitCode=1});
