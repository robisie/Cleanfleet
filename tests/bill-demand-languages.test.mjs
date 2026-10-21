import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../bill/core.js';
import {demandHtml,languageSelect} from '../bill/payment-demand.js';
const row=()=>({number:'A1/10/2026',status:'issued',ksef_number:'6351861297-20261021-abcdefabcdef-aa',payload:{...C.newInvoice('cleanfleet'),issueDate:'2026-10-01',dueDate:'2026-10-10',buyer:{name:'TEST GMBH',address:'Teststr. 1',city:'12345 Berlin',country:'DE',nip:'123456789'},bank:'PL12123456789012345678901234',lines:[{name:'Usługa',qty:'1',price:'1520.00',unit:'usł.'}]}});
globalThis.location={origin:'https://cleanfleet.pl'};
const opts={amount:100000,deadline:'2026-10-30',date:'2026-10-21'};
test('selector offers Polish, German and both languages',()=>{const html=languageSelect();for(const v of ['pl','de','both'])assert.ok(html.includes(`value="${v}"`));assert.ok(html.includes('name="demandLanguage"'));});
test('Polish remains the default and German localizes document text without changing logos or identities',()=>{
 const pl=demandHtml(row(),opts),de=demandHtml(row(),{...opts,language:'de'});
 assert.ok(pl.includes('<html lang="pl">'));assert.ok(pl.includes('Wezwanie do zapłaty'));assert.ok(!pl.includes('Mahnung'));
 assert.ok(de.includes('<html lang="de">'));for(const text of ['Mahnung','Rechnungssteller','Rechnungsempfänger','Zu zahlen','Zahlbar bis','Bankverbindung','21.10.2026','USt-IdNr.'])assert.ok(de.includes(text),text);
 for(const text of ['ROBISIĘ-FER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ','TEST GMBH','alt="CleanFleet"','cleanfleet-logo.png','A1/10/2026',row().payload.bank])assert.ok(de.includes(text),text);
 for(const text of ['Wystawca','Nabywca','Do zapłaty','Termin zapłaty','Wezwanie do zapłaty'])assert.ok(!de.includes(text),text);
});
test('both languages create two separately paginated copies in one valid document',()=>{
 const html=demandHtml(row(),{...opts,language:'both'});assert.equal((html.match(/<html /g)||[]).length,1);assert.equal((html.match(/<section class="page"/g)||[]).length,2);assert.ok(html.indexOf('lang="pl"><header')<html.indexOf('lang="de"><header'));assert.ok(html.includes('.page+.page{break-before:page}'));assert.equal((html.match(/alt="CleanFleet"/g)||[]).length,2);
});
test('German wording distinguishes future payments from overdue invoices and rejects unknown languages',()=>{
 const r=row();r.payload.dueDate='2026-10-30';const html=demandHtml(r,{...opts,language:'de'});assert.ok(html.includes('Zahlungsaufforderung'));assert.ok(html.includes('am 30.10.2026 fällig'));assert.ok(!html.includes('abgelaufen'));assert.throws(()=>demandHtml(r,{...opts,language:'en'}),/język/);
});
