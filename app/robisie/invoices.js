import * as C from './core.js?v=1.0.61';
import {invoiceAmount} from '../../bill/core.js?v=1.0.15';
export const amount=row=>invoiceAmount(row.payload)/100;
export const linkedPaid=record=>C.round((record?.existingReceipts||[]).reduce((s,r)=>s+C.number(r.amount),0));
export const paid=record=>C.round((record?.allocations||[]).reduce((s,a)=>s+C.number(a.paid),0)+linkedPaid(record));
export const assigned=record=>C.round((record?.allocations||[]).reduce((s,a)=>s+C.number(a.amount),0)+linkedPaid(record));
export function withoutInvoice(project,id){
 const p=structuredClone(project);p.invoiceSettlements=(p.invoiceSettlements||[]).filter(r=>r.id!==id);
 for(const item of p.purchases||[]){if(item.invoicePayments){delete item.invoicePayments[id];if(!Object.keys(item.invoicePayments).length)delete item.invoicePayments;}}
 return p;
}
export const purchaseLinks=(project,id)=>(project.invoiceSettlements||[]).filter(r=>(r.allocations||[]).some(a=>a.kind==='purchase'&&a.id===id)||(r.existingReceipts||[]).some(x=>x.id==='purchase-payment:'+id));
// Release a cost allocation without erasing money already received from the investor.
export function detachPurchase(project,id){
 const p=structuredClone(project),item=p.purchases?.find(x=>x.id===id);
 if(!item)throw Error('Nie znaleziono zakupu.');
 const allocations=(p.invoiceSettlements||[]).flatMap(r=>(r.allocations||[]).filter(a=>a.kind==='purchase'&&a.id===id));
 if(C.round(allocations.reduce((s,a)=>s+C.number(a.paid),0))!==C.invoicePurchasePaid(item))throw Error('Wpłaty zakupu nie zgadzają się z rozliczeniami faktur. Odśwież inwestycję przed odłączeniem.');
 p.receipts||=[];
 const manual=C.effectiveReceipts(p).find(r=>r.id==='purchase-payment:'+id);
 const receipt=manual?{id:C.uid(),date:manual.date,kind:'materials',stageId:'',amount:manual.amount,note:'Zaliczka na materiały — odłączona od zakupu: '+(item.shop||'')+' '+(item.invoice||'')}:null;
 if(receipt)p.receipts.push(receipt);
 for(const record of p.invoiceSettlements||[]){
  const received=C.round((record.allocations||[]).filter(a=>a.kind==='purchase'&&a.id===id).reduce((s,a)=>s+C.number(a.paid),0));
  record.allocations=(record.allocations||[]).filter(a=>a.kind!=='purchase'||a.id!==id);
  record.existingReceipts=(record.existingReceipts||[]).map(link=>link.id==='purchase-payment:'+id&&receipt?{id:receipt.id,amount:receipt.amount,date:receipt.date,kind:'materials'}:link);
  if(received>0){
   const advance=record.allocations.find(a=>a.key==='materials:advance');
   if(advance){advance.amount=C.round(C.number(advance.amount)+received);advance.paid=C.round(C.number(advance.paid)+received);}
   else record.allocations.push({key:'materials:advance',kind:'materials',id:'advance',label:'Zaliczka na materiały — bez przypisania do zakupu',remaining:Number.MAX_SAFE_INTEGER,amount:received,paid:received});
  }
 }
 delete item.invoicePayments;delete item.receiptPayments;
 // Legacy imports use separate material receipts rather than paidAmount.
 if(item.paidAmount!=null||allocations.length){item.paid=false;item.paidAmount=0;}
 return refreshReceiptLinks(p);
}
export function targets(p){
 const t=C.totals(p),remaining=Math.max(0,C.round(C.finalWorkAmount(p)-t.paid));
 return [...(p.purchases||[]).map(x=>({key:'purchase:'+x.id,kind:'purchase',id:x.id,label:'Materiały: '+(x.shop||'')+' — '+x.description,remaining:C.purchasePayment(x).remaining})),
 {key:'materials:advance',kind:'materials',id:'advance',label:'Zaliczka na materiały — bez przypisania do zakupu',remaining:Number.MAX_SAFE_INTEGER},
 ...(p.stages||[]).map(x=>({key:'stage:'+x.id,kind:'stage',id:x.id,label:x.name,remaining:Math.max(0,C.round(Math.min(remaining,t.agreed*C.number(x.percent)/100-C.effectiveReceipts(p).filter(r=>r.kind==='work'&&r.stageId===x.id).reduce((s,r)=>s+C.number(r.amount),0))))})),
 {key:'work:all',kind:'work',id:'all',label:'Rozliczenie całości prac',remaining}];
}
export const availableReceipts=(project,invoiceId)=>C.effectiveReceipts(withoutInvoice(project,invoiceId)).filter(r=>!r.invoiceId&&C.number(r.amount)>0);
export function validateReceiptAllocations(project){
 const used=new Map();
 for(const item of project.purchases||[])for(const [id,value] of Object.entries(item.receiptPayments||{})){
  const receipt=(project.receipts||[]).find(r=>r.id===id),amount=Number(value);
  if(!receipt||receipt.kind!=='materials'||!Number.isFinite(amount)||amount<0)throw Error('Nieprawidłowe rozliczenie wcześniejszej zaliczki.');
  used.set(id,C.round((used.get(id)||0)+amount));
  if(used.get(id)>C.number(receipt.amount)+.001)throw Error('Kwota rozliczeń zakupów przekracza wcześniejszą zaliczkę.');
 }
 return project;
}
export function refreshReceiptLinks(project){
 validateReceiptAllocations(project);
 const receipts=C.effectiveReceipts(project);
 for(const record of project.invoiceSettlements||[]){
  record.existingReceipts=(record.existingReceipts||[]).map(link=>{
   const receipt=receipts.find(r=>r.id===link.id);
   if(!receipt)throw Error('Najpierw odłącz wpłatę od faktury '+record.number+'.');
   return {id:receipt.id,amount:C.round(receipt.amount),date:receipt.date,kind:receipt.kind};
  });
  if(assigned(record)>record.total+.001)throw Error('Zmiana wpłaty przekracza kwotę faktury '+record.number+'. Najpierw zmień jej powiązania.');
 }
 return project;
}
// Editing a receipt must never leave purchase allocations referring to missing money.
// Detaching is an explicit UI choice; unrelated receipts and invoice allocations stay intact.
export function changeReceipt(project,id,replacement,{detach=false}={}){
 if(!(project.receipts||[]).some(r=>r.id===id))throw Error('Nie znaleziono wpłaty. Odśwież inwestycję.');
 if(replacement&&(!Number.isFinite(replacement.amount)||replacement.amount<=0||!['work','materials'].includes(replacement.kind)))throw Error('Podaj prawidłową kwotę i cel wpłaty.');
 const next=structuredClone(project);
 next.receipts=replacement?next.receipts.map(r=>r.id===id?{...replacement,id}:r):next.receipts.filter(r=>r.id!==id);
 if(detach){
  for(const item of next.purchases||[])if(item.receiptPayments){delete item.receiptPayments[id];if(!Object.keys(item.receiptPayments).length)delete item.receiptPayments;}
  for(const record of next.invoiceSettlements||[])record.existingReceipts=(record.existingReceipts||[]).filter(r=>r.id!==id);
 }
 try{return refreshReceiptLinks(next);}catch(error){error.code='RS_RECEIPT_LINKS';throw error;}
}
export function apply(project,row,allocations,date,existingIds=[]){
 if(row.originKind==='purchases'||row.referenceOnly)throw Error('Ten dokument nie jest fakturą sprzedażową do rozliczenia w PLN.');
 if(!row.number||row.status==='draft'||row.payload.correction)throw Error('Rozliczenie wymaga wystawionej faktury podstawowej.');
 if(row.payload.currency!=='PLN')throw Error('Rozliczenie inwestycji wymaga faktury w PLN.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Podaj datę wpływu.');
 const p=withoutInvoice(project,row.id),available=targets(p),seen=new Set();
 if(!Array.isArray(existingIds)||new Set(existingIds).size!==existingIds.length)throw Error('Nieprawidłowy wybór wcześniejszych wpłat.');
 const receipts=availableReceipts(p,row.id),existingReceipts=existingIds.map(id=>{
  const receipt=receipts.find(r=>r.id===id);
  if(!receipt)throw Error('Wybrana wpłata nie istnieje lub jest już powiązana z inną fakturą.');
  return {id:receipt.id,amount:C.round(receipt.amount),date:receipt.date,kind:receipt.kind};
 });
 const list=allocations.map(a=>{
  const target=available.find(t=>t.key===a.key),value=Number(a.amount),received=Number(a.paid);
  if(!target||seen.has(a.key)||!Number.isFinite(value)||!Number.isFinite(received)||value<0||received<0||received>value)throw Error('Sprawdź przypisane kwoty i wpłaty.');
  seen.add(a.key);
  if(C.round(received)>target.remaining+.001)throw Error('Wpłata przekracza pozostałą należność: '+target.label);
  const previous=(project.invoiceSettlements||[]).find(r=>r.id===row.id)?.allocations?.find(x=>x.key===a.key);return {...target,amount:C.round(value),paid:C.round(received),...(a.date||previous?.date?{date:a.date||previous.date}:{})};
 }).filter(a=>a.amount>0||a.paid>0);
 if(assigned({allocations:list,existingReceipts})>amount(row)+.001)throw Error('Suma przypisanych kwot przekracza kwotę faktury.');
 const workPaid=list.filter(a=>a.kind==='stage'||a.kind==='work').reduce((s,a)=>s+a.paid,0);
 if(workPaid>C.round(Math.max(0,C.finalWorkAmount(p)-C.totals(p).paid))+.001)throw Error('Łączna wpłata za etapy i całość przekracza pozostałą kwotę za prace.');
 for(const a of list.filter(a=>a.kind==='purchase'&&a.paid>0)){
  const item=p.purchases.find(x=>x.id===a.id);item.invoicePayments={...item.invoicePayments,[row.id]:a.paid};
 }
 p.invoiceSettlements.push({id:row.id,number:row.number,date,total:amount(row),allocations:list,existingReceipts});
 return p;
}
