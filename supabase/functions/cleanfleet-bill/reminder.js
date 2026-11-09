import {invoiceAmount} from './invoice.js';

export function reminderAmount(row,{evidence,project,fleetPaid=false}={}){
 const p=row.payload||{},today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!row.number||row.status==='draft'||p.correction||!/^20\d\d-\d\d-\d\d$/.test(p.dueDate||'')||p.dueDate>=today)throw Error('Przypomnienie dotyczy tylko faktury po terminie płatności.');
 const total=invoiceAmount(p);if(total<=0)throw Error('Faktura nie ma kwoty do zapłaty.');
 if(evidence?.manual_paid||fleetPaid)throw Error('Faktura jest oznaczona jako zapłacona.');
 const fromInvoice=Math.round(Number(p.paid?.amount||0)*100);
 const settlement=project?.invoiceSettlements?.find(x=>x.id===row.id);
 const fromProject=settlement?[...(settlement.allocations||[]).map(x=>x.paid),...(settlement.existingReceipts||[]).map(x=>x.amount)].reduce((s,v)=>s+Math.round(Number(v||0)*100),0):0;
 const bank=Number(evidence?.bank_cents||0);
 const paid=Math.max(fromInvoice,fromProject,bank);
 if(!Number.isSafeInteger(paid)||paid<0)throw Error('Nie udało się ustalić salda faktury.');
 const remaining=Math.max(0,total-paid);
 if(!remaining)throw Error('Faktura jest już rozliczona w całości.');
 return remaining;
}

export function reminderText(row,amount){
 const p=row.payload,number=String(row.number||'');
 const money=new Intl.NumberFormat('pl-PL',{style:'currency',currency:p.currency||'PLN'}).format(amount/100);
 const subject=`Przypomnienie o płatności — faktura ${number}`;
 const text=`Dzień dobry,\n\nprzypominamy o płatności za fakturę ${number}, której termin upłynął ${p.dueDate}. Według naszych danych do zapłaty pozostało ${money}.\n\nProsimy o przelew na rachunek ${p.bank||'wskazany na fakturze'}, wpisując numer faktury w tytule płatności. Jeżeli płatność została już wykonana, prosimy o wiadomość zwrotną z potwierdzeniem.\n\nZ poważaniem,\nRobisię-Fer sp. z o.o.`;
 return {subject,text};
}
