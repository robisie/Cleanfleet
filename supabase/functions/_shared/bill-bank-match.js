// Conservative matching: a company credit must name exactly one complete invoice number.
// Amount alone and personal-account statements are never payment evidence.
const token=s=>String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function matchBankCredits(invoices,incomes){
 const eligible=invoices.filter(r=>r.number&&r.status!=='draft'&&!r.payload?.correction&&Number.isSafeInteger(r.totalCents)&&r.totalCents>0);
 const patterns=eligible.map(r=>[r,new RegExp('(^|[^\\p{L}\\p{N}])'+token(r.number)+'(?=$|[^\\p{L}\\p{N}])','iu')]);
 const groups=new Map();
 for(const t of incomes){
  if(t.excluded||!Number.isSafeInteger(t.amount)||t.amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(t.date||''))continue;
  const matches=patterns.filter(([r,pattern])=>r.payload.currency===t.currency&&pattern.test(String(t.title||'')));
  if(matches.length!==1)continue;
  const row=matches[0][0],list=groups.get(row.id)||[];
  list.push(bankPayment(t));
  groups.set(row.id,list);
 }
 const result=new Map();
 for(const [id,payments] of groups){
  const row=eligible.find(r=>r.id===id),amount=payments.reduce((n,p)=>n+p.amountCents,0);
  if(amount>row.totalCents)continue; // Overpayment or mixed transfers require human review.
  result.set(id,{amountCents:amount,payments:payments.sort((a,b)=>a.date.localeCompare(b.date))});
 }
 return result;
}

const eligibleInvoice=r=>r.number&&r.status!=='draft'&&!r.payload?.correction&&Number.isSafeInteger(r.totalCents)&&r.totalCents>0;
const validCredit=t=>!t.excluded&&Number.isSafeInteger(t.amount)&&t.amount>0&&/^\d{4}-\d{2}-\d{2}$/.test(t.date||'');
function bankPayment(t){return {date:t.date,amountCents:t.amount,statement:String(t.sourceName||'').slice(0,160),...(t.id?{incomeId:String(t.id),sender:String(t.recipient||'').slice(0,600),title:String(t.title||'').slice(0,1200)}:{})};}
const words=value=>[...new Set(String(value||'').toLowerCase().replaceAll('ł','l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z]{3,}/g)||[])].filter(w=>!['spolka','ograniczona','odpowiedzialnoscia','societe','gmbh','limited','ltd','firma','company','polska','poland','ulica','przedsiebiorstwo'].includes(w));
export function payerSimilarity(buyer,payer){
 const names=words(buyer?.name),person=new Set(words(payer)),common=names.filter(w=>person.has(w));
 if(common.length>=2 || names.length===1&&common.length===1&&common[0].length>=5)return 'Zgodne dane płatnika: '+common.join(', ');
 return '';
}
export function bankProposals(invoices,incomes,links=[]){
 const eligible=invoices.filter(eligibleInvoice),linkedIds=new Set(links.map(l=>l.income_id));
 const available=incomes.filter(t=>!linkedIds.has(t.id));
 const automatic=matchBankCredits(eligible,available),matches=new Map(automatic);
 // Confirmed choices remain tied to the original bank operation, not its position.
 for(const link of links){
  const invoice=eligible.find(r=>r.id===link.invoice_id),income=incomes.find(t=>t.id===link.income_id);
  if(!invoice||!income||!validCredit(income)||income.currency!==invoice.payload.currency||income.amount!==invoice.totalCents)continue;
  matches.set(invoice.id,{amountCents:income.amount,payments:[{...bankPayment(income),confirmed:true}]});
 }
 const consumed=new Set([...matches.values()].flatMap(m=>m.payments.map(p=>p.incomeId)).filter(Boolean));
 const candidates=new Map();
 for(const t of incomes){
  if(!t.id||!validCredit(t)||linkedIds.has(t.id)||consumed.has(t.id))continue;
  // A reference to another invoice must never become a payer-name suggestion.
  if(eligible.some(r=>new RegExp('(^|[^\\p{L}\\p{N}])'+token(r.number)+'(?=$|[^\\p{L}\\p{N}])','iu').test(String(t.title||''))))continue;
  const options=eligible.filter(r=>!matches.has(r.id)&&r.payload.currency===t.currency&&r.totalCents===t.amount)
   .map(r=>({invoice:r,reason:payerSimilarity(r.payload.buyer,t.recipient)})).filter(x=>x.reason);
  for(const option of options){const list=candidates.get(option.invoice.id)||[];list.push({...bankPayment(t),reason:'Zgodna kwota i waluta · '+option.reason,otherInvoices:options.length-1});candidates.set(option.invoice.id,list);}
 }
 for(const list of candidates.values())list.sort((a,b)=>b.date.localeCompare(a.date)||a.incomeId.localeCompare(b.incomeId));
 return {matches,candidates};
}

export async function reconcileBillPayments(db,ownerId,state,Payments,invoiceAmount){
 const rows=await db.from('bill_invoices').select('id,number,status,payload').eq('creator_id',ownerId).neq('status','draft').limit(1000);
 if(rows.error)throw rows.error;
 const marks=await db.from('bill_payment_evidence').select('invoice_id,bank_cents,bank_payments,bank_candidates').in('invoice_id',(rows.data||[]).map(r=>r.id).length?(rows.data||[]).map(r=>r.id):['00000000-0000-0000-0000-000000000000']);
 if(marks.error)throw marks.error;
 const links=await db.from('bill_bank_payment_links').select('invoice_id,income_id').eq('owner_id',ownerId);
 if(links.error)throw links.error;
 const incomes=Payments.businessIncomeState(state).incomes;
 const {matches:matched,candidates}=bankProposals((rows.data||[]).map(r=>({...r,totalCents:invoiceAmount(r.payload)})),incomes,links.data||[]);
 const old=new Map((marks.data||[]).map(r=>[r.invoice_id,r]));
 for(const row of rows.data||[]){
  const match=matched.get(row.id),prior=old.get(row.id),bank_cents=match?.amountCents??null,bank_payments=match?.payments||[],bank_candidates=candidates.get(row.id)||[];
  if((prior?.bank_cents==null?null:Number(prior.bank_cents))===bank_cents&&JSON.stringify(prior?.bank_payments||[])===JSON.stringify(bank_payments)&&JSON.stringify(prior?.bank_candidates||[])===JSON.stringify(bank_candidates))continue;
  const fields={bank_cents,bank_payments,bank_candidates,bank_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  if(prior){const result=await db.from('bill_payment_evidence').update(fields).eq('invoice_id',row.id);if(result.error)throw result.error;}
  else if(match||bank_candidates.length){
   const result=await db.from('bill_payment_evidence').insert({invoice_id:row.id,...fields});
   if(result.error?.code==='23505'){
    const retry=await db.from('bill_payment_evidence').update(fields).eq('invoice_id',row.id);
    if(retry.error)throw retry.error;
   }else if(result.error)throw result.error;
  }
 }
}
