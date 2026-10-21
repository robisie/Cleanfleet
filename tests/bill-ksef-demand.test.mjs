import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceFromDocument,invoiceFromXml,availableBalance} from '../bill/ksef-demand.js';
import {demandHtml} from '../bill/payment-demand.js';
const n=(name,...parts)=>({localName:name.split(':').pop(),children:parts.filter(x=>typeof x==='object'),textContent:parts.map(x=>typeof x==='object'?x.textContent:x).join('')});
const meta={invoiceNumber:'FV/1',issueDate:'2026-10-21',currency:'EUR',grossAmount:123,ksefNumber:'6351861297-20261021-abcdefabcdef-aa'};
function fixture({seller='6351861297',payment=[],settlement=[],terms=[n('TerminPlatnosci',n('Termin','2026-11-01'))],kind='VAT',prefix='tns:'}={}){
 const root=n(prefix+'Faktura',n('Podmiot1',n('DaneIdentyfikacyjne',n('NIP',seller),n('Nazwa','Robisię-Fer'))),n('Podmiot2',n('DaneIdentyfikacyjne',n('Nazwa','<Test GmbH>'),n('KodUE','DE'),n('NrVatUE','123456789')),n('Adres',n('KodKraju','DE'),n('AdresL1','Teststr. 1'),n('AdresL2','12345 Berlin'))),n('Podmiot3',n('Rola','2'),n('DaneIdentyfikacyjne',n('Nazwa','Odbiorca'))),n('Fa',n('P_1','2026-10-21'),n('P_2','FV/1'),n('P_15','123.00'),n('RodzajFaktury',kind),n('KodWaluty','EUR'),n('Rozliczenie',...settlement),n('Platnosc',...terms,n('RachunekBankowy',n('NrRB','PL12123456789012345678901234')),...payment)));
 return {documentElement:root,doctype:null,getElementsByTagName:()=>[]};
}
test('KSeF invoice maps verified sales identity, foreign buyer, recipient, amount, bank and due date',()=>{
 const row=invoiceFromDocument(fixture(),meta);assert.equal(row.number,'FV/1');assert.equal(row.unpaid,12300);assert.equal(row.payload.currency,'EUR');assert.equal(row.payload.dueDate,'2026-11-01');assert.equal(row.payload.buyer.nip,'123456789');assert.equal(row.payload.buyer.country,'DE');assert.equal(row.payload.recipient.name,'Odbiorca');assert.equal(row.payload.bank,'PL12123456789012345678901234');
 globalThis.location={origin:'https://cleanfleet.pl'};const html=demandHtml(row,{amount:12300,deadline:'2026-11-01',date:'2026-10-21'});assert.ok(html.includes('&lt;Test GmbH&gt;'));assert.ok(html.includes('VAT UE: 123456789'));assert.ok(html.includes('class="payment"'));
});
test('purchase invoice, metadata mismatch, negative corrections and XML entities cannot become demands',()=>{
 assert.throws(()=>invoiceFromDocument(fixture({seller:'1111111111'}),meta),/sprzedażowej/);
 for(const changed of [{invoiceNumber:'other'},{currency:'PLN'},{issueDate:'2026-10-20'},{grossAmount:124}])assert.throws(()=>invoiceFromDocument(fixture(),{...meta,...changed}),/nie zgadzają/);
 assert.throws(()=>invoiceFromDocument(fixture({kind:'KOR'}),meta),/korekty/);assert.throws(()=>invoiceFromXml('<!DOCTYPE Faktura><Faktura/>',meta),/XML/);
 assert.throws(()=>invoiceFromDocument({...fixture(),doctype:{}},meta),/XML/);
});
test('absent or multiple payment terms require a user choice instead of a guessed date',()=>{
 assert.equal(invoiceFromDocument(fixture({terms:[]}),meta).payload.dueDate,'');
 assert.equal(invoiceFromDocument(fixture({terms:[n('TerminPlatnosci',n('Termin','2026-11-01')),n('TerminPlatnosci',n('Termin','2026-12-01'))]}),meta).payload.dueDate,'');
 assert.equal(invoiceFromDocument(fixture({terms:[n('TerminPlatnosci',n('Termin','2026-99-01'))]}),meta).payload.dueDate,'');
});
test('XML full payment markers and overpayment block demands; partial payments reduce suggested balance',()=>{
 for(const p of [n('Zaplacono','1'),n('ZnacznikZaplatyCzesciowej','2')])assert.throws(()=>invoiceFromDocument(fixture({payment:[p]}),meta),/opłacona/);
 assert.throws(()=>invoiceFromDocument(fixture({settlement:[n('DoRozliczenia','20')]}),meta),/zwrotu/);
 const row=invoiceFromDocument(fixture({payment:[n('ZnacznikZaplatyCzesciowej','1'),n('ZaplataCzesciowa',n('KwotaZaplatyCzesciowej','23'))]}),meta);assert.equal(row.unpaid,10000);
 row.id='linked';assert.equal(availableBalance(row,{invoiceSettlements:[{id:'linked',allocations:[{paid:50}],existingReceipts:[{amount:10}]}]}),6300);
 assert.equal(availableBalance(row,{invoiceSettlements:[{id:'linked',allocations:[{paid:123}]}]}),0);
});
test('amount due follows explicit invoice settlement instead of net totals or arbitrary item prices',()=>{
 const row=invoiceFromDocument(fixture({settlement:[n('DoZaplaty','130')]}),meta);assert.equal(row.unpaid,13000);assert.equal(row.payload.lines[0].price,'130.00');
});
