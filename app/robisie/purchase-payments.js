import * as C from './core.js?v=1.0.78';
import * as I from './invoices.js?v=1.0.68';

export const eligible=row=>!!row?.number&&row.status!=='draft'&&row.originKind!=='purchases'&&!row.referenceOnly&&!row.payload?.correction&&row.payload?.currency==='PLN';
export function rows(project,item){
 const result=[];
 if(item.paidAmount!=null&&item.paid&&C.number(item.paidAmount)>0)result.push({source:'cash',amount:C.number(item.paidAmount),date:item.paidDate||item.date||C.today()});
 for(const record of project.invoiceSettlements||[])for(const a of record.allocations||[])if(a.kind==='purchase'&&a.id===item.id)result.push({source:'invoice',id:record.id,amount:C.number(a.paid),assigned:C.number(a.amount),date:a.date||record.date});
 for(const [id,amount] of Object.entries(item.receiptPayments||{})){
  const receipt=project.receipts?.find(r=>r.id===id),invoice=(project.invoiceSettlements||[]).find(r=>(r.existingReceipts||[]).some(x=>x.id===id));
  if(invoice){let row=result.find(r=>r.source==='invoice'&&r.id===invoice.id);if(!row){row={source:'invoice',id:invoice.id,amount:0,date:receipt?.date||invoice.date};result.push(row);}row.amount=C.round(row.amount+C.number(amount));}
  else result.push({source:'advance',id,amount,date:receipt?.date});
 }
 if(item.paidAmount==null&&!result.length&&item.paid)result.push({source:'legacy',amount:C.purchasePayment(item).paid,date:item.date});
 return result;
}
export function advances(project,itemId){
 return (project.receipts||[]).filter(r=>r.kind==='materials'&&C.number(r.amount)>0).map(r=>({...r,available:C.round(C.number(r.amount)-(project.purchases||[]).filter(x=>x.id!==itemId).reduce((s,x)=>s+C.number(x.receiptPayments?.[r.id]),0))})).filter(r=>r.available>0);
}
export function apply(project,candidate,choice,invoices){
 const p=structuredClone(project),old=p.purchases.find(x=>x.id===candidate.id),charge=C.round(candidate.charge),seen=new Set();
 if(choice.unchanged&&old){
  const item={...candidate};for(const key of ['paid','paidAmount','paidDate','invoicePayments','receiptPayments'])if(Object.hasOwn(old,key))item[key]=structuredClone(old[key]);else delete item[key];
  if(old.paidAmount!=null&&C.round((old.paid?C.number(old.paidAmount):0)+C.invoicePurchasePaid(old)+C.receiptPurchasePaid(old))>charge)throw Error('Wybrane pozycje nie pokrywają zapisanych wpłat. Zmień rozliczenie zakupu.');
  p.purchases=p.purchases.map(x=>x.id===candidate.id?item:x);return I.refreshReceiptLinks(p);
 }
 if(choice.state!=='unpaid'&&choice.rows.some(r=>!Number.isFinite(Number(r.amount))||Number(r.amount)<0))throw Error('Podaj prawidłową kwotę rozliczenia.');
 const list=choice.state==='unpaid'?[]:choice.rows.filter(r=>C.number(r.amount)>0||r.source==='legacy');
 if(!['unpaid','partial','full'].includes(choice.state)||!Number.isFinite(Number(candidate.charge))||charge<0)throw Error('Wybierz prawidłowy status i koszt zakupu.');
 if(list.some(r=>r.source==='legacy')){
  if(list.length!==1||!old||old.paidAmount!=null||!old.paid||choice.state!==C.purchasePayment(old).state)throw Error('Zmień historyczne rozliczenie na gotówkę, wcześniejszą zaliczkę lub fakturę.');
  p.purchases=p.purchases.map(x=>x.id===candidate.id?{...candidate,paid:old.paid}:x);return I.refreshReceiptLinks(p);
 }
 for(const row of list){
  const key=row.source+':'+(row.id||''),value=Number(row.amount);
  if(seen.has(key)||!['cash','advance','invoice'].includes(row.source)||!Number.isFinite(value)||value<=0||!/^\d{4}-\d{2}-\d{2}$/.test(row.date||''))throw Error('Sprawdź źródła, daty i kwoty rozliczenia.');
  seen.add(key);
 }
 const total=C.round(list.reduce((s,r)=>s+Number(r.amount),0));
 if(total>charge+.001||choice.state==='full'&&total!==charge||choice.state==='partial'&&(total<=0||total>=charge))throw Error('Suma wpłat musi odpowiadać statusowi: pełna kwota albo część kosztu inwestora.');
 const cash=list.find(r=>r.source==='cash'),item={...candidate,paid:!!cash,paidAmount:cash?C.round(cash.amount):0,paidDate:cash?.date||old?.paidDate||candidate.date};
 delete item.invoicePayments;delete item.receiptPayments;
 p.purchases=old?p.purchases.map(x=>x.id===item.id?item:x):[...p.purchases,item];
 // Removing an already recorded source releases money to the material advance pool.
 if(old?.paidAmount!=null&&old.paid&&C.number(old.paidAmount)>0&&!cash){
  const receipt={id:C.uid(),kind:'materials',stageId:'',date:old.paidDate||old.date,amount:C.round(old.paidAmount),note:'Gotówka odłączona od zakupu: '+(old.shop||'')+' '+(old.invoice||'')};
  p.receipts.push(receipt);
  for(const record of p.invoiceSettlements||[])record.existingReceipts=(record.existingReceipts||[]).map(r=>r.id==='purchase-payment:'+item.id?{id:receipt.id,kind:receipt.kind,date:receipt.date,amount:receipt.amount}:r);
 }
 for(const row of list.filter(r=>r.source==='advance')){
  const receipt=advances(p,item.id).find(r=>r.id===row.id);
  if(!receipt||C.round(row.amount)>receipt.available+.001)throw Error('Wybrana zaliczka nie pokrywa rozliczanej kwoty.');
  item.receiptPayments={...item.receiptPayments,[row.id]:C.round(row.amount)};
 }
 const wanted=new Map(list.filter(r=>r.source==='invoice').map(r=>[r.id,r]));
 const ids=new Set([...wanted.keys(),...(project.invoiceSettlements||[]).filter(r=>(r.allocations||[]).some(a=>a.kind==='purchase'&&a.id===item.id)).map(r=>r.id)]);
 p.invoiceSettlements||=[];
 for(const id of ids){
  const source=invoices.find(r=>r.id===id),row=wanted.get(id);
  if(row&&!eligible(source))throw Error('Wybierz fakturę sprzedażową tej inwestycji w PLN.');
  let record=p.invoiceSettlements.find(r=>r.id===id);
  if(!record){record={id,number:source.number,total:I.amount(source),date:row.date,allocations:[],existingReceipts:[]};p.invoiceSettlements.push(record);}
  const previous=(record.allocations||[]).find(a=>a.kind==='purchase'&&a.id===item.id),before=C.number(previous?.paid);let desired=C.round(row?.amount||0);
  // A recorded advance linked to this invoice is already an inflow. Allocate it,
  // rather than creating another invoice payment for the same money.
  for(const link of record.existingReceipts||[]){
   const receipt=(p.receipts||[]).find(r=>r.id===link.id&&r.kind==='materials');if(!receipt||desired<=0)continue;
   const used=p.purchases.filter(x=>x.id!==item.id).reduce((s,x)=>s+C.number(x.receiptPayments?.[receipt.id]),0)+C.number(item.receiptPayments?.[receipt.id]);
   const reused=Math.min(desired,Math.max(0,C.round(C.number(receipt.amount)-used)));
   if(reused>0){item.receiptPayments={...item.receiptPayments,[receipt.id]:C.round(C.number(item.receiptPayments?.[receipt.id])+reused)};desired=C.round(desired-reused);}
  }
  record.allocations=(record.allocations||[]).filter(a=>a.kind!=='purchase'||a.id!==item.id);
  let pool=record.allocations.find(a=>a.key==='materials:advance'),delta=C.round(desired-before);
  if(delta<0){if(!pool){pool={key:'materials:advance',kind:'materials',id:'advance',label:'Zaliczka na materiały',amount:0,paid:0,date:previous?.date||record.date};record.allocations.push(pool);}pool.amount=C.round(C.number(pool.amount)-delta);pool.paid=C.round(C.number(pool.paid)-delta);}
  if(delta>0&&pool){const reused=Math.min(delta,C.number(pool.paid));pool.paid=C.round(C.number(pool.paid)-reused);pool.amount=Math.max(pool.paid,C.round(C.number(pool.amount)-reused));}
  if(desired>0){record.allocations.push({key:'purchase:'+item.id,kind:'purchase',id:item.id,label:'Materiały: '+item.shop+' — '+item.description,amount:desired,paid:desired,date:row.date});item.invoicePayments={...item.invoicePayments,[id]:desired};}
  if(source){record.total=I.amount(source);record.number=source.number;}
  if(I.assigned(record)>record.total+.001)throw Error('Brak wolnej kwoty na fakturze '+record.number+'. Uwzględnij wcześniejsze wpłaty i pozostałe należności.');
 }
 return I.refreshReceiptLinks(p);
}
