import * as C from './core.js?v=1.0.65';
import {invoiceAmount} from '../../bill/core.js?v=1.0.15';
export const amount=row=>invoiceAmount(row.payload)/100;
export const linkedPaid=record=>C.round((record?.existingReceipts||[]).reduce((s,r)=>s+C.number(r.amount),0));
export const paid=record=>C.round((record?.allocations||[]).reduce((s,a)=>s+C.number(a.paid),0)+linkedPaid(record));
export const assigned=record=>C.round((record?.allocations||[]).reduce((s,a)=>s+C.number(a.amount),0)+linkedPaid(record));
// A quick payment records actual money once. Planned allocations are replaced
// with dated receipts, so previous payment dates and purchase sources survive.
export function markPaid(project,row,{amount:received,date,kind='materials',receiptIds=[]}){
 if(!row?.number||row.status==='draft'||row.originKind==='purchases'||row.referenceOnly||row.payload?.correction||row.payload?.currency!=='PLN')throw Error('Wybierz wystawioną fakturę sprzedażową w PLN.');
 const value=Number(received),total=amount(row);if(!Number.isFinite(value)||value<0||!['materials','work'].includes(kind))throw Error('Podaj prawidłową kwotę i cel wpłaty.');
 if(value>0&&!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('Podaj datę wpływu.');
 if(new Set(receiptIds).size!==receiptIds.length)throw Error('Zaliczka została wybrana więcej niż raz.');
 const next=structuredClone(project);next.receipts||=[];next.invoiceSettlements||=[];
 let record=next.invoiceSettlements.find(r=>r.id===row.id);
 if(!record){record={id:row.id,number:row.number,total,date,allocations:[],existingReceipts:[]};next.invoiceSettlements.push(record);}
 record.total=total;record.existingReceipts||=[];record.allocations||=[];
 const available=C.effectiveReceipts(next).filter(r=>!r.invoiceId),selected=receiptIds.map(id=>{const r=available.find(r=>r.id===id);if(!r)throw Error('Wpłata nie istnieje lub jest już powiązana z fakturą.');return r;});
 const incoming=C.round(value+selected.reduce((s,r)=>s+C.number(r.amount),0));
 if(C.round(paid(record)+incoming)>total)throw Error('Wpłaty przekraczają kwotę faktury. Zmniejsz nową wpłatę lub wybór zaliczek.');
 if(!incoming){if(paid(record)>=total)return structuredClone(project);throw Error('Wpisz otrzymaną kwotę lub wybierz wcześniej zapisaną wpłatę.');}
 const makeRoom=n=>{let release=Math.max(0,C.round(assigned(record)+n-total));for(const a of record.allocations){const take=Math.min(release,Math.max(0,C.round(a.amount-a.paid)));a.amount=C.round(a.amount-take);release=C.round(release-take);}if(release>0)throw Error('Brak wolnej kwoty faktury.');};
 const link=r=>{makeRoom(r.amount);record.existingReceipts.push({id:r.id,amount:C.round(r.amount),date:r.date||'',kind:r.kind});};
 for(const receipt of selected)link(receipt);
 let left=C.round(value);
 const add=(n,purpose,stageId='',purchase)=>{const receipt={id:C.uid(),date,kind:purpose,stageId,amount:n,note:'Wpłata z faktury '+row.number};next.receipts.push(receipt);link(receipt);if(purchase){if(purchase.paidAmount==null){purchase.paidAmount=0;purchase.paid=false;}purchase.receiptPayments={...purchase.receiptPayments,[receipt.id]:n};}};
 for(const a of record.allocations){
  if(!left)break;const purchase=a.kind==='purchase'?next.purchases?.find(p=>p.id===a.id):null;
  const room=a.kind==='purchase'?(purchase?C.purchasePayment(purchase).remaining:0):left;
  const take=C.round(Math.min(left,Math.max(0,C.round(a.amount-a.paid)),room));if(!take)continue;
  a.amount=C.round(a.amount-take);add(take,['purchase','materials'].includes(a.kind)?'materials':'work',a.kind==='stage'?a.id:'',purchase);left=C.round(left-take);
 }
 if(left)add(left,kind);
 return refreshReceiptLinks(next);
}
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
