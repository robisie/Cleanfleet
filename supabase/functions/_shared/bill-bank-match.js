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
  list.push({date:t.date,amountCents:t.amount,statement:String(t.sourceName||'').slice(0,160)});
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

export async function reconcileBillPayments(db,ownerId,state,Payments,invoiceAmount){
 const rows=await db.from('bill_invoices').select('id,number,status,payload').eq('creator_id',ownerId).neq('status','draft').limit(1000);
 if(rows.error)throw rows.error;
 const marks=await db.from('bill_payment_evidence').select('invoice_id,bank_cents,bank_payments').in('invoice_id',(rows.data||[]).map(r=>r.id).length?(rows.data||[]).map(r=>r.id):['00000000-0000-0000-0000-000000000000']);
 if(marks.error)throw marks.error;
 const incomes=Payments.businessIncomeState(state).incomes;
 const matched=matchBankCredits((rows.data||[]).map(r=>({...r,totalCents:invoiceAmount(r.payload)})),incomes);
 const old=new Map((marks.data||[]).map(r=>[r.invoice_id,r]));
 for(const row of rows.data||[]){
  const match=matched.get(row.id),prior=old.get(row.id),bank_cents=match?.amountCents??null,bank_payments=match?.payments||[];
  if((prior?.bank_cents==null?null:Number(prior.bank_cents))===bank_cents&&JSON.stringify(prior?.bank_payments||[])===JSON.stringify(bank_payments))continue;
  if(prior){const result=await db.from('bill_payment_evidence').update({bank_cents,bank_payments,bank_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('invoice_id',row.id);if(result.error)throw result.error;}
  else if(match){
   const fields={bank_cents,bank_payments,bank_checked_at:new Date().toISOString()};
   const result=await db.from('bill_payment_evidence').insert({invoice_id:row.id,...fields});
   if(result.error?.code==='23505'){
    const retry=await db.from('bill_payment_evidence').update(fields).eq('invoice_id',row.id);
    if(retry.error)throw retry.error;
   }else if(result.error)throw result.error;
  }
 }
}
