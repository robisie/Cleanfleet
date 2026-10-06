const test=require('node:test'),assert=require('node:assert/strict');const h=require('../app/accounting-history.js'),{reconcile}=require('../app/accounting-reconcile.js');
const invoice=(extra={})=>({date:'2026-08-31',nip:'1234567890',nrKSeF:'1234567890-20260831-123456789abc-ab',number:'FV/08/2026',seller:'Szoltysek Transport',gross:'500.00',currency:'PLN',type:'VAT',accounts:[],...extra});
const context={month:'2026-08',nip:'6351861297',environment:'production'};
function client(error=null){const rows=new Map(),filters={};const c={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>({upsert:(row,options)=>{c.last={row,options};if(!error)rows.set(JSON.stringify([row.user_id,row.environment,row.nip,row.month]),row);return Promise.resolve({error});},select:()=>{const q={eq:(key,value)=>{filters[key]=value;return q;},in:(key,values)=>{filters[key]=values;return q;},then:(resolve,reject)=>Promise.resolve({error,data:[...rows.values()].filter(row=>Object.entries(filters).every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v))}).then(resolve,reject)};return q;}})};return c;}
test('monthly metadata survives a new load, replaces duplicate snapshots and scopes owner, NIP and environment',async()=>{
 const c=client();await h.save(c,context,[invoice(),invoice()]);assert.equal(c.last.row.invoice_count,1);assert.equal(c.last.options.onConflict,'user_id,environment,nip,month');assert.equal(c.last.row.user_id,'owner');await h.save(c,context,[invoice()]);const result=await h.load(c,{...context,month:'2026-09'});assert.equal(result.snapshots.length,1);assert.equal(result.snapshots[0].invoices[0].seller,'Szoltysek Transport');assert.deepEqual(result.expected,['2026-09','2026-08','2026-07','2026-06']);assert.equal((await h.load(c,{...context,nip:'1111111111'})).snapshots.length,0);assert.equal((await h.load(c,{...context,environment:'test'})).snapshots.length,0);
});
test('empty completed months are remembered and errors are surfaced',async()=>{const c=client();await h.save(c,context,[]);assert.equal((await h.load(c,context)).snapshots[0].invoice_count,0);await assert.rejects(h.save(client({message:'denied'}),context,[invoice()]),/zapisać.*denied/);await assert.rejects(h.load(client({message:'denied'}),context),/odczytać.*denied/);assert.throws(()=>h.cleanInvoices([invoice({date:'2026-07-31'})],'2026-08'),/spoza miesiąca/);assert.deepEqual(h.months('2026-01'),['2026-01','2025-12','2025-11','2025-10']);});
const bank={month:'2026-09',statement:{account:'12345678901234567890123456',currency:'PLN',operations:[{booked:'2026-09-10',amount:-50000n,party:'Szoltysek Transport',title:'Zapłata',description:'PRZELEW'}]}};
function compare(current=[invoice({date:'2026-09-30',number:'FV/09/2026',nrKSeF:'next-invoice',gross:'600.00'})],old=[invoice()]){return reconcile({month:'2026-09',bankResults:[bank],purchases:{month:'2026-09',count:current.length,invoices:current},history:{expected:h.months('2026-09'),snapshots:[{month:'2026-08',invoices:old}]}});}
test('September payment matches exact August invoice instead of September amount, historical invoices stay out of current unpaid list',()=>{const r=compare();assert.equal(r.counts.matched,1);assert.match(r.rows[0].reason,/2026-08.*2026-09/);assert.equal(r.rows[0].candidates.find(c=>c.invoiceIndex===r.rows[0].matchedInvoice).invoice.number,'FV/08/2026');assert.equal(r.unmatchedInvoices.length,1);assert.equal(r.unmatchedInvoices[0].sourceMonth,'2026-09');assert.ok(r.warnings.some(w=>w.includes('2026-07')));});
test('same supplier and identical amounts across months stay ambiguous; metadata alone supports control without new current export',()=>{assert.equal(compare([invoice({date:'2026-09-01',number:'FV/09/2026',nrKSeF:'other-invoice'})]).counts.uncertain,1);const r=reconcile({month:'2026-09',bankResults:[bank],history:{expected:h.months('2026-09'),snapshots:[{month:'2026-08',invoices:[invoice()]}]}});assert.equal(r.counts.matched,1);assert.equal(r.unmatchedInvoices.length,0);});
test('annual range includes only elapsed months and reads complete year with existing isolation',async()=>{
 assert.deepEqual(h.yearMonths('2026-03',new Date('2026-10-02T18:00:00Z')),Array.from({length:10},(_,i)=>'2026-'+String(i+1).padStart(2,'0')));
 assert.equal(h.yearMonths('2025-03',new Date('2026-10-02')).length,12);assert.throws(()=>h.yearMonths('2027-01',new Date('2026-10-02')),/przyszłego/);
 const c=client();await h.save(c,context,[invoice()]);await h.save(c,{...context,month:'2026-01'},[]);const result=await h.loadMonths(c,context,h.yearMonths('2026-08',new Date('2026-10-02')));assert.equal(result.snapshots.length,2);assert.equal((await h.loadMonths(c,{...context,nip:'1111111111'},result.expected)).snapshots.length,0);
});
test('valid signed decimals and zero amounts normalize exactly; truly missing amounts retain invoice-specific errors',()=>{
 for(const [value,expected] of [[0,'0.00'],['+12.50','12.50'],['00012.5000','12.50'],['-0.00','0.00'],['-12.5','-12.50']])assert.equal(h.amount(value),expected);
 for(const value of ['',null,'12.501','1e3','12,50'])assert.equal(h.amount(value),null);
 assert.equal(h.cleanInvoices([invoice({gross:0,currency:'pln'})],'2026-08')[0].gross,'0.00');
 assert.throws(()=>h.cleanInvoices([invoice({gross:''})],'2026-08'),/FV\/08\/2026.*kwota brutto/);
 assert.throws(()=>h.cleanInvoices([invoice({date:'2026-09-01'})],'2026-08'),/FV\/08\/2026.*spoza miesiąca/);
});
test('export metadata fills history from authoritative KSeF fields, including zero correction and both documented JSON envelopes',async()=>{
 const Zip=require('../app/vendor/jszip-3.10.1.min.js'),id=invoice().nrKSeF;
 const metadata={ksefNumber:id,invoiceNumber:'FV/08/2026',issueDate:'2026-08-31',seller:{nip:'1234567890',name:'Szoltysek Transport'},grossAmount:0,currency:'PLN',invoiceType:'Kor'};
 for(const json of [[metadata],{invoices:[metadata]}]){
  const z=new Zip();z.file(id+'.xml','<verified invoice/>');z.file('_metadata.json',JSON.stringify(json));
  const items=await h.archiveMetadata(z,1);assert.equal(items[0].gross,0);assert.equal(h.cleanInvoices(items,'2026-08')[0].gross,'0.00');
  const merged=h.mergeMetadata([invoice({gross:'',buyer:'Nabywca testowy',buyerNip:'6351861297',accounts:['12345678901234567890123456']})],items);assert.deepEqual(merged[0].accounts,['12345678901234567890123456']);assert.equal(merged[0].gross,0);assert.equal(merged[0].buyer,'Nabywca testowy');assert.equal(merged[0].buyerNip,'6351861297');
  assert.throws(()=>h.mergeMetadata([invoice({number:'different invoice'})],items),/niezgodne/);
 }
 const noMetadata=new Zip();noMetadata.file(id+'.xml','xml');assert.equal(await h.archiveMetadata(noMetadata,1),null);
});
test('metadata never saves a truncated or mismatched invoice list and honors cancellation',async()=>{
 const Zip=require('../app/vendor/jszip-3.10.1.min.js'),z=new Zip(),id=invoice().nrKSeF;z.file(id+'.xml','xml');z.file('_metadata.json',JSON.stringify({invoices:[]}));
 await assert.rejects(h.archiveMetadata(z,1),/Liczba faktur/);
 z.file('_metadata.json',JSON.stringify({invoices:[{ksefNumber:'0000000000-20260831-123456789abc-ab'}]}));await assert.rejects(h.archiveMetadata(z,1),/nie odpowiada/);
 z.file('_metadata.json','bad json');await assert.rejects(h.archiveMetadata(z,1),/Niepoprawne/);
 const controller=new AbortController();controller.abort();await assert.rejects(h.archiveMetadata(z,1,controller.signal),{name:'AbortError'});
});

test('year import refreshes old UTC snapshots once and resumes corrected snapshots',()=>{assert.equal(h.isCurrentRange({updated_at:'2026-10-02T18:13:59Z'}),false);assert.equal(h.isCurrentRange({updated_at:'2026-10-02T18:43:12.475Z'}),true);assert.equal(h.isCurrentRange({}),false);});
