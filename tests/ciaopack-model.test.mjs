import test from 'node:test';
import assert from 'node:assert/strict';
import {validBarcode,parsePrice,shoppingSummary,amountDue} from '../ciaopack/model.mjs';

test('barcode is a verified text identifier',()=>{
  assert.equal(validBarcode(' 3017620422003 '),'3017620422003');
  assert.throws(()=>validBarcode('3017620422004'),/kontrolna/);
  assert.throws(()=>validBarcode('abc'),/8 do 14/);
});

test('shopping quantities and final payment are calculated independently',()=>{
  const products=[{id:'coffee',name:'Kawa'}];
  const items=[
    {product_id:'coffee',buyer_id:'anna',source:'order',ordered_qty:2,received:true,delivered_qty:1,price_cents:2500},
    {product_id:'coffee',buyer_id:'jan',source:'order',ordered_qty:3,received:false,delivered_qty:0,price_cents:2500},
    {product_id:'coffee',buyer_id:'anna',source:'extra',ordered_qty:0,received:true,delivered_qty:2,price_cents:800},
  ];
  assert.equal(shoppingSummary(items,products)[0].total,5);
  assert.equal(shoppingSummary(items,products)[0].people.length,2);
  assert.equal(amountDue(items),4100);
});

test('prices use whole grosz values',()=>{
  assert.equal(parsePrice('12,50'),1250);
  assert.throws(()=>parsePrice('12,345'));
});
