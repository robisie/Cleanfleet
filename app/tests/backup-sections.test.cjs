const assert=require('node:assert/strict');
const {splitBackup,planRestore}=require('../backup-sections.js');
const tables={companies:[{id:'a'},{id:'b'}],wash_records:[{id:'wa',company_id:'a'},{id:'wb',company_id:'b'}],
  invoices:[{id:'ia',company_id:'a'}],invoice_items:[{id:'item-a',invoice_id:'ia',wash_record_id:'wa'}],
  cf_reminders:[{id:'ra',company_id:'a'},{id:'rg',company_id:null}],
  cf_tax_payments:[{id:'ta',reminder_id:'ra'},{id:'tg',reminder_id:'rg'},{id:'tb',inherited_from_id:'ta'}],
  cf_earnings:[{id:'ea',source_wash_record_id:'wa'},{id:'eg',source_wash_record_id:null}],
  wash_change_requests:[{id:'change-b',wash_record_id:'wb'}],
  cf_messages:[{id:'ma',company_id:'a'}],cf_purchases:[],cf_notifications:[],vehicles:[],billing_companies:[],
  wash_record_photos:[],notification_log:[],push_notification_log:[],website_content:[{slide:1}]};
const {sections,counts}=splitBackup(tables);
assert.equal(sections.companies.a.invoice_items[0].id,'item-a');
assert.equal(sections.companies.b.wash_change_requests[0].id,'change-b');
assert.equal(sections.companies.a.cf_tax_payments.length,2);
assert.equal(sections.admin.cf_tax_payments[0].id,'tg');
assert.equal(sections.admin.cf_earnings[0].id,'eg');
assert.equal(counts.admin.website_content,1);
assert.throws(()=>splitBackup({...tables,invoice_items:[{id:'x',invoice_id:'unknown'}]}),/Brak powiązania/);
assert.throws(()=>splitBackup({...tables,cf_tax_payments:[{id:'a',inherited_from_id:'b'},{id:'b',inherited_from_id:'a'}]}),/Cykliczne/);
const current={...tables,user_roles:[{user_id:'admin-a',role:'admin'}]};
const source={...current,vehicles:[{plate:'AAA',company_id:'a'}]};
const operations=planRestore(source,current,{companyIds:['a']},'admin-a');
assert.ok(operations.some(x=>x.action==='insert'&&x.table==='vehicles'));
assert.ok(!operations.some(x=>x.scope==='b'));
assert.throws(()=>planRestore(source,current,{companyIds:['missing']},'admin-a'),/nie ma firmy/);
assert.throws(()=>planRestore({...source,user_roles:[]},current,{admin:true},'admin-a'),/roli obecnego/);
console.log('PASS: podział jednego backupu na panel i wybrane firmy zachowuje zależności.');
