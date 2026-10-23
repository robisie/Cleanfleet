// Payment evidence lives with the operation that received the money, not in Bill's KSeF status.
export function paymentStatus(invoice,source){
 const total=Math.max(0,Math.round(Number(source?.total ?? 0)*100));
 if(!source||!Number.isFinite(total)||invoice.status==='draft'||invoice.payload?.correction)return {state:'unknown',received:0,remaining:0};
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
