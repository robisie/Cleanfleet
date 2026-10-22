import {documentHtml} from '../bill/pdf.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import vm from 'node:vm';
import * as F from '../supabase/functions/cleanfleet-bill/fleet.js';import * as C from '../bill/core.js';import {buildFleetPdf} from '../bill/fleet-pdf.js';import {createRequire} from 'node:module';const require=createRequire(import.meta.url),{jsPDF}=require('../app/vendor/jspdf-2.5.1.umd.min.js');const {applyPlugin}=require('../app/vendor/jspdf-autotable-3.8.2.min.js');applyPlugin(jsPDF);
const id='10000000-0000-4000-8000-000000000001';
const attachment=()=>({invoice_id:id,company_id:'company',period:'2026-10',snapshot:[{id:'wash1',plate:'TEST001',type:'CIĘŻAROWY',wash_date:'2026-10-10',cost:150.10,currency:'EUR',paid:false,billing_category:'ciezarowe'},{id:'wash2',plate:'TEST002',type:'BUS',wash_date:'2026-10-11',cost:50.20,currency:'EUR',paid:false,billing_category:'busy'}],options:{columns:['typ','tablica','data','kwota','rozliczone'],summary:['heavy','bus'],service:true}});
const payload=()=>({...C.newInvoice(),buyer:{kind:'company',name:'TEST FIRMA',nip:'5260250995',address:'Testowa 1',city:'00-001 Warszawa',country:'PL'},currency:'EUR',payment:'cash',lines:[{name:'Czyszczenie wnętrz pojazdów',unit:'szt.',qty:'1',price:'200.30'}]});
test('fleet buyer respects Polish and German billing company identity and address',()=>{
 const pl=F.fleetParty({name:'Firma',nip:'526-025-09-95',address:'Testowa 1, 00-001 Warszawa'});assert.equal(pl.city,'00-001 Warszawa');assert.equal(pl.nip,'5260250995');
 const de=F.fleetParty({}, {name:'German GmbH',tax_id:'DE338759809',address:'Teststr. 2, 03130 Spremberg, Niemcy'});assert.equal(de.country,'DE');assert.equal(de.address,'Teststr. 2');assert.equal(de.city,'03130 Spremberg');
});
test('fleet amount cannot diverge from frozen vehicles; source survives normalization but stays out of XML',()=>{
 const a=attachment(),p=F.guardFleetPayload(payload(),a);assert.equal(p.source.fleetId,id);assert.equal(C.normalize(p).source.fleetId,id);assert.equal(C.total(p),20030);
 const xml=C.invoiceXml({number:'A9/10/2026',payload:p});assert.equal((xml.match(/<FaWiersz>/g)||[]).length,1);assert.ok(!xml.includes('TEST001'));assert.ok(!xml.includes('fleetId'));assert.ok(!xml.includes('Zalacznik'));
 for(const changed of [{...p,currency:'PLN'},{...p,lines:[{...p.lines[0],price:'200.31'}]},{...p,lines:[{...p.lines[0],qty:'2'}]},{...p,lines:[...p.lines,...p.lines]}])assert.throws(()=>F.guardFleetPayload(changed,a),/Kwota/);
 assert.equal(F.fleetOptions({columns:['tablica']}).includeUnassigned,false);assert.equal(F.fleetOptions({columns:['tablica'],includeUnassigned:true}).includeUnassigned,true);assert.equal(F.guardFleetPayload(p,null),p);assert.equal(F.fleetOptions({}).layout,'vehicle-lines');
});
test('attachment view exposes only PDF fields and multipage PDF retains Polish glyphs, totals and rows',async()=>{
 const a=attachment(),view=F.fleetView(a,{id,number:'A9/10/2026',status:'issued',payload:payload()});assert.equal(view.rows[0].cost,150.1);assert.equal(view.rows[0].paid,false);assert.equal(view.rows[0].performed_by,undefined);
 const context=vm.createContext({window:{}});vm.runInContext(await readFile(new URL('../app/reports-font.js',import.meta.url),'utf8'),context);
 view.rows=Array.from({length:65},(_,i)=>({...view.rows[i%2],plate:'TEST'+String(i+1).padStart(3,'0')}));view.buyer.name='Firma próbna - Żółć Łódź';
 const logo='data:image/png;base64,'+(await readFile(new URL('../assets/cleanfleet-logo.png',import.meta.url))).toString('base64');
 const blob=buildFleetPdf(view,jsPDF,context.window.CFReportFont,logo),bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'%PDF');assert.ok(bytes.length>50000);
 if(process.env.BILL_PDF_QA){await mkdir('/tmp/bill-fleet-qa',{recursive:true});await writeFile('/tmp/bill-fleet-qa/attachment.pdf',bytes);}
});
test('CleanFleet selection opens Bill with one server-checked sum and retains selection after errors',async()=>{
 const html=await readFile(new URL('../app/index.html',import.meta.url),'utf8');const start=html.indexOf('  async function generateMonthPdf(){'),end=html.indexOf('  function showPdfPreview(',start),code=html.slice(start,end);const nodes={pdfMonthPicker:{value:'2026-10'},pdfInvoiceNumber:{value:''},pdfBillingCompany:{value:'billing'},pdfNoSummary:{checked:false},pdfIncludeServiceDescription:{checked:true},pdfGenerateSelectedBtn:{disabled:false},pdfVehicleSelectionOverlay:{style:{}}};let request,fail=false;const messages=[],routed=[];
 const records=[{id:'one',zatwierdzone:true,data_prania:'2026-10-02',kto_wykonal:'Michał',koszt:150.10,currency:'EUR',billing_company_id:'billing'},{id:'two',zatwierdzone:true,data_prania:'2026-10-03',kto_wykonal:'Michał',koszt:50.20,currency:'EUR',billing_company_id:'billing'},{id:'employee',zatwierdzone:true,data_prania:'2026-10-02',kto_wykonal:'Inny',koszt:100,currency:'EUR',billing_company_id:'billing'}];nodes.cfFleetDescription={value:'Czyszczenie wnętrz'};
 const context=vm.createContext({URL,window:{frameElement:{id:'pack-frame-app-cleanfleet'},parent:{postMessage:(data,origin)=>routed.push({data,origin})}},document:{getElementById:id=>nodes[id],querySelectorAll:selector=>selector==='.pdf-col-check:checked'?[{value:'tablica'},{value:'kwota'}]:selector==='.pdf-type-check:checked'?[{value:'heavy'}]:[{value:'heavy'}]},cfFleetBillMode:true,cfFleetDraftId:'draft',cfActiveCompanyId:'company',cfBillingCompanies:[{}],cfPdfSelectionConfirmed:true,cfPdfSelectedRowIds:new Set(['one','two']),records,invoices:[],invoiceItems:[],PDF_COLUMNS:[],cfLoadInvoices:async()=>{},cfNormalizePerformerName:s=>s.toLowerCase(),pdfBillingCategoryKey:()=> 'heavy',cfRecordCurrency:r=>r.currency,cfBillingCompanyById:()=>({currency:'EUR'}),cfNormalizeCurrency:s=>s,cfBillRequest:async r=>{request=r;if(fail)throw Error('Dane zmieniły się');return {id:'saved'};},location:{href:'https://cleanfleet.pl/app/',origin:'https://cleanfleet.pl'},showToast:m=>messages.push(m)});
 const helper=html.slice(html.indexOf('  function cfOpenBill('),html.indexOf('  async function cfBillRequest('));vm.runInContext(helper+code,context);
 let candidates;context.showPdfVehicleSelectionModal=rows=>{candidates=rows;};
 context.cfPdfSelectionConfirmed=false;await context.generateMonthPdf();
 assert.deepEqual([...candidates.map(r=>r.id)],['one','two']);assert.equal(request,undefined);
 context.cfPdfSelectionConfirmed=true;await context.generateMonthPdf();assert.equal(request.expectedCents,20030);assert.deepEqual([...request.recordIds],['one','two']);assert.equal(request.description,'Czyszczenie wnętrz');assert.equal(request.options.service,undefined);assert.equal(request.options.columns,undefined);assert.equal(context.location.href,'https://cleanfleet.pl/app/');assert.equal(routed.at(-1).data.url,'https://cleanfleet.pl/bill/?invoice=saved&edit=1');assert.equal(routed.at(-1).data.type,'robisie-pack-open-url');assert.equal(routed.at(-1).origin,'https://cleanfleet.pl');assert.equal(nodes.pdfGenerateSelectedBtn.disabled,false);
 // Legacy unassigned entries require explicit opt-in, and never pull another payer's rows.
 records[0].billing_company_id=null;records[1].billing_company_id=null;
 records.push({...records[0],id:'other-payer',billing_company_id:'different'});
 records.push({...records[0],id:'other-currency',currency:'PLN'});
 context.cfPdfSelectionConfirmed=false;candidates=null;request=undefined;
 nodes.cfFleetIncludeUnassigned={checked:false};nodes.cfFleetUnassignedHint={textContent:''};
 await context.generateMonthPdf();assert.equal(candidates,null);assert.equal(request,undefined);assert.match(nodes.cfFleetUnassignedHint.textContent,/Znaleziono 2 wpisów bez/);
 nodes.cfFleetIncludeUnassigned.checked=true;await context.generateMonthPdf();assert.deepEqual([...candidates.map(r=>r.id)],['one','two']);
 context.cfPdfSelectionConfirmed=true;await context.generateMonthPdf();assert.equal(request.options.includeUnassigned,true);assert.equal(request.expectedCents,20030);
 fail=true;routed.length=0;await context.generateMonthPdf();assert.equal(routed.length,0);assert.equal(context.location.href,'https://cleanfleet.pl/app/');assert.equal(nodes.pdfVehicleSelectionOverlay.style.display,'');assert.equal(messages.at(-1),'Dane zmieniły się');assert.equal(context.cfFleetDraftId,'draft');
});

