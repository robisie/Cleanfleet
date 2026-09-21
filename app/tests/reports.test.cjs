/* Run: node app/tests/reports.test.cjs
 * Optional private SQL fixture (never commit it): CF_REPORT_FIXTURE=/path/file.json node app/tests/reports.test.cjs
 * Fixture keys: washes, vehicles, companies, invoices, invoice_items, summary{count,sum,avg,unique,done}, types[{type,count,sum}].
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..'),E=require('../reports-engine.js');
for(const file of ['reports-engine.js','reports-ui.js','reports-catalog.js','reports-font.js','sw.js'])new vm.Script(fs.readFileSync(path.join(base,file),'utf8'),{filename:file});
assert.equal(E.catalog.cf_earnings_security,undefined);assert.equal(E.catalog.push_subscriptions,undefined);assert.equal(E.fields('wash_records').vehicle_type.label,'Kartoteka: Typ');assert.equal(E.day('2026-09-20T22:30:00Z','datetime'),'2026-09-21');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');assert.ok(html.includes('id="cfCompanyReportsCard"'));assert.ok(html.includes('id="cfProfilePdf"'));for(const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|type="module"/.test(s[1])&&s[2].trim())new vm.Script(s[2]);
if(process.env.CF_REPORT_FIXTURE){const f=JSON.parse(fs.readFileSync(process.env.CF_REPORT_FIXTURE,'utf8')),data={...f,wash_records:f.washes};const cfg={source:'wash_records',dateField:'wash_date',filters:[],groups:[]};const r=E.report(data,cfg),m=id=>r.metrics.find(x=>x.id===id);for(const [metric,k]of [['count','count'],['sum','sum'],['avg','avg'],['vehicles','unique'],['completed','done']])assert.equal(m(metric).value,f.summary[k]);
for(const field of ['company_id','type','performed_by']){const rr=E.report(data,{...cfg,groups:[{field}]});assert.equal(rr.groups.reduce((s,g)=>s+g.rows.length,0),f.summary.count);assert.equal(E.sum(rr.groups.map(g=>g.metrics.find(m=>m.id==='sum').value||0)),f.summary.sum);for(const g of rr.groups)assert.equal(new Set(g.rows.map(r=>r.id)).size,g.rows.length);}
for(const t of f.types){const rr=E.report(data,{...cfg,filters:[{field:'type',op:'in',values:[t.type]}]});assert.equal(rr.rows.length,t.count);assert.equal(rr.metrics.find(m=>m.id==='sum').value,t.sum);}console.log('PASS: private real-data fixture matches independent SQL totals and groups.');}else console.log('Private real-data reconciliation skipped: set CF_REPORT_FIXTURE.');
console.log('PASS: scripts, integration, catalog safety and Warsaw date conversion.');
