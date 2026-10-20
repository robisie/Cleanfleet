import * as C from './core.js?v=1.0.64';
import * as I from './invoices.js?v=1.0.64';
import {eligible} from './purchase-payments.js?v=1.0.64';
const cents=value=>Math.round(C.number(value)*100);
const oldest=(a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id).localeCompare(String(b.id));
export const purchases=project=>(project.purchases||[]).filter(p=>cents(C.purchasePayment(p).remaining)>0).slice().sort(oldest);
export function sources(project,documents){
 I.refreshReceiptLinks(structuredClone(project));
 const free=new Map((project.receipts||[]).filter(r=>r.kind==='materials').map(r=>[r.id,Math.max(0,cents(r.amount)-(project.purchases||[]).reduce((s,p)=>s+cents(p.receiptPayments?.[r.id]),0))]));
 // Historical imports have aggregate receipts and paid flags, without explicit allocations.
 let legacy=(project.purchases||[]).filter(p=>p.paidAmount==null&&p.paid).reduce((s,p)=>s+cents(p.amount),0);
 for(const receipt of project.receipts||[]){const used=Math.min(legacy,free.get(receipt.id)||0);legacy-=used;if(free.has(receipt.id))free.set(receipt.id,free.get(receipt.id)-used);}
 const linked=new Map();
 for(const record of project.invoiceSettlements||[])for(const r of record.existingReceipts||[]){if(linked.has(r.id))throw Error('Wpłata jest powiązana z więcej niż jedną fakturą. Popraw jej powiązania.');linked.set(r.id,record.id);}
 const advances=(project.receipts||[]).filter(r=>!linked.has(r.id)&&(free.get(r.id)||0)>0).slice().sort(oldest).map(r=>({key:'advance:'+r.id,id:r.id,type:'advance',label:r.note||'Zaliczka na materiały',date:r.date,available:free.get(r.id)/100,capacity:0,receipts:[{id:r.id,available:free.get(r.id)/100}]}));
 const seen=new Set(),invoices=documents.filter(eligible).filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;}).map(d=>{
  const record=(project.invoiceSettlements||[]).find(r=>r.id===d.id),receipts=(record?.existingReceipts||[]).filter(r=>(free.get(r.id)||0)>0).map(r=>({id:r.id,available:free.get(r.id)/100}));
  const pools=(record?.allocations||[]).filter(a=>a.kind==='materials'),pool=cents(pools.reduce((s,a)=>s+C.number(a.paid),0));
  const planned=pools.reduce((s,a)=>s+Math.max(0,cents(a.amount)-cents(a.paid)),0),total=cents(I.amount(d));
  if(cents(I.assigned(record))>total)throw Error('Rozliczenie przekracza kwotę faktury '+d.number+'. Popraw powiązania faktury.');
  return {key:'invoice:'+d.id,id:d.id,type:'invoice',label:d.number,date:d.payload.issueDate||'',available:(receipts.reduce((s,r)=>s+cents(r.available),0)+pool)/100,capacity:Math.max(0,total-cents(I.assigned(record))+planned)/100,receipts};
 }).sort(oldest);
 return [...advances,...invoices];
}
export function plan(project,documents,choices,links=[]){
 const catalog=sources(project,documents),available=new Map(catalog.map(s=>[s.key,s])),seen=new Set();
 if(!choices.length)throw Error('Wybierz co najmniej jedną zaliczkę lub fakturę.');
 for(const choice of choices){
  const source=available.get(choice.key),amount=cents(choice.amount),extra=cents(choice.newAmount);
  if(!source||seen.has(choice.key))throw Error('Nieprawidłowy wybór źródeł rozliczenia.');seen.add(choice.key);
  if(!Number.isFinite(Number(choice.amount))||!Number.isFinite(Number(choice.newAmount??0))||amount<0||extra<0||amount>cents(source.available)||extra>cents(source.capacity)||source.type==='advance'&&extra)throw Error('Kwota przekracza dostępne środki: '+source.label+'.');
  if(extra&&!/^\d{4}-\d{2}-\d{2}$/.test(choice.date||''))throw Error('Podaj datę nowej wpłaty z faktury '+source.label+'.');
 }
 const next=structuredClone(project),items=purchases(next),allocations=[];
 if(!items.length)throw Error('Wszystkie zakupy są już rozliczone.');
 const total=choices.reduce((s,c)=>s+cents(c.amount)+cents(c.newAmount),0);if(!total)throw Error('Wpisz kwotę do rozliczenia.');
 next.receipts||=[];next.invoiceSettlements||=[];
 const invoiceRecord=id=>{
  const doc=documents.find(d=>d.id===id&&eligible(d));if(!doc)throw Error('Wybierz fakturę sprzedażową tej inwestycji.');
  let record=next.invoiceSettlements.find(r=>r.id===id);
  if(!record){record={id,number:doc.number,total:I.amount(doc),date:C.today(),allocations:[],existingReceipts:[]};next.invoiceSettlements.push(record);}
  record.total=I.amount(doc);return record;
 };
 const releasePlanned=(record,amount)=>{let left=amount;for(const pool of record.allocations||[])if(pool.kind==='materials'){const use=Math.min(left,Math.max(0,cents(pool.amount)-cents(pool.paid)));pool.amount=(cents(pool.amount)-use)/100;left-=use;}};
 const linkedReceipts=new Set();
 for(const link of links){
  if(linkedReceipts.has(link.receiptId))throw Error('Jedną zaliczkę można powiązać tylko z jedną fakturą.');linkedReceipts.add(link.receiptId);
  if(!seen.has('invoice:'+link.invoiceId))throw Error('Zaznacz fakturę powiązaną z zaliczką.');
  const receipt=next.receipts.find(r=>r.id===link.receiptId&&r.kind==='materials');if(!receipt)throw Error('Nie znaleziono zaliczki.');
  const linked=next.invoiceSettlements.find(r=>(r.existingReceipts||[]).some(x=>x.id===receipt.id));
  if(linked){if(linked.id!==link.invoiceId)throw Error('Zaliczka jest już powiązana z inną fakturą.');continue;}
  const record=invoiceRecord(link.invoiceId);releasePlanned(record,cents(receipt.amount));record.existingReceipts||=[];record.existingReceipts.push({id:receipt.id,amount:receipt.amount,date:receipt.date,kind:receipt.kind});
  if(cents(I.assigned(record))>cents(record.total))throw Error('Zaliczki przekraczają kwotę faktury '+record.number+'.');
  const source=available.get('advance:'+receipt.id);if(source)source.label+=' · '+record.number;
 }
 const newReceipt=(record,amount,date)=>{
  const r={id:C.uid(),kind:'materials',stageId:'',amount:amount/100,date:date||'',note:'Wpłata na materiały z faktury '+record.number};next.receipts.push(r);
  record.existingReceipts||=[];record.existingReceipts.push({id:r.id,amount:r.amount,date:r.date,kind:r.kind});return r.id;
 };
 let allocated=0,newMoney=0;
 for(const choice of choices){
  const source=available.get(choice.key),buckets=source.receipts.map(r=>({...r,remaining:cents(r.available)}));let record;
  if(source.type==='invoice'){
   record=invoiceRecord(source.id);
   // Use previously recorded invoice advances as receipts, retaining their actual dates.
   for(const pool of record.allocations||[])if(pool.kind==='materials'&&cents(pool.paid)>0)buckets.push({pool,remaining:cents(pool.paid)});
  }
  const extra=cents(choice.newAmount);let newId;
  if(extra){
   releasePlanned(record,extra);
   newId=newReceipt(record,extra,choice.date);newMoney+=extra;
  }
  const spend=(bucket,budget)=>{
   let left=budget;
   for(const item of items){
    const take=Math.min(left,cents(C.purchasePayment(item).remaining));if(!take)continue;
    let id=bucket.id;
    if(bucket.pool){
     id=newReceipt(record,take,bucket.pool.date||record.date);bucket.pool.paid=(cents(bucket.pool.paid)-take)/100;bucket.pool.amount=Math.max(cents(bucket.pool.paid),cents(bucket.pool.amount)-take)/100;
    }
    if(item.paidAmount==null){item.paidAmount=0;item.paid=false;}
    item.receiptPayments={...item.receiptPayments,[id]:(cents(item.receiptPayments?.[id])+take)/100};
    allocations.push({purchaseId:item.id,sourceKey:source.key,sourceLabel:source.label,amount:take/100});allocated+=take;left-=take;if(!left)break;
   }
   return budget-left;
  };
  let oldBudget=cents(choice.amount);
  for(const bucket of buckets){const budget=Math.min(oldBudget,bucket.remaining);oldBudget-=spend(bucket,budget);if(!oldBudget)break;}
  if(newId)spend({id:newId},extra);
 }
 I.refreshReceiptLinks(next);
 if(allocated<=0)throw Error('Brak kwoty do przypisania do zakupów.');
 return {project:next,allocations,selected:total/100,allocated:allocated/100,unallocated:(total-allocated)/100,newMoney:newMoney/100,purchases:items.map(item=>({id:item.id,shop:item.shop,description:item.description,invoice:item.invoice,date:item.date,allocated:allocations.filter(a=>a.purchaseId===item.id).reduce((s,a)=>s+cents(a.amount),0)/100,remaining:C.purchasePayment(item).remaining,state:C.purchasePayment(item).state})).filter(r=>r.allocated>0)};
}
