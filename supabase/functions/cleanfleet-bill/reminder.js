import {invoiceAmount} from './invoice.js';

export function reminderAmount(row,{evidence,project,fleetPaid=false,allowDueToday=false,settlementId=row.id}={}){
 const p=row.payload||{},today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!row.number||row.status==='draft'||p.correction||!/^20\d\d-\d\d-\d\d$/.test(p.dueDate||'')||(allowDueToday?p.dueDate>today:p.dueDate>=today))throw Error('Przypomnienie dotyczy tylko faktury po terminie płatności.');
 const total=invoiceAmount(p);if(total<=0)throw Error('Faktura nie ma kwoty do zapłaty.');
 if(evidence?.manual_paid||fleetPaid)throw Error('Faktura jest oznaczona jako zapłacona.');
 const fromInvoice=Math.round(Number(p.paid?.amount||0)*100);
 const settlement=project?.invoiceSettlements?.find(x=>x.id===settlementId);
 const fromProject=settlement?[...(settlement.allocations||[]).map(x=>x.paid),...(settlement.existingReceipts||[]).map(x=>x.amount)].reduce((s,v)=>s+Math.round(Number(v||0)*100),0):0;
 const bank=Number(evidence?.bank_cents||0);
 const paid=Math.max(fromInvoice,fromProject,bank);
 if(!Number.isSafeInteger(paid)||paid<0)throw Error('Nie udało się ustalić salda faktury.');
 const remaining=Math.max(0,total-paid);
 if(!remaining)throw Error('Faktura jest już rozliczona w całości.');
 return remaining;
}

const previousDefaultBody=`Dzień dobry,

przypominamy o płatności za fakturę {{numer}}, której termin upłynął {{termin}}. Według naszych danych do zapłaty pozostało {{kwota}}.

Prosimy o przelew na rachunek {{rachunek}}, wpisując numer faktury w tytule płatności. Jeżeli płatność została już wykonana, prosimy o wiadomość zwrotną z potwierdzeniem.

Z poważaniem,
Robisię-Fer sp. z o.o.`;

export const DEFAULT_REMINDER_TEMPLATE={
 subject:'Przypomnienie o płatności — faktura {{numer}}',
 body:`${previousDefaultBody}\n\nTa wiadomość została wysłana automatycznie z aplikacji cleanfleet.pl.`
};

export function upgradeReminderTemplate(template){
 if(!template)return DEFAULT_REMINDER_TEMPLATE;
 if(template.body.replaceAll('\r\n','\n')===previousDefaultBody){
  return {...template,body:DEFAULT_REMINDER_TEMPLATE.body};
 }
 return template;
}

export function validReminderTemplate(input){
 const subject=String(input?.subject||'').trim(),body=String(input?.body||'').trim();
 if(!subject||subject.length>180||/[\r\n\x00-\x1f]/.test(subject))throw Error('Temat wiadomości musi mieć od 1 do 180 znaków i mieścić się w jednej linii.');
 if(!body||body.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body))throw Error('Treść wiadomości musi mieć od 1 do 4000 znaków.');
 return {subject,body};
}

export function reminderText(row,amount,template=DEFAULT_REMINDER_TEMPLATE){
 const p=row.payload,number=String(row.number||'');
 const money=new Intl.NumberFormat('pl-PL',{style:'currency',currency:p.currency||'PLN'}).format(amount/100);
 const values={numer:number,termin:p.dueDate,kwota:money,rachunek:p.bank||'wskazany na fakturze'};
 const fill=value=>String(value).replace(/\{\{(numer|termin|kwota|rachunek)\}\}/g,(_,key)=>values[key]);
 const subject=fill(template.subject),text=fill(template.body);
 return {subject,text};
}
