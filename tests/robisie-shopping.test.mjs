import test from 'node:test';import assert from 'node:assert/strict';import * as S from '../app/robisie/shopping.js';import * as C from '../app/robisie/core.js';
const purchase=(id='purchase',quantity=6,amount=60)=>({id,date:'2026-10-25',shop:'Leroy Merlin sp. z o.o.',invoice:'FV/1',sourceKsefNumber:'KSEF-'+id,amount,charge:amount,invoiceItems:[{index:1,name:'Płyta OSB 22 mm',quantity,unit:'szt.',gross:amount}]});
const add=(p,quantity=10,values={})=>S.saveItem(p,{name:'Płyta OSB',shop:'Leroy Merlin',quantity,unit:'szt.',...values},null,()=>`item-${(p.shoppingList||[]).length}`);
test('new and legacy investments support isolated shopping lists without affecting financial totals',()=>{
 const p={...C.newProject('A','B'),purchases:[purchase()]},before=C.totals(p),next=add(p);assert.equal(p.shoppingList.length,0);assert.equal(next.shoppingList.length,1);assert.deepEqual(C.totals(next),before);assert.equal(S.rows({}) .length,0);assert.equal(S.totals(next).needed,1);assert(C.MODULES.some(([k])=>k==='shopping'));
});
test('manual check records date, can be undone, and stays eligible for invoice suggestions',()=>{
 let p=add({purchases:[purchase()]},6);p=S.toggle(p,'item-0','2026-10-25');assert.equal(S.rows(p)[0].state,'bought');assert.equal(S.rows(p)[0].date,'2026-10-25');assert.equal(S.suggestions(p).length,1);assert.equal(S.totals(p).amount,0);
 p=S.link(p,'item-0',S.purchaseLines(p)[0].key,6);assert.equal(S.rows(p)[0].bought,6);assert.equal(S.rows(p)[0].linked,6);assert.equal(S.rows(p)[0].name,'Płyta OSB 22 mm');assert.equal(S.rows(p)[0].originalName,'Płyta OSB');assert.equal(S.rows(p)[0].amount,60);assert.equal(S.suggestions(p).length,0);assert.throws(()=>S.toggle(p,'item-0','2026-10-25'),/faktura/);
 p=S.unlink(p,'item-0','purchase',1);assert.equal(S.rows(p)[0].state,'bought');p=S.toggle(p,'item-0','2026-10-25');assert.equal(S.rows(p)[0].state,'needed');
});
test('partial purchases and multiple invoices fulfill the remaining quantity exactly once',()=>{
 let p=add({purchases:[purchase()]});const first=S.purchaseLines(p)[0].key;p=S.link(p,'item-0',first,6);assert.equal(S.rows(p)[0].remaining,4);assert.equal(S.rows(p)[0].state,'partial');assert.equal(S.suggestions(p).length,0);assert.throws(()=>S.link(p,'item-0',first,1),/niedostępna/);
 p.purchases.push(purchase('second',4,50));p=S.link(p,'item-0',S.purchaseLines(p)[1].key,4);assert.equal(S.rows(p)[0].state,'bought');assert.equal(S.totals(p).amount,110);assert.equal(p.purchases.length,2);
});
test('only allocated line quantities and money can be consumed across shopping entries',()=>{
 const invoice=purchase();invoice.selectedKsefQuantities=[{index:1,quantity:2,gross:20}];let p=add({purchases:[invoice]},2);p=add(p,1);const source=S.purchaseLines(p)[0];assert.equal(source.quantity,2);assert.equal(source.amount,20);p=S.link(p,'item-0',source.key,2);assert.equal(S.available(p,source),0);assert.throws(()=>S.link(p,'item-1',source.key,1));
 p.purchases[0].selectedKsefQuantities[0].quantity=1;assert(S.rows(p)[0].invalid);assert.equal(S.rows(p)[0].linked,0);assert.equal(S.totals(p).amount,0);
});
test('splitting a line preserves the final penny and never duplicates a purchase',()=>{
 let p={purchases:[purchase('tiny',3,.05)]};for(let i=0;i<3;i++)p=add(p,1);const source=S.purchaseLines(p)[0];for(let i=0;i<3;i++)p=S.link(p,`item-${i}`,source.key,1);assert.equal(S.totals(p).amount,.05);assert.deepEqual(S.rows(p).map(x=>x.amount),[.02,.01,.02]);assert.equal(p.purchases.length,1);
});
test('name and store matching proposes, never automatically changes shopping state',()=>{
 const p=add({purchases:[purchase()]});assert(S.suggestions(p)[0].score>.7);assert.equal(S.rows(p)[0].state,'needed');const other=add({purchases:[{...purchase(),invoiceItems:[{index:1,name:'Śruba stalowa',quantity:2,gross:10,unit:'szt.'}]}]});assert.equal(S.suggestions(other).length,0);
 assert(S.score({name:'farba biała',shop:'Leroy'}, {name:'Farbę białą',shop:'Leroy Merlin',unit:'l'})>0);assert.equal(S.score({name:'Farba',unit:'l'}, {name:'Farba',unit:'szt.'}),0);
});
test('missing documents, unknown values and corrections stay explicit',()=>{
 let p=add({purchases:[purchase()]});p=S.link(p,'item-0',S.purchaseLines(p)[0].key,2);p.purchases=[];assert(S.rows(p)[0].invalid);assert.equal(S.rows(p)[0].linked,0);
 p=add({purchases:[{...purchase(),ksefCorrections:[{amount:-20}]}]});assert.equal(S.purchaseLines(p).length,0);
 p=add({purchases:[{...purchase(),invoiceItems:[{index:1,name:'Płyta OSB',quantity:6,unit:'szt.',gross:null}]}]});p=S.link(p,'item-0',S.purchaseLines(p)[0].key,2);assert.equal(S.rows(p)[0].amount,null);assert.equal(S.totals(p).unknown,1);
});
test('validation rejects incompatible units, overbuying, invalid input and links to another project',()=>{
 let p=add({purchases:[purchase()]});assert.throws(()=>S.saveItem(p,{name:'Test',quantity:0}));assert.throws(()=>S.saveItem(p,{name:'Test',quantity:1,boughtQuantity:2}));assert.throws(()=>S.link({shoppingList:p.shoppingList,purchases:[]},'item-0',S.purchaseLines(p)[0].key,1));
 const line=S.purchaseLines(p)[0];p.shoppingList[0].unit='m2';assert.throws(()=>S.link(p,'item-0',line.key,1),/Jednostki/);p.shoppingList[0].unit='szt.';p=S.link(p,'item-0',line.key,3);assert.throws(()=>S.saveItem(p,{...p.shoppingList[0],quantity:2},'item-0'),/Ilość/);
});
