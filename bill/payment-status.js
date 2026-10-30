// Payment evidence lives with the operation that received the money, not in Bill's KSeF status.
export function paymentStatus(invoice,source,mark=null){
 const total=Math.max(0,Math.round(Number(source?.total ?? 0)*100));
 if(invoice.status==='draft'||invoice.payload?.correction)return {state:'unknown',received:0,remaining:0};
 if(source?.kind==='cleanfleet'&&source.paid&&Number.isFinite(total))return {state:'paid',received:total/100,remaining:0};
 const invoiceTotal=source?.total??mark?.total;
 const due=Math.max(0,Math.round(Number(invoiceTotal)*100));
 const bankCents=Number(mark?.bank_cents);
 if(mark?.bank_cents!=null&&Number.isSafeInteger(bankCents)&&Number.isFinite(due)){
  const received=Math.max(0,Math.min(due,bankCents));
  return {state:received>=due?'paid':'partial',received:received/100,remaining:(due-received)/100,evidence:'bank',payments:mark.bank_payments||[]};
 }
 if(mark?.manual_paid)return {state:'manual_paid',received:null,remaining:null,evidence:'manual'};
 if(!source||!Number.isFinite(total))return {state:'unknown',received:0,remaining:0};
 let received=0;
 if(source.kind==='robisie'){
  const record=(source.project?.invoiceSettlements||[]).find(r=>r.id===invoice.id);
  received=(record?.allocations||[]).reduce((sum,item)=>sum+Math.round(Number(item.paid||0)*100),0)
   +(record?.existingReceipts||[]).reduce((sum,item)=>sum+Math.round(Number(item.amount||0)*100),0);
 }else if(source.kind==='cleanfleet')received=source.paid?total:0;
 else return {state:'unknown',received:0,remaining:0};
 received=Math.max(0,Math.min(total,received));
 return {state:total&&received>=total?'paid':received?'partial':'unpaid',received:received/100,remaining:(total-received)/100};
}
