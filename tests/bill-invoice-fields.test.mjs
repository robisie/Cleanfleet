import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../bill/core.js';
import {documentHtml} from '../bill/pdf.js';
import {paymentStatus} from '../bill/payment-status.js';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

function invoice(){const p=C.newInvoice('robisie');p.buyer={name:'Firma',nip:'5260250995',address:'Ulica 1',city:'00-001 Warszawa',country:'PL'};p.payment='cash';p.lines=[{name:'Usługa',qty:'2',unit:'szt.',price:'123.00',vatRate:'23'},{name:'Dodatek',qty:'1',unit:'szt.',price:'80.00',vatRate:'8'},{name:'Zwolnione',qty:'1',unit:'szt.',price:'10.00',vatRate:'zw'}];p.globalDiscount='10';p.orderNumber='ZAM-1';p.contractNumber='UM-1';return p;}
const row=p=>({number:'A9/10/2026',status:'issued',payload:p});

test('global discount applies to every gross line, VAT sums and XML order/contract details',()=>{
 const p=C.normalize(invoice());assert.deepEqual(p.lines.map(l=>C.lineTotal(l,p)),[22140,7200,900]);assert.equal(C.total(p),30240);
 const buckets=C.taxBuckets(p);assert.equal(buckets.get('23').net+buckets.get('23').tax,22140);assert.equal(buckets.get('8').net+buckets.get('8').tax,7200);
 const xml=C.invoiceXml(row(p));assert.match(xml,/<P_13_1>180.00<\/P_13_1><P_14_1>41.40<\/P_14_1>/);assert.match(xml,/<P_13_2>66.67<\/P_13_2><P_14_2>5.33<\/P_14_2>/);assert.match(xml,/<P_13_7>9.00<\/P_13_7>/);assert.match(xml,/<P_15>302.40<\/P_15>/);assert.match(xml,/<Klucz>Numer zamówienia<\/Klucz>/);assert.match(xml,/<Wartosc>UM-1<\/Wartosc>/);
});
test('optional partial payment appears in FA(3) and PDF only when entered',async()=>{
 const p=invoice();p.paid={amount:'50.00',method:'transfer',date:p.issueDate};const xml=C.invoiceXml(row(p));assert.match(xml,/<ZnacznikZaplatyCzesciowej>1<\/ZnacznikZaplatyCzesciowej>/);assert.match(xml,/<KwotaZaplatyCzesciowej>50.00<\/KwotaZaplatyCzesciowej>/);
 globalThis.location={origin:'https://cleanfleet.pl'};const pdf=await documentHtml(row(p));assert.match(pdf,/Otrzymano 50,00/);assert.match(pdf,/przelewem/);
 const blank=invoice();assert.doesNotMatch(C.invoiceXml(row(blank)),/ZaplataCzesciowa|Zaplacono/);assert.doesNotMatch(await documentHtml(row(blank)),/Otrzymano 50,00/);
 assert.throws(()=>C.normalize({...p,paid:{amount:'350.00',method:'cash',date:p.issueDate}}),/nie może przekraczać/);
 assert.throws(()=>C.normalize({...p,paid:{amount:'10.00',method:'',date:p.issueDate}}),/wymaga kwoty/);
});
test('advance is paid and final deducts accepted advance by rate without counting deposit twice',()=>{
 const advance=invoice();advance.documentType='advance';advance.advanceAmount='100.00';advance.paid={amount:'100.00',method:'cash',date:advance.issueDate};
 const normalized=C.normalize(advance);const alloc=C.advanceAllocation(normalized);assert.equal(alloc.reduce((n,l)=>n+l.gross,0),10000);assert.match(C.invoiceXml(row(normalized)),/<RodzajFaktury>ZAL<\/RodzajFaktury>/);assert.match(C.invoiceXml(row(normalized)),/<WartoscZamowienia>302.40<\/WartoscZamowienia>/);
 const final={...invoice(),documentType:'final',advances:[{id:'10000000-0000-4000-8000-000000000001',number:'A8/10/2026',ksefNumber:'6351861297-20261016-123456789ABC-AB',amount:'100.00',lines:alloc}]};const p=C.normalize(final),buckets=C.taxBuckets(p);assert.equal(C.invoiceAmount(p),20240);assert.equal([...buckets.values()].reduce((n,b)=>n+b.net+b.tax,0),20240);const xml=C.invoiceXml(row(p));assert.match(xml,/<RodzajFaktury>ROZ<\/RodzajFaktury>/);assert.match(xml,/<P_15>202.40<\/P_15>/);assert.match(xml,/<NrKSeFFaZaliczkowej>6351861297-20261016-123456789ABC-AB<\/NrKSeFFaZaliczkowej>/);
 assert.throws(()=>C.normalize({...final,advances:[{...final.advances[0],amount:'350.00'}]}),/przekraczają/);
});
test('EU reverse charge stays NP and taxable EUR requires a PLN tax conversion',()=>{
 const p=invoice();p.buyer={...p.buyer,country:'DE',nip:'DE123456789'};p.lines=[{name:'Usługa',unit:'szt.',qty:'1',price:'100.00',vatRate:'np II'}];p.currency='EUR';assert.match(C.invoiceXml(row(p)),/<P_12>np II<\/P_12>/);assert.match(C.invoiceXml(row(p)),/<P_18>1<\/P_18>/);
 assert.throws(()=>C.normalize({...p,lines:[{...p.lines[0],vatRate:'23'}]}),/wymaga kursu/);
});
test('tax correction changes rate without changing gross or payment',()=>{
 const before=invoice(),rowOriginal={id:'10000000-0000-4000-8000-000000000001',status:'accepted',number:'A1/10/2026',ksef_number:'6351861297-20261016-123456789ABC-AB',payload:before};
 const after=C.correctionSeed(rowOriginal);after.correction.mode='tax';after.correction.reason='Zmiana stawki VAT';after.lines=after.lines.map(l=>({...l}));after.lines[0].vatRate='8';const p=C.normalize(after);
 assert.equal(C.invoiceAmount(p),0);assert.match(C.invoiceXml({number:'KA2/10/2026',payload:p}),/<P_13_1>-/);assert.match(C.invoiceXml({number:'KA2/10/2026',payload:p}),/<P_13_2>/);
 assert.throws(()=>C.normalize({...after,lines:[{...after.lines[0],price:'1.00'},...after.lines.slice(1)]}),/nie może zmieniać kwot/);
});
test('payment recorded on invoice reduces remaining balance without adding it twice to bank evidence',()=>{
 const p=invoice();p.paid={amount:'50.00',method:'cash',date:p.issueDate};const r=row(p);
 assert.deepEqual(paymentStatus(r,null,{total:302.40}),{state:'partial',received:50,remaining:252.40,evidence:'invoice'});
 assert.deepEqual(paymentStatus(r,null,{total:302.40,bank_cents:5000,bank_payments:[]}),{state:'partial',received:50,remaining:252.40,evidence:'bank',payments:[]});
});
test('server resolves final references from accepted owner records and rejects changed order or buyer',async()=>{
 const p=invoice();p.documentType='advance';p.advanceAmount='100.00';p.paid={amount:'100.00',method:'cash',date:p.issueDate};
 const stored=C.normalize(p),record={id:'10000000-0000-4000-8000-000000000001',creator_id:'owner',status:'accepted',number:'A8/10/2026',ksef_number:'6351861297-20261016-123456789ABC-AB',payload:stored};
 const issued=[];const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/cleanfleet-bill/index.ts',import.meta.url),'utf8'));
 const context=vm.createContext({Deno:{env:{get:()=>''},serve(){}},crypto,Response,Request,console});
 const m=new vm.SourceTextModule(source+'\nexport {canonicalFinal};',{context});
 await m.link(spec=>{const values=spec.includes('npm:')?{createClient:()=>({from:()=>({select(){return this;},eq(){return this;},in(){return this;},limit:async()=>({data:issued}),single:async()=>({data:record})})})}:spec.endsWith('/invoice.js')?C:spec.endsWith('/fleet.js')?{fleetParty(){},fleetOptions(){},guardFleetPayload(){},fleetView(){},fleetPaymentEvidence(){}}:spec.endsWith('/archive.js')?{createArchiveService:()=>()=>{},acceptedBillMetadata(){}}:spec.endsWith('/gus.js')?{gus(){},lookupWithFallback(){}}:spec.endsWith('/registry.js')?{lookupCompany(){}}:spec.endsWith('/billing.js')?{stageInvoiceSeed(){},investmentInvoiceSeed(){}}:spec.endsWith('/vault.js')?{openAccount(){}}:spec.endsWith('/bill-bank-match.js')?{reconcileBillPayments(){}}:spec.endsWith('/core.js')?{createStateCodec:()=>({}),hash(){}}:spec.endsWith('/ksef.js')?{ksefApi:()=>()=>{},authenticate(){},openSession(){},invoiceStatus(){},KsefError:Error}:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 const final={...invoice(),documentType:'final',advances:[{id:record.id,amount:'0.01',ksefNumber:'FAKE',number:'FAKE',lines:[]}],globalDiscount:stored.globalDiscount,buyer:stored.buyer,lines:stored.lines,orderNumber:stored.orderNumber,contractNumber:stored.contractNumber};
 const canonical=await m.namespace.canonicalFinal(final,'owner');assert.equal(canonical.advances[0].amount,'100.00');assert.equal(canonical.advances[0].ksefNumber,record.ksef_number);
 await assert.rejects(m.namespace.canonicalFinal({...final,buyer:{...final.buyer,name:'Inna firma'}},'owner'),/zachować nabywcę/);
 await assert.rejects(m.namespace.canonicalFinal({...final,lines:[{...final.lines[0],price:'0.01'}]},'owner'),/zachować nabywcę/);
 await assert.rejects(m.namespace.canonicalFinal(final,'other'),/przyjęta w KSeF/);
 issued.push({id:'20000000-0000-4000-8000-000000000002',payload:{advances:[{id:record.id}]}});await assert.rejects(m.namespace.canonicalFinal(final,'owner'),/już rozliczona/);
});
