import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const context=vm.createContext({cfCompanies:[]});vm.runInContext(await readFile(new URL('../pack/reminders.js',import.meta.url),'utf8'),context);
const target=(r,companies=[])=>JSON.parse(JSON.stringify(context.cfReminderInvoiceTarget(r,companies)));
test('invoice actions route every saved company by ID or normalized name, not a fixed list',()=>{
 const companies=[{id:'tvm',name:'Transport TVM',short_name:'TVM'},{id:'parys',name:'Parysiewicz'},{id:'new',name:'Żółty Przewoźnik'}];
 for(const c of companies)assert.equal(target({title:'Wystawić fakturę',company_id:c.id},companies).app,'cleanfleet');
 for(const title of ['Wystawić fakturę dla TVM','Wystaw fakturę Parysiewicz','Wystawienie faktury Zolty Przewoznik'])assert.equal(target({title},companies).app,'cleanfleet');
 assert.equal(target({title:'Wystawić fakturę Robi się'}).app,'robisie');
 assert.equal(target({title:'Faktura do wystawienia',notes:'Robisię'}).app,'robisie');
 assert.equal(target({title:'Faktura za prania',category:'invoice',notes:'CleanFleet'}).app,'cleanfleet');
});
test('unknown and ambiguous invoice tasks offer a choice; payments and unrelated tasks have no action',()=>{
 assert.equal(target({title:'Wystawić fakturę nowemu klientowi'}).app,null);
 assert.equal(target({title:'Wystawić fakturę Alfa',category:'invoice'},[{name:'Alfa'},{name:'Alfa'}]).app,null);
 for(const r of [{title:'Zapłać fakturę',category:'invoice',is_payment:true},{title:'Kasia księgowa',is_payment:true},{title:'Browar'},{title:'Odebrać fakturę'}])assert.equal(target(r),null);
});
