import test from 'node:test';
import assert from 'node:assert/strict';
import {invoicePdfName} from '../bill/ksef-data.js';
const row={seller:{name:'Leroy-Merlin'},buyer:{name:'Żółta Łódź'},issueDate:'2026-10-26',invoiceNumber:'FV/123/2026'};
test('PDF names identify supplier, issue date and invoice; sales identify buyer',()=>{
 assert.equal(invoicePdfName(row),'Leroy-Merlin - 2026-10-26 - FV-123-2026.pdf');
 assert.equal(invoicePdfName(row,'sales'),'Żółta Łódź - 2026-10-26 - FV-123-2026.pdf');
});
test('PDF names cannot contain folders or forbidden filename characters',()=>{
 const filename=invoicePdfName({...row,seller:{name:'../Sklep\\<A>:"B"|?*\u0000'},invoiceNumber:'../FV/1'});
 assert.doesNotMatch(filename,/[<>:"/\\|?*\u0000-\u001f]/);assert(!filename.startsWith('.'));
});
test('equal names stay distinct across case and unicode normalization',()=>{
 const used=new Set();
 assert.equal(invoicePdfName(row,'purchases',used),'Leroy-Merlin - 2026-10-26 - FV-123-2026.pdf');
 assert.equal(invoicePdfName({...row,seller:{name:'LEROY-MERLIN'}},'purchases',used),'LEROY-MERLIN - 2026-10-26 - FV-123-2026 (2).pdf');
 const unicode=new Set();invoicePdfName({...row,seller:{name:'Łódź'}},'purchases',unicode);
 assert.match(invoicePdfName({...row,seller:{name:'Ło\u0301dz\u0301'}},'purchases',unicode),/\(2\)\.pdf$/);
});
test('long international names fit common filesystem limits; missing data has a fallback',()=>{
 const filename=invoicePdfName({...row,seller:{name:'店😀'.repeat(200)},invoiceNumber:'Ż😀'.repeat(200)});
 assert(new TextEncoder().encode(filename).length<255);assert(!filename.includes('\ufffd'));
 assert.equal(invoicePdfName({ksefNumber:'6351861297-20261026-123456789ABC-01'}),'Sprzedawca bez nazwy - brak-daty - 6351861297-20261026-123456789ABC-01.pdf');
});
