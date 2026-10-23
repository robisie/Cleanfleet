import test from 'node:test';
import assert from 'node:assert/strict';
import {matchBankCredits,reconcileBillPayments} from '../supabase/functions/_shared/bill-bank-match.js';
import {paymentStatus} from '../bill/payment-status.js';

const invoice=(id,number,cents=10000)=>({id,number,status:'accepted',payload:{currency:'PLN',buyer:{name:'Klient'},source:null},totalCents:cents});
const credit=(title,amount,date='2026-10-22')=>({title,amount,date,currency:'PLN',recipient:'Klient',sourceName:'m_2026_10.pdf'});

test('one click marks paid without inventing a date or payment amount; bank evidence replaces the flag',()=>{
 const row=invoice('one','A1/10/2026');
 assert.deepEqual(paymentStatus(row,null,{manual_paid:true,total:100}),{state:'manual_paid',received:null,remaining:null,evidence:'manual'});
 const payments=[{date:'2026-10-22',amountCents:10000}];
 assert.deepEqual(paymentStatus(row,null,{manual_paid:true,total:100,bank_cents:10000,bank_payments:payments}),{state:'paid',received:100,remaining:0,evidence:'bank',payments});
 assert.equal(paymentStatus(row,null,{manual_paid:false,total:100}).state,'unknown');
});

test('bank reconciliation requires exactly one invoice number and never matches by amount alone',()=>{
 const rows=[invoice('a','A1/10/2026'),invoice('b','A2/10/2026')];
 const matches=matchBankCredits(rows,[credit('Faktura A1/10/2026',6000),credit('Reszta za A1/10/2026',4000,'2026-10-23'),credit('Bez numeru',10000),credit('A1/10/2026 oraz A2/10/2026',10000)]);
 assert.equal(matches.get('a').amountCents,10000);assert.equal(matches.get('a').payments.length,2);assert.equal(matches.has('b'),false);
});

test('overpayments, partials, wrong currency and excluded credits are handled conservatively',()=>{
 const row=invoice('a','A1/10/2026');
 assert.equal(matchBankCredits([row],[credit('A1/10/2026',3000)]).get('a').amountCents,3000);
 assert.equal(matchBankCredits([row],[credit('A1/10/2026',11000)]).has('a'),false);
 assert.equal(matchBankCredits([row],[{...credit('A1/10/2026',10000),currency:'EUR'}]).has('a'),false);
 assert.equal(matchBankCredits([row],[{...credit('A1/10/2026',10000),excluded:true}]).has('a'),false);
 assert.equal(matchBankCredits([row],[credit('KA1/10/2026',10000)]).has('a'),false);
});

test('statement reconciliation replaces bank evidence while keeping the manual flag',async()=>{
 const invoiceRow={...invoice('a','A1/10/2026'),creator_id:'owner'},records=new Map([['a',{invoice_id:'a',manual_paid:true,bank_cents:null,bank_payments:[]}]]);
 const db={from:table=>{
  if(table==='bill_invoices')return {select(){return this;},eq(){return this;},neq(){return this;},limit:async()=>({data:[invoiceRow]})};
  return {select(){return this;},in:async()=>({data:[...records.values()]}),update(value){this.value=value;return this;},eq:async function(_,id){records.set(id,{...records.get(id),...this.value});return {error:null};}};
 }};
 const P={businessIncomeState:state=>({incomes:state.incomes})};
 await reconcileBillPayments(db,'owner',{incomes:[credit('Faktura A1/10/2026',10000)]},P,()=>10000);
 assert.equal(records.get('a').manual_paid,true);assert.equal(records.get('a').bank_cents,10000);
 assert.equal(records.get('a').bank_payments[0].date,'2026-10-22');
 await reconcileBillPayments(db,'owner',{incomes:[]},P,()=>10000);
 assert.equal(records.get('a').manual_paid,true);assert.equal(records.get('a').bank_cents,null);
});
