import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as P from '../app/robisie/purchase-payments.js';
import {markup,mount} from '../app/robisie/purchase-payment-form.js';

// Minimal form surface: replaces controls on redraw, just as the browser does.
function formSurface(){
 const nodes=new Map();
 const parse=html=>{
  const ids=[];
  for(const match of html.matchAll(/<(input|select|button|div|p)[^>]*\bid="([^"]+)"[^>]*>/g)){
   const [,tag,id]=match,attrs=match[0];let value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';
   if(tag==='select'){
    const body=html.slice(match.index+attrs.length).split('</select>')[0],options=[...body.matchAll(/<option\b([^>]*)>/g)];
    const selected=options.find(o=>/\bselected\b/.test(o[1]))||options[0];value=selected?.[1].match(/\bvalue="([^"]*)"/)?.[1]||'';
   }
   let current=value,content='',children=[];
   const node={textContent:'',hidden:false,get value(){return current;},set value(v){current=String(v);},get innerHTML(){return content;},set innerHTML(v){children.forEach(key=>nodes.delete(key));content=v;children=parse(v);}};
   nodes.set(id,node);ids.push(id);
  }
  return ids;
 };
 parse(markup);return {querySelector:s=>nodes.get(s.slice(1))||null};
}
function fixture(receipts=[{id:'advance',amount:1900,kind:'materials',date:'2026-10-12'}]){
 const project=C.newProject('Test','Test'),item={id:'purchase',amount:2398,charge:2398,paid:false,paidAmount:0,date:'2026-10-06'};
 project.receipts=receipts;project.purchases=[item];const root=formSurface(),form=mount(root,project,item,[],()=>2398);
 const node=id=>root.querySelector('#'+id),choose=(id,value)=>{node(id).value=value;node(id).onchange();};
 return {project,item,form,node,choose,apply:()=>P.apply(project,item,form.read(),[])};
}
test('partial settlement with one earlier advance auto-fills 1900 against 2398 without adding money',()=>{
 const f=fixture();f.choose('purchase-payment-state','partial');f.choose('purchase-source-0','advance');
 assert.equal(f.node('purchase-document-0').value,'advance');assert.equal(f.node('purchase-value-0').value,'1900');assert.equal(f.node('purchase-date-0').value,'2026-10-12');assert.equal(f.form.read().state,'partial');assert.equal(f.node('purchase-payment-error').textContent,'');
 const next=f.apply();assert.equal(C.purchasePayment(next.purchases[0]).paid,1900);assert.equal(C.purchasePayment(next.purchases[0]).remaining,498);assert.equal(C.purchaseTotals(next).advances,1900);assert.equal(next.receipts.length,1);assert.equal(f.project.purchases[0].receiptPayments,undefined);
 // Filling the remainder may only take the available advance, never the full purchase price.
 f.node('purchase-rest-0').onclick();assert.equal(f.node('purchase-value-0').value,'1900');assert.equal(f.node('purchase-payment-error').textContent,'');
});
test('choosing among multiple advances fills the selected available balance and permits a Polish decimal amount',()=>{
 const f=fixture([{id:'one',amount:1900,kind:'materials',date:'2026-10-12'},{id:'two',amount:1000,kind:'materials',date:'2026-10-13'}]);
 f.choose('purchase-payment-state','partial');f.choose('purchase-source-0','advance');assert.equal(f.node('purchase-document-0').value,'');
 f.choose('purchase-document-0','one');assert.equal(f.node('purchase-value-0').value,'1900');
 f.node('purchase-value-0').value='1250,50';f.node('purchase-value-0').oninput();assert.equal(f.node('purchase-payment-error').textContent,'');assert.equal(f.apply().purchases[0].receiptPayments.one,1250.5);
 f.node('purchase-value-0').value='abc';f.node('purchase-value-0').oninput();assert.throws(f.apply,/prawidłową kwotę/);
 f.choose('purchase-document-0','two');assert.equal(f.node('purchase-value-0').value,'1000');assert.equal(f.node('purchase-date-0').value,'2026-10-13');
});
test('remaining amount respects other purchases using the advance and all other sources in the form',()=>{
 const f=fixture();f.project.purchases.push({id:'other',amount:400,charge:400,paid:false,paidAmount:0,receiptPayments:{advance:400}});
 // Remount after another purchase has used part of the advance.
 const root=formSurface(),form=mount(root,f.project,f.item,[],()=>2398),node=id=>root.querySelector('#'+id),choose=(id,v)=>{node(id).value=v;node(id).onchange();};
 choose('purchase-payment-state','partial');choose('purchase-source-0','advance');assert.equal(node('purchase-value-0').value,'1500');
 const next=P.apply(f.project,f.item,form.read(),[]);assert.equal(next.purchases[0].receiptPayments.advance,1500);assert.equal(C.purchaseTotals(next).advances,1900);
});
test('a sufficient advance sets full status and a later reduction sets partial status',()=>{
 const f=fixture([{id:'advance',amount:3000,kind:'materials',date:'2026-10-12'}]);f.choose('purchase-payment-state','partial');f.choose('purchase-source-0','advance');
 assert.equal(f.node('purchase-value-0').value,'2398');assert.equal(f.form.read().state,'full');assert.equal(C.purchasePayment(f.apply().purchases[0]).remaining,0);
 f.node('purchase-value-0').value='1900';f.node('purchase-value-0').oninput();assert.equal(f.form.read().state,'partial');assert.equal(C.purchasePayment(f.apply().purchases[0]).remaining,498);
});
