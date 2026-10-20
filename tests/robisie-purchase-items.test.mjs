import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedPreview,itemSelection} from '../app/robisie/purchase-items.js';
const link={document:{grossAmount:282,referenceOnly:false,payload:{currency:'PLN'}},items:[{index:1,name:'Farba',quantity:2,unit:'szt.',gross:123},{index:2,name:'Prywatny zakup',gross:54},{index:3,name:'Grunt',gross:105}]};
test('cached full invoice supplies all rows, including previously excluded items',()=>{
 const p=cachedPreview(link);assert.equal(p.canSelect,true);const selected=itemSelection(p,[1,3]);assert.equal(selected.total,228);assert.equal(selected.items.length,2);assert.ok(!selected.description.includes('Prywatny'));assert.equal(itemSelection(p,[2]).total,54);assert.equal(itemSelection(p,null).total,282);
 assert.throws(()=>itemSelection(p,[]));assert.throws(()=>itemSelection(p,[1,1]));assert.throws(()=>itemSelection(p,[99]));
});
test('legacy or unreconciled rows require server preview or full-document selection',()=>{
 assert.equal(cachedPreview({...link,items:[{name:'Legacy',net:'100',vat:'23'}]}),null);
 const p=cachedPreview({...link,items:[{index:1,name:'Unknown',gross:null}]});assert.equal(p.canSelect,false);assert.equal(itemSelection(p,null).total,282);assert.throws(()=>itemSelection(p,[]));
});
