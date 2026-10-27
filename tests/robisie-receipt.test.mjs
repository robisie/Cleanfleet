import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReceiptData} from '../bill/receipt-import.js';
import {stockMarkup} from '../bill/stock.js';

const candidate=()=>({date:'2026-10-23',number:'AB/123',seller:'Sklep',sellerNip:'1234567890',buyerNip:'6351861297',total:45.50,items:[{name:'Farba',quantity:2,unit:'szt.',gross:40},{name:'Pędzel',quantity:1,unit:'szt.',gross:5.50}]});
test('paragon z NIP-em zachowuje oddzielne pozycje i kwoty',()=>{
 assert.deepEqual(validateReceiptData(candidate()),candidate());
 for(const [field,value] of [['buyerNip','1234567890'],['date','2026-02-30'],['total',45.49]]){
  const data=candidate();data[field]=value;assert.throws(()=>validateReceiptData(data));
 }
 const item=candidate();item.items[0].quantity=0;assert.throws(()=>validateReceiptData(item));
});
test('magazyn pokazuje paragon i ceny bez przycisku faktury KSeF',()=>{
 const meta={source:'nip-receipt',ksefNumber:'PARAGON-test',invoiceNumber:'AB/123',issueDate:'2026-10-23',currency:'PLN',seller:{name:'Sklep',nip:'1234567890'}};
 const rows=candidate().items.map((item,index)=>({metadata:meta,item:{...item,index:index+1},capacity:item.quantity,assigned:0,available:item.quantity,returned:0,uses:{}}));
 const html=stockMarkup(rows);
 assert.match(html,/Paragon · AB\/123/);
 assert.match(html,/Farba/);assert.match(html,/Pędzel/);
 assert.match(html,/20,00\s*zł/);
 assert.match(html,/Przypisz cały paragon/);
 assert.doesNotMatch(html,/data-kf="preview"/);
});
