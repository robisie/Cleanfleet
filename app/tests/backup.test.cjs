const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const code = html.slice(html.indexOf('  function cfSheetObjects('), html.indexOf('  function showBackupRestoreChoice('));
assert.ok(code.startsWith('  function cfSheetObjects('));
const company = 'company-a';
const ctx = {
  XLSX: {utils: {sheet_to_json: (sheet, opts) => opts?.header === 1 ? sheet.info : sheet.rows}},
  cfActiveCompanyId: company,
  cfSupabase: {auth: {getSession: async () => ({data:{session:{user:{id:'user-a'}}}})}},
  cfFetchAllRows: async () => [],
  cfBackupInvoiceItems: async () => [],
  cfSetSync: () => {}, loadAll: async () => {},
  options: {}, saveOptions: () => {}
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const sheets = {
  Informacje: {info: [['Format','CleanFleet Backup v3'],['ID firmy',company],['Liczba pojazdów',1],['Liczba wpisów prania',1],['Liczba faktur',1],['Liczba pozycji faktur',1],['Liczba spółek rozliczeniowych',1]]},
  Spolki_rozliczeniowe: {rows:[{id:'billing-a',name:'A',company_id:company,active:true}]},
  Pojazdy: {rows:[{plate:'ABC123',company_id:company,model:'Model',billing_company_id:'billing-a'}]},
  Wpisy_prania: {rows:[{id:'wash-a',plate:'ABC123',company_id:company,work_items:'[{"name":"mycie"}]',billing_company_id:'billing-a'}]},
  Faktury: {rows:[{id:'invoice-a',invoice_number:'F1',company_id:company,billing_company_id:'billing-a'}]},
  Pozycje_faktur: {rows:[{id:'item-a',invoice_id:'invoice-a',wash_record_id:'wash-a'}]}
};
const workbook = {Sheets:sheets, SheetNames:Object.keys(sheets)};
const data = ctx.cfPrepareBackupData(workbook);
assert.equal(data.vehicles[0].model,'Model');
assert.equal(data.wash_records[0].work_items[0].name,'mycie');
assert.equal(data.billing_companies.length,1);
assert.throws(() => ctx.cfValidateBackupCompany(structuredClone(data),'other-company'),/innej firmy/);
const wrong = structuredClone(data); wrong.invoice_items[0].invoice_id='missing';
assert.throws(() => ctx.cfValidateBackupCompany(wrong,company),/bez odpowiadającej im faktury/);
const short = structuredClone(workbook); short.Sheets = {...sheets, Pojazdy:{rows:[]}};
assert.throws(() => ctx.cfPrepareBackupData(short),/niekompletny/);
(async () => {
  const log=[];
  ctx.cfSupabase.from = table => ({
    delete() {const query={in(key,ids){log.push({table,key,ids});return this;},eq(key,value){log.push({table,key,value});return this;},then(resolve){resolve({error:null});}};return query;},
    upsert(rows){log.push({table,upsert:rows});return Promise.resolve({error:null});},
    select(){return {in(){return Promise.resolve({data:[],error:null});}};}
  });
  ctx.cfFetchAllRows = async table => ({billing_companies:[{id:'billing-existing'}],invoices:[{id:'invoice-existing'}],wash_records:[{id:'wash-existing'}],vehicles:[{plate:'OTHER'}]})[table];
  ctx.cfBackupInvoiceItems = async () => [{id:'item-existing'}];
  await ctx.cfRestoreFullBackup(structuredClone(data),'replace');
  assert.deepEqual(log.filter(x=>x.value===company).map(x=>x.table),['invoices','wash_records','vehicles']);
  assert.deepEqual(log.filter(x=>x.ids).map(x=>x.table),['invoice_items','invoices','wash_records','vehicles']);
  assert.ok(!log.some(x=>x.table==='billing_companies'&&x.ids));
  log.length=0;
  const legacy=structuredClone(data);legacy.hasBillingSheet=false;legacy.billing_companies=[];
  await assert.rejects(ctx.cfRestoreFullBackup(legacy,'replace'),/Stary backup/);
  assert.ok(!log.some(x=>x.ids));
  console.log('PASS: backup v3, integralność, granice firmy i bezpieczna blokada starego pliku.');
})().catch(e=>{console.error(e);process.exitCode=1;});
