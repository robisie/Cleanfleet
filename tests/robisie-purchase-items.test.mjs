import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedPreview,itemSelection,restoreSource} from '../app/robisie/purchase-items.js';
const link={document:{grossAmount:282,referenceOnly:false,payload:{currency:'PLN'}},items:[{index:1,name:'Farba',quantity:2,unit:'szt.',gross:123},{index:2,name:'Prywatny zakup',gross:54},{index:3,name:'Grunt',gross:105}]};
test('cached full invoice supplies all rows, including previously excluded items',()=>{
 const p=cachedPreview(link);assert.equal(p.canSelect,true);const selected=itemSelection(p,[1,3]);assert.equal(selected.total,228);assert.equal(selected.items.length,2);assert.ok(!selected.description.includes('Prywatny'));assert.equal(itemSelection(p,[2]).total,54);assert.equal(itemSelection(p,null).total,282);
 assert.throws(()=>itemSelection(p,[]));assert.throws(()=>itemSelection(p,[1,1]));assert.throws(()=>itemSelection(p,[99]));
});
test('legacy or unreconciled rows require server preview or full-document selection',()=>{
 assert.equal(cachedPreview({...link,items:[{name:'Legacy',net:'100',vat:'23'}]}),null);
 const p=cachedPreview({...link,items:[{index:1,name:'Unknown',gross:null}]});assert.equal(p.canSelect,false);assert.equal(itemSelection(p,null).total,282);assert.throws(()=>itemSelection(p,[]));
});

test('reassigned purchase restores its complete KSeF source without changing cost, payments or other fields',()=>{
 const source={...structuredClone(link),project_id:'project',kind:'purchases',ksef_number:'1234567890-20261001-ABCDEF123456-AA'};
 Object.assign(source.document,{number:'FV-1',selectedIndices:[1,3],importedAmount:228});
 const item={id:'purchase',invoice:'FV-1',supplierNip:'1234567890',shop:'Sklep',amount:228,charge:250,paid:true,paidAmount:50,receiptPayments:{advance:100},invoicePayments:{sale:100},description:'Opis użytkownika'},project={purchases:[item],receipts:[{id:'advance',amount:100}],invoiceSettlements:[]};
 const before=structuredClone(project),next=restoreSource(project,item.id,[source],'project');assert.equal(next.purchases[0].sourceKsefNumber,source.ksef_number);assert.deepEqual(next.purchases[0].selectedKsefRows,[1,3]);assert.equal(next.purchases[0].invoiceItems.length,2);
 const restored={...next.purchases[0]};for(const key of ['sourceKsefNumber','selectedKsefRows','invoiceItems','invoiceGrossAmount'])delete restored[key];assert.deepEqual(restored,item);assert.deepEqual(project,before);assert.equal(cachedPreview(source).items.length,3);
 assert.equal(restoreSource(project,item.id,[{...source,project_id:'other'}],'project'),null);
 assert.equal(restoreSource(project,item.id,[source,source],'project'),null);
 assert.equal(restoreSource({...project,purchases:[item,{...item,id:'duplicate'}]},item.id,[source],'project'),null);
 assert.equal(restoreSource({...project,purchases:[{...item,supplierNip:'9999999999'}]},item.id,[source],'project'),null);
 assert.equal(restoreSource({...project,purchases:[{...item,amount:227}]},item.id,[source],'project'),null);
});
