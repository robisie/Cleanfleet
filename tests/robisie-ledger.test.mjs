import test from 'node:test';import assert from 'node:assert/strict';
import {settlementSelection} from '../app/robisie/core.js';
const rows=[{id:'a',category:'Materiały',description:'Panele do salonu',date:'2026-11-01',plus:0,minus:100.1,balance:-100.1},{id:'b',category:'Materiały',description:'Zwrot za panele',date:'',plus:200.2,minus:0,balance:100.1},{id:'c',category:'Inne',description:'Dostawa',date:'',plus:0,minus:50.3,balance:49.8}];
test('ledger summary combines category, search and date filters without changing global balances',()=>{
 const before=structuredClone(rows),all=settlementSelection(rows);
 assert.deepEqual([all.count,all.income,all.expense,all.balance],[3,200.2,150.4,49.8]);
 const selected=settlementSelection(rows,{category:'Materiały',search:' PANELE ',dateFilter:'undated'});
 assert.deepEqual([selected.count,selected.income,selected.expense,selected.balance],[1,200.2,0,200.2]);
 assert.equal(selected.rows[0].balance,100.1);assert.deepEqual(rows,before);
 const empty=settlementSelection(rows,{category:'Materiały',search:'Dostawa'});
 assert.deepEqual([empty.count,empty.income,empty.expense,empty.balance],[0,0,0,0]);
});