test('vehicle-line invoices bind every price and plate, send all vehicles in XML and have no PDF attachment',async()=>{
 const a=attachment();a.options={layout:'vehicle-lines'};const raw={...payload(),lines:a.snapshot.map(r=>({name:'Czyszczenie wnętrz — '+r.plate,unit:'szt.',qty:'1',price:Number(r.cost).toFixed(2)}))};const p=F.guardFleetPayload(raw,a),normalized=C.normalize(p);assert.equal(normalized.source.fleetLayout,'vehicle-lines');assert.equal(C.total(normalized),20030);const row={id,number:'A9/10/2026',status:'issued',payload:normalized};
 const xml=C.invoiceXml(row);assert.equal((xml.match(/<FaWiersz>/g)||[]).length,2);assert.ok(xml.includes('TEST001'));assert.ok(xml.includes('TEST002'));assert.ok(xml.includes('<P_15>200.30</P_15>'));assert.equal(F.fleetView(a,row).noAttachment,true);const discounted=structuredClone(normalized);discounted.lines[0].discount='0.01';assert.throws(()=>F.guardFleetPayload(discounted,a),/rab atów|rabatów/);const previous=globalThis.location;globalThis.location={origin:'https://example.test'};try{const html=await documentHtml(row);assert.ok(html.includes('TEST001'));assert.ok(html.includes('TEST002'));assert.ok(html.includes('150,10'));assert.ok(html.includes('50,20'));assert.ok(html.includes('200,30'));}finally{globalThis.location=previous;}
 for(const mutate of [p=>p.lines.reverse(),p=>{p.lines[0].price='150.20';p.lines[1].price='50.10';},p=>p.lines[0].name='Brak tablicy',p=>p.lines.pop(),p=>p.lines[0].qty='2']){const changed=structuredClone(normalized);mutate(changed);assert.throws(()=>F.guardFleetPayload(changed,a),/Każda pozycja/);}
});

