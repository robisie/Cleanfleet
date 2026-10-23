import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationRows,quantitySelection,savedEntries,allocationMarkup} from '../app/robisie/ksef-allocation.js';
const preview={canSelect:true,gross:450,items:[{index:1,name:'Farba',quantity:4,unit:'szt.',gross:400},{index:2,name:'Grunt',quantity:1,unit:'szt.',gross:50}]};
const link=(project,entries)=>({project_id:project,project_name:'Inwestycja '+project,kind:'purchases',document:{selectedQuantities:entries},items:preview.items});
test('four pieces split 2/1/1 between three investments without reserving a whole row',()=>{
 const a=quantitySelection(preview,[{index:1,quantity:2}]);assert.equal(a.total,200);
 const links=[link('A',a.entries)],rows=allocationRows(preview,links,'B');assert.equal(rows[0].available,2);
 const b=quantitySelection(preview,[{index:1,quantity:1}],rows);assert.equal(b.total,100);links.push(link('B',b.entries));
 const c=quantitySelection(preview,[{index:1,quantity:1}],allocationRows(preview,links,'C'));assert.equal(c.total,100);links.push(link('C',c.entries));
 assert.equal(allocationRows(preview,links,'D')[0].available,0);assert.throws(()=>quantitySelection(preview,[{index:1,quantity:1}],allocationRows(preview,links,'D')),/dostępne 0/);
 assert.equal(allocationRows(preview,links,'A')[0].available,2);
 const html=allocationMarkup(preview,links,'D');assert.match(html,/data-allocation-check="1"[^>]*disabled/);assert.match(html,/Inwestycja A/);assert.match(html,/Dostępne: 0/);
});
test('whole rows from legacy assignments stay blocked and edited quantities can be released',()=>{
 const legacy={project_id:'A',kind:'purchases',document:{selectedIndices:[1]},items:preview.items};assert.equal(savedEntries(legacy,preview.items)[0].quantity,4);
 assert.equal(allocationRows(preview,[legacy],'B')[0].available,0);
 legacy.document={selectedQuantities:[{index:1,quantity:2,gross:200}]};assert.equal(allocationRows(preview,[legacy],'B')[0].available,2);
 assert.equal(allocationRows(preview,[],'B')[0].available,4);
});
test('fractional quantities and final penny remainder reconcile exactly',()=>{
 const p={canSelect:true,gross:.05,items:[{index:1,name:'Przewód',quantity:3,gross:.05}]};const links=[];let total=0;
 for(const project of ['A','B','C']){const s=quantitySelection(p,[{index:1,quantity:1}],allocationRows(p,links,project));total+=s.total;links.push(link(project,s.entries));}
 assert.equal(Math.round(total*100),5);assert.equal(links[2].document.selectedQuantities[0].gross,.01);
 const fractional=quantitySelection(preview,[{index:1,quantity:.125}]);assert.equal(fractional.total,12.5);
 for(const quantity of [0,-1,Infinity,NaN,4.1,.1234567])assert.throws(()=>quantitySelection(preview,[{index:1,quantity}]));
 assert.throws(()=>quantitySelection(preview,[{index:1,quantity:1},{index:1,quantity:1}]));
});
test('CleanFleet costs and documents without reliable totals cannot be partially allocated',()=>{
 assert.equal(allocationRows(preview,[],'A',[1])[0].available,0);
 assert.throws(()=>quantitySelection({...preview,canSelect:false},[{index:1,quantity:2}]));
 const p={canSelect:false,gross:450,items:preview.items.map(i=>({...i,gross:null}))};assert.equal(quantitySelection(p,[{index:1,quantity:4},{index:2,quantity:1}]).total,450);
});
