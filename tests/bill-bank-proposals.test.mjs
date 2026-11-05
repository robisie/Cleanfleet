import test from 'node:test';
import assert from 'node:assert/strict';
import {bankProposals,payerSimilarity} from '../supabase/functions/_shared/bill-bank-match.js';
const invoice=(id='one',name='Saturday Travel - Dawid Sobota',amount=176565)=>({id,number:id==='one'?'A1/10/2026':'A2/10/2026',status:'accepted',totalCents:amount,payload:{buyer:{name},currency:'PLN'}});
const income=(extra={})=>({id:'transfer',date:'2026-10-19',amount:176565,currency:'PLN',recipient:'SOBOTA DAWID JÓZEF WILLOWA 10N 32-600 OŚWIĘCIM',title:'Usługi remontowe',sourceName:'mBiznes konto S.pdf',...extra});
test('Saturday Travel gets a proposal with amount, sender and date, without automatically marking payment',()=>{
 const result=bankProposals([invoice()],[income()]);
 assert.equal(result.matches.size,0);
 const [choice]=result.candidates.get('one');
 assert.equal(choice.amountCents,176565);assert.equal(choice.date,'2026-10-19');
 assert.equal(choice.incomeId,'transfer');assert.match(choice.reason,/dawid, sobota/);
});
test('payer comparison handles order, accents and company suffixes but requires meaningful shared data',()=>{
 assert(payerSimilarity({name:'Paweł Łącki spółka z ograniczoną odpowiedzialnością'},'ŁĄCKI PAWEŁ UL DŁUGA'));
 assert(payerSimilarity({name:'Apple'},'APPLE PRZELEW'));
 assert.equal(payerSimilarity({name:'Jan Kowalski'},'Jan Nowak'), '');
 assert.equal(payerSimilarity({name:'Firma Spółka'},'Firma Spółka'), '');
});
test('amount alone, wrong currency, excluded income, drafts and corrections do not produce suggestions',()=>{
 for(const t of [income({amount:176500}),income({currency:'EUR'}),income({excluded:true}),income({recipient:'Inny płatnik'}),income({id:''})])assert.equal(bankProposals([invoice()],[t]).candidates.size,0);
 assert.equal(bankProposals([{...invoice(),status:'draft'}],[income()]).candidates.size,0);
 assert.equal(bankProposals([{...invoice(),payload:{...invoice().payload,correction:{}}}],[income()]).candidates.size,0);
});
test('number matches remain automatic and consume the income, including on another invoice',()=>{
 const result=bankProposals([invoice(),invoice('two')],[income({title:'Faktura A2/10/2026'})]);
 assert.equal(result.matches.get('two').amountCents,176565);assert.equal(result.candidates.size,0);
 assert.equal(bankProposals([invoice(),invoice('two')],[income({title:'A1/10/2026 oraz A2/10/2026'})]).candidates.size,0);
});
test('ambiguous equal invoices remain choices; confirming reserves transfer once; undo restores proposals',()=>{
 const invoices=[invoice(),invoice('two')],transfers=[income()];
 const pending=bankProposals(invoices,transfers);
 assert.equal(pending.candidates.size,2);assert.equal(pending.candidates.get('one')[0].otherInvoices,1);
 const linked=bankProposals(invoices,transfers,[{invoice_id:'one',income_id:'transfer'}]);
 assert.equal(linked.matches.size,1);assert.equal(linked.matches.get('one').payments[0].confirmed,true);
 assert.equal(linked.candidates.size,0);
 assert.equal(bankProposals(invoices,transfers,[]).candidates.size,2);
});
test('confirmed links are revalidated against current bank data and stable across ordering',()=>{
 const link=[{invoice_id:'one',income_id:'transfer'}];
 for(const transfers of [[],[income({excluded:true})],[income({amount:176500})],[income({currency:'EUR'})]])assert.equal(bankProposals([invoice()],transfers,link).matches.size,0);
 const result=bankProposals([invoice()],[income({id:'unrelated',amount:500}),income()],link);
 assert.equal(result.matches.get('one').payments[0].incomeId,'transfer');
});