test('Bill navigation uses Pack for both draft creation and existing documents, and supports standalone CleanFleet',async()=>{
 const html=await readFile(new URL('../app/index.html',import.meta.url),'utf8'),helper=html.slice(html.indexOf('  function cfOpenBill('),html.indexOf('  async function cfBillRequest('));
 assert.ok(html.includes("cfOpenBill('/bill/?invoice='+encodeURIComponent(attachment.invoiceId))"));assert.ok(!/location\.href\s*=\s*['"]\/bill\//.test(html));
 const location={href:'https://cleanfleet.pl/app/',origin:'https://cleanfleet.pl'},sent=[],window={frameElement:{id:'pack-frame-app-cleanfleet'},parent:{postMessage:(data,origin)=>sent.push({data,origin})}};
 const context=vm.createContext({window,location,URL});vm.runInContext(helper,context);
 vm.runInContext("cfOpenBill('/bill/?invoice=one%26two&edit=1')",context);assert.equal(sent.length,1);assert.equal(sent[0].data.url,'https://cleanfleet.pl/bill/?invoice=one%26two&edit=1');assert.equal(location.href,'https://cleanfleet.pl/app/');
 vm.runInContext("cfOpenBill('/bill/?invoice=existing')",context);assert.equal(sent.length,2);assert.equal(location.href,'https://cleanfleet.pl/app/');
 assert.throws(()=>vm.runInContext("cfOpenBill('https://evil.invalid/bill/')",context),/adres Bill/);assert.throws(()=>vm.runInContext("cfOpenBill('/app/')",context),/adres Bill/);
 window.parent=window;vm.runInContext("cfOpenBill('/bill/?invoice=standalone')",context);assert.equal(location.href,'https://cleanfleet.pl/bill/?invoice=standalone');assert.equal(sent.length,2);
});
