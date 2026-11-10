import {test} from 'node:test';
import assert from 'node:assert/strict';
import {receiptText,validReceiptTemplate} from '../supabase/functions/cleanfleet-bill/receipt.js';

const row={id:'a',number:'A1/11/2026',status:'accepted',payload:{currency:'PLN',lines:[{name:'Usługa',qty:'1',unit:'szt.',price:'100.00'}],vatTreatment:'exempt',globalDiscount:'0'}};
test('potwierdzenie nie nazywa wpłaty terminową i podaje saldo tylko przy częściowej wpłacie',()=>{
 const partial=receiptText(row,{bank_cents:3000});
 assert.match(partial.text,/30,00\s*zł/);
 assert.match(partial.text,/Do zapłaty pozostaje 70,00\s*zł/);
 assert.match(partial.text,/Dziękujemy za płatność/);
 assert.doesNotMatch(partial.text,/terminow/);
 assert.deepEqual([partial.amount,partial.remaining],[3000,7000]);
 const full=receiptText(row,{manual_paid:true});
 assert.deepEqual([full.amount,full.remaining],[10000,0]);
 assert.doesNotMatch(full.text,/Do zapłaty pozostaje/);
 assert.throws(()=>receiptText(row,{}),/Brak potwierdzonej wpłaty/);
});
test('szablon jest edytowalny i nie przyjmuje wstrzykniętego nagłówka',()=>{
 const template=validReceiptTemplate({subject:'Wpłata {{numer}}',body:'Otrzymano {{kwota}}.{{saldo}}'});
 assert.equal(receiptText(row,{bank_cents:3000},template).subject,'Wpłata A1/11/2026');
 assert.throws(()=>validReceiptTemplate({subject:'A\nBcc: x@y.pl',body:'Treść'}),/Temat/);
});
