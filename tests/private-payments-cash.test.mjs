import test from 'node:test';
import assert from 'node:assert/strict';
import {cashAmount,cashBalance,validateCash} from '../app/priv/cash.js';
import {keyFor,newSalt,seal,open} from '../app/priv/vault.js';
const entry={id:'first',amount:12345,type:'income',description:'Początkowa gotówka',createdAt:'2026-10-07T17:00:00Z'};
test('PLN entry uses exact grosze and rejects signs, zero, excess decimals and unsafe amounts',()=>{
 for(const [text,amount] of [['12,3',1230],['12.30',1230],['1 234,56',123456],['100',10000],['0,01',1]])assert.equal(cashAmount(text),amount);
 for(const text of ['','0','-1','+1','12,345','1e3','Infinity','9007199254740999'])assert.equal(cashAmount(text),null);
});
test('income, expense and deletion calculate the all-time balance exactly, including negative balances',()=>{
 const expense={...entry,id:'second',amount:456,type:'expense'};
 assert.equal(cashBalance(validateCash([entry,expense])),11889);
 assert.equal(cashBalance([expense]),-456);
 assert.equal(cashBalance([entry]),12345);assert.equal(cashBalance([]),0);
});
test('corrupted cash entries and overflow cannot be saved or restored',()=>{
 for(const entries of [null,[entry,entry],[{...entry,type:'transfer'}],[{...entry,amount:0}],[{...entry,amount:1.5}],[{...entry,description:''}],[{...entry,createdAt:'invalid'}],[{...entry,description:'x'.repeat(121)}],[{...entry,amount:Number.MAX_SAFE_INTEGER},{...entry,id:'overflow',amount:1}]])assert.throws(()=>validateCash(entries));
});
test('cash survives vault encryption, reopening, backup and PIN change without exposing descriptions',async()=>{
 const state={version:1,rules:[],transactions:[],imports:[],cash:[entry]},salt=newSalt(),key=await keyFor('test-pin-123',salt);
 const envelope=await seal(state,key,salt);assert(!JSON.stringify(envelope).includes(entry.description));
 assert.deepEqual((await open(JSON.parse(JSON.stringify(envelope)),key)).cash,[entry]);
 const replacementSalt=newSalt(),replacementKey=await keyFor('another-pin-456',replacementSalt),replacement=await seal(state,replacementKey,replacementSalt);
 assert.deepEqual((await open(replacement,replacementKey)).cash,[entry]);await assert.rejects(open(replacement,key));
});
