import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../bill/core.js';
import {previousMonth,calculateCompensation,nbpRate,compensationControls} from '../bill/compensation.js';
import {demandHtml} from '../bill/payment-demand.js';
const row=(currency='PLN',price='5000.00')=>({number:'A1/10/2026',status:'issued',payload:{...C.newInvoice('cleanfleet'),issueDate:'2026-10-01',dueDate:'2026-10-10',buyer:{kind:'company',name:'Test',country:'DE',nip:'123'},currency,lines:[{name:'Usługa',qty:'1',price,unit:'szt.'}]}});
const rate={code:'EUR',table:'A',mid:4.3672,effectiveDate:'2026-09-30',no:'TEST/A/NBP/2026'},today='2026-10-21';
const request=band=>({law:'pl',confirmed:true,band,rate});
test('recovery fees use integer cent rounding and three explicitly confirmed Polish bands',()=>{
 assert.equal(calculateCompensation(row(),request('low'),today).cents,17469);assert.equal(calculateCompensation(row(),request('medium'),today).cents,30570);assert.equal(calculateCompensation(row(),request('high'),today).cents,43672);
 for(const [price,expected] of [['5000','low'],['5000.01','medium'],['49999.99','medium'],['50000','high']])assert.ok(compensationControls(row('PLN',price)).includes(`value="${expected}" selected`));
 assert.ok(!/value="(low|medium|high)" selected/.test(compensationControls(row('EUR'))));
});
test('fees are blocked before/on due date, for consumers, without confirmation and with a wrong-month rate',()=>{
 for(const day of ['2026-10-09','2026-10-10'])assert.throws(()=>calculateCompensation(row(),request('low'),day),/po terminie/);
 const person=row();person.payload.buyer.kind='person';assert.throws(()=>calculateCompensation(person,request('low'),today),/firmowego/);
 assert.throws(()=>calculateCompensation(row(),{...request('low'),confirmed:false},today),/Potwierdź/);
 for(const r of [{...rate,effectiveDate:'2026-10-01'},{...rate,mid:0},{...rate,table:'C'}])assert.throws(()=>calculateCompensation(row(),{...request('low'),rate:r},today),/kursu/);
 assert.throws(()=>calculateCompensation(row(),request(''),today),/Wybierz wartość/);assert.equal(calculateCompensation(row(),null,today),null);
});
test('NBP selection handles year rollover, weekends and unordered rates using the last published rate of the required month',async()=>{
 assert.deepEqual(previousMonth('2026-01-02'),{from:'2025-12-01',to:'2025-12-31'});assert.deepEqual(previousMonth('2024-03-05'),{from:'2024-02-01',to:'2024-02-29'});assert.throws(()=>previousMonth('2026-02-31'));
 let url;const got=await nbpRate('2026-06-10',async u=>{url=u;return {ok:true,json:async()=>({code:'EUR',table:'A',rates:[{mid:4.2,effectiveDate:'2026-05-29',no:'LAST'},{mid:4.3,effectiveDate:'2026-05-28',no:'OLDER'}]})};});assert.equal(got.no,'LAST');assert.ok(url.includes('/2026-05-01/2026-05-31/'));
 await assert.rejects(nbpRate('2026-06-10',async()=>({ok:false})),/NBP/);
});
test('German fee remains 40 EUR regardless of language or invoice currency',()=>{
 const r=row();assert.deepEqual(calculateCompensation(r,{law:'de',confirmed:true},today),{law:'de',currency:'EUR',cents:4000,euro:40});
 globalThis.location={origin:'https://cleanfleet.pl'};const html=demandHtml(r,{amount:100000,deadline:'2026-10-30',date:today,language:'both',compensation:{law:'de',confirmed:true}}).replace(/\s/g,' ');
 assert.ok(html.includes('§ 288'));assert.ok(html.includes('Rekompensata'));assert.ok(html.includes('Beitreibungskostenpauschale'));assert.ok(html.includes('1000,00 zł + 40,00'));assert.ok(!html.includes('1040,00 zł'));
});
test('same-currency totals add the fee while mixed currencies stay separate and show NBP provenance',()=>{
 globalThis.location={origin:'https://cleanfleet.pl'};const options={amount:100000,deadline:'2026-10-30',date:today,compensation:request('low')};
 const pl=demandHtml(row(),options).replace(/\s/g,' ');assert.ok(pl.includes('1174,69 zł'));assert.ok(pl.includes('NBP TEST/A/NBP/2026'));assert.ok(pl.includes('4.3672 PLN'));assert.ok(pl.includes('art. 10'));
 const eur=demandHtml(row('EUR'),options).replace(/\s/g,' ');assert.ok(eur.includes('174,69 zł'));assert.ok(eur.includes('€ + 174,69'));assert.ok(!eur.includes('1174,69'));
});

test('form blocks consumer/future fees and requires confirmation; changing a band during rate loading cannot generate a stale fee',async()=>{
 const {mountCompensation}=await import('../bill/compensation.js');
 const law={value:'none',options:[{value:'none'},{value:'pl'},{value:'de'}]},band={value:'low'},confirm={checked:false},fields={},status={},retry={};
 const nodes={'[data-comp-law]':law,'[data-comp-band]':band,'[data-comp-confirm]':confirm,'[data-comp-status]':status,'[data-comp-retry]':retry,'[data-comp-fields]':fields,'[data-comp-band-wrap]':{}};
 const root={querySelector:()=>({querySelector:key=>nodes[key]})};let current=row();current.payload.dueDate='2999-01-01';
 const form=mountCompensation(root,()=>current);assert.equal(law.options[1].disabled,true);assert.equal(await form.read(),null);
 current=row();law.value='de';await assert.rejects(form.read(),/Potwierdź/);confirm.checked=true;assert.equal((await form.read()).law,'de');
 const oldFetch=globalThis.fetch;let finish;
 globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
 try{law.value='pl';const pending=form.read();band.value='high';finish({ok:true,json:async()=>({code:'EUR',table:'A',rates:[rate]})});await assert.rejects(pending,/zmienił/);}finally{globalThis.fetch=oldFetch;}
});
