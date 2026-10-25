import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import {cashBalance} from '../app/priv/cash.js';
test('Aga cash bridge exposes only the balance while unlocked and no decrypted ledger',async()=>{
 const source=await fs.readFile(new URL('../app/priv/ui.js',import.meta.url),'utf8'),start=source.indexOf('window.CFPrivateFinance={'),end=source.indexOf('\nif(financeEmbedded)',start);let activity=0;
 const state={cash:[{amount:100000,type:'income'},{amount:9000,type:'expense'}]},c=vm.createContext({window:{},key:null,state,user:{id:'owner'},cashBalance,activity:()=>activity++,lock(){}});vm.runInContext(source.slice(start,end),c);
 assert.equal(c.window.CFPrivateFinance.cashBalance(),null);c.key={};assert.equal(c.window.CFPrivateFinance.cashBalance(),91000);assert.equal(activity,1);assert.equal(typeof c.window.CFPrivateFinance.cashBalance(),'number');assert.equal(state.cash.length,2);c.key=null;assert.equal(c.window.CFPrivateFinance.cashBalance(),null);
});
