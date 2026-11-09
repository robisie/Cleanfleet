import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reminderAmount,reminderText,validReminderTemplate} from '../supabase/functions/cleanfleet-bill/reminder.js';

const invoice={id:'f',number:'A1/10/2026',status:'accepted',payload:{dueDate:'2026-10-01',currency:'PLN',bank:'111',buyer:{email:'klient@example.com'},lines:[{name:'Usługa',qty:'1',unit:'szt.',price:'100.00'}],vatTreatment:'exempt',globalDiscount:'0'}};
test('przypomnienie uwzględnia wpłaty i blokuje opłacone faktury',()=>{
 assert.equal(reminderAmount(invoice,{evidence:{bank_cents:3000}}),7000);
 assert.equal(reminderAmount(invoice,{project:{invoiceSettlements:[{id:'f',allocations:[{paid:40}],existingReceipts:[{amount:10}]}]}}),5000);
 assert.throws(()=>reminderAmount(invoice,{evidence:{manual_paid:true}}),/zapłacona/);
 assert.throws(()=>reminderAmount(invoice,{evidence:{bank_cents:10000}}),/rozliczona/);
 assert.match(reminderText(invoice,7000).text,/70,00/);
});
test('edytowana treść podstawia dane faktury bez zmiany zapisanego szablonu',()=>{
 const template=validReminderTemplate({subject:'Faktura {{numer}}',body:'Do zapłaty {{kwota}} do {{termin}} na {{rachunek}}.'});
 assert.deepEqual(reminderText(invoice,7000,template),{subject:'Faktura A1/10/2026',text:'Do zapłaty 70,00 zł do 2026-10-01 na 111.'});
 assert.equal(template.body,'Do zapłaty {{kwota}} do {{termin}} na {{rachunek}}.');
 assert.throws(()=>validReminderTemplate({subject:'Nagłówek\nBcc: x@y.pl',body:'Wiadomość'}),/Temat/);
});
test('termin dzisiaj dopuszcza tylko powiadomienie, nie wysyłkę e-mail',()=>{
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const due={...invoice,payload:{...invoice.payload,dueDate:today}};
 assert.equal(reminderAmount(due,{allowDueToday:true}),10000);
 assert.throws(()=>reminderAmount(due),/po terminie/);
 assert.throws(()=>reminderAmount(due,{allowDueToday:true,evidence:{manual_paid:true}}),/zapłacona/);
});
test('powiązanie sprzedażowe Robisię uwzględnia wpłaty w projekcie',()=>{
 const project={invoiceSettlements:[{id:'linked',allocations:[{paid:30}],existingReceipts:[{amount:20}]}]};
 assert.equal(reminderAmount(invoice,{project,settlementId:'linked'}),5000);
 assert.throws(()=>reminderAmount(invoice,{project:{invoiceSettlements:[{id:'linked',allocations:[{paid:100}]}]},settlementId:'linked'}),/rozliczona/);
});
