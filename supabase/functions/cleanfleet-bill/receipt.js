import {invoiceAmount} from './invoice.js';

export const DEFAULT_RECEIPT_TEMPLATE={
 subject:'Potwierdzenie płatności — faktura {{numer}}',
 body:`Dzień dobry,

potwierdzamy zaksięgowanie płatności za fakturę {{numer}} w kwocie {{kwota}}.{{saldo}}

Dziękujemy za płatność.

Z poważaniem,
Robisię-Fer sp. z o.o.

Ta wiadomość została wysłana automatycznie z aplikacji cleanfleet.pl.`
};

export function validReceiptTemplate(input){
 const subject=String(input?.subject||'').trim(),body=String(input?.body||'').trim();
 if(!subject||subject.length>180||/[\r\n\x00-\x1f]/.test(subject))throw Error('Temat musi mieścić się w jednej linii (do 180 znaków).');
 if(!body||body.length>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body))throw Error('Treść wiadomości musi mieć od 1 do 4000 znaków.');
 return {subject,body};
}

export function receiptText(row,evidence,template=DEFAULT_RECEIPT_TEMPLATE){
 if(!row.number||row.status==='draft'||row.payload?.correction)throw Error('Potwierdzenie dotyczy tylko wystawionej faktury.');
 const total=invoiceAmount(row.payload),bank=Number(evidence?.bank_cents);
 const hasBank=Number.isSafeInteger(bank)&&bank>0;
 if(!evidence?.manual_paid&&!hasBank)throw Error('Brak potwierdzonej wpłaty dla tej faktury.');
 if(!Number.isSafeInteger(total)||total<=0)throw Error('Nieprawidłowa kwota faktury.');
 const amount=hasBank?Math.min(total,bank):total,remaining=total-amount;
 const currency=row.payload.currency||'PLN',money=cents=>new Intl.NumberFormat('pl-PL',{style:'currency',currency}).format(cents/100);
 const values={numer:row.number,kwota:money(amount),saldo:remaining?` Do zapłaty pozostaje ${money(remaining)}.`:''};
 const fill=value=>String(value).replace(/\{\{(numer|kwota|saldo)\}\}/g,(_,key)=>values[key]);
 return {subject:fill(template.subject),text:fill(template.body),amount,remaining,currency};
}
