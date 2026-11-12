import test from 'node:test';import assert from 'node:assert/strict';
import {validNip,period,paymentCandidate,eligibleCandidates,paymentPatch} from '../supabase/functions/cleanfleet-reminder-ksef/core.js';
const metadata={ksefNumber:'6351861297-20261101-123456789ABC-12',invoiceNumber:'FV/11/1',issueDate:'2026-11-01',seller:{nip:'6351861297'},grossAmount:100,currency:'PLN'};
const parsed=()=>({Faktura:{Podmiot1:{DaneIdentyfikacyjne:{NIP:'6351861297',Nazwa:'Dostawca'}},Podmiot2:{DaneIdentyfikacyjne:{NIP:'5260250274'}},Fa:{P_2:'FV/11/1',P_1:'2026-11-01',P_15:'100.00',KodWaluty:'PLN',RodzajFaktury:'VAT',Platnosc:{TerminPlatnosci:{Termin:'2026-11-15'}}}}});
const reminder={id:'r',ksef_seller_nip:'6351861297',ksef_anchor_due_at:'2026-11-20T08:00:00Z',due_at:'2026-11-20T08:00:00Z',start_at:'2026-11-20T08:00:00Z',end_at:'2026-11-20T09:00:00Z',reminder_mode:'day_2'};
test('KSeF identification and structured payment preserve amounts without PDF extraction',()=>{
 assert.equal(validNip('PL 635-186-12-97'),'6351861297');assert.equal(validNip('1234567890'),'');
 assert.deepEqual(period(reminder),{month:'2026-11',from:'2026-09-01',to:'2026-11-30'});
 const p=parsed();p.Faktura.Fa.Platnosc.ZaplataCzesciowa={KwotaZaplatyCzesciowej:'25.50'};
 const c=paymentCandidate(p,metadata,'5260250274');assert.equal(c.amount,74.5);assert.equal(c.due_date,'2026-11-15');assert.equal(c.warnings.length,0);
 assert.equal(eligibleCandidates(reminder,[c]).length,1);
 assert.equal(eligibleCandidates({...reminder,ksef_match_text:'niepasująca umowa'},[c]).length,0);
 assert.equal(eligibleCandidates({...reminder,ksef_seller_nip:'1111111111'},[c]).length,0);
 assert.throws(()=>paymentCandidate(p,metadata,'inny nabywca'),/nabywcą/);
});
test('missing terms, installments and duplicate references require review; paid invoices and corrections are excluded',()=>{
 const p=parsed();delete p.Faktura.Fa.Platnosc.TerminPlatnosci;
 const missing=paymentCandidate(p,metadata,'5260250274');assert.equal(missing.due_date,null);assert.ok(missing.warnings.length);
 assert.throws(()=>paymentPatch(reminder,missing),/termin/);
 assert.equal(paymentPatch(reminder,missing,'2026-11-21').due_at,'2026-11-21T08:00:00.000Z');
 const duplicates=eligibleCandidates(reminder,[missing],[{id:'other',invoice_number:'FV/11/1'}]);assert.match(duplicates[0].warnings.at(-1),/innym przypomnieniu/);
 p.Faktura.Fa.Platnosc.Zaplacono='1';assert.equal(paymentCandidate(p,metadata,'5260250274'),null);
 delete p.Faktura.Fa.Platnosc.Zaplacono;p.Faktura.Fa.RodzajFaktury='KOR';assert.equal(paymentCandidate(p,metadata,'5260250274'),null);
});
test('applying invoice preserves reminder duration and Warsaw local time across DST',()=>{
 const c=paymentCandidate(parsed(),metadata,'5260250274'),patch=paymentPatch(reminder,c);
 assert.equal(patch.amount,100);assert.equal(patch.payee,'Dostawca');assert.equal(patch.due_at,'2026-11-15T08:00:00.000Z');assert.equal(patch.remind_at,'2026-11-13T08:00:00.000Z');assert.equal(patch.end_at,'2026-11-15T09:00:00.000Z');
 const dst=paymentPatch({...reminder,due_at:'2026-10-20T07:00:00Z',start_at:'2026-10-20T07:00:00Z',end_at:'2026-10-20T08:00:00Z'}, {...c,due_date:'2026-10-25'});
 assert.equal(dst.due_at,'2026-10-25T08:00:00.000Z');assert.equal(dst.remind_at,'2026-10-23T07:00:00.000Z');
 assert.equal('mail_invoice_enabled' in patch,false);
});
