import * as C from './core.js?v=1.0.55';
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
export function targets(p){
 const t=C.totals(p),remaining=Math.max(0,C.round(C.finalWorkAmount(p)-t.paid));
 return [...(p.purchases||[]).map(x=>({key:'purchase:'+x.id,kind:'purchase',id:x.id,label:'Materiały: '+(x.shop||'')+' — '+x.description,remaining:C.purchasePayment(x).remaining})),
 ...(p.stages||[]).map(x=>({key:'stage:'+x.id,kind:'stage',id:x.id,label:x.name,remaining:Math.max(0,C.round(Math.min(remaining,t.agreed*C.number(x.percent)/100-C.effectiveReceipts(p).filter(r=>r.kind==='work'&&r.stageId===x.id).reduce((s,r)=>s+C.number(r.amount),0))))})),
 {key:'work:all',kind:'work',id:'all',label:'Rozliczenie całości prac',remaining}];
}
export const availableReceipts=(project,invoiceId)=>C.effectiveReceipts(withoutInvoice(project,invoiceId)).filter(r=>!r.invoiceId&&C.number(r.amount)>0);
export function refreshReceiptLinks(project){
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
  return {...target,amount:C.round(value),paid:C.round(received)};
 }).filter(a=>a.amount>0||a.paid>0);
 if(assigned({allocations:list,existingReceipts})>amount(row)+.001)throw Error('Suma przypisanych kwot przekracza kwotę faktury.');
 const workPaid=list.filter(a=>a.kind!=='purchase').reduce((s,a)=>s+a.paid,0);
 if(workPaid>C.round(Math.max(0,C.finalWorkAmount(p)-C.totals(p).paid))+.001)throw Error('Łączna wpłata za etapy i całość przekracza pozostałą kwotę za prace.');
 for(const a of list.filter(a=>a.kind==='purchase'&&a.paid>0)){
  const item=p.purchases.find(x=>x.id===a.id);item.invoicePayments={...item.invoicePayments,[row.id]:a.paid};
 }
 p.invoiceSettlements.push({id:row.id,number:row.number,date,total:amount(row),allocations:list,existingReceipts});
 return p;
}
