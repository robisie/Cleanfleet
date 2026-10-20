import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';
import * as F from '../app/robisie/purchase-settlement-form.js';
function form(){
 const p=C.newProject('Test','Test');p.purchases=[{id:'p',date:'2026-10-01',amount:2398,charge:2398,paid:false,paidAmount:0}];p.receipts=[{id:'a',kind:'materials',amount:1900,date:'2026-10-02'}];
 const documents=[{id:'f',number:'A1',status:'issued',payload:{currency:'PLN',issueDate:'2026-10-03',lines:[{qty:'1',price:'1900'}]}}],html=F.markup(p,documents),nodes=new Map();
 for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))nodes.set(match[1],{value:match[0].match(/\bvalue="([^"]*)"/)?.[1]||'',checked:false,innerHTML:'',textContent:''});
 const root={querySelector:key=>nodes.get(key.slice(1))||null},mounted=F.mount(root,p,documents),node=id=>nodes.get(id);return {p,mounted,node,html};
}
test('bulk form previews saved funds, then links their invoice without creating another inflow',()=>{
 const f=form();assert.match(f.html,/Rozliczenie|rozliczenia/);assert.equal(f.p.purchases[0].receiptPayments,undefined);
 f.node('bulk-select-available').onclick();assert.equal(f.mounted.read().allocated,1900);assert.match(f.node('bulk-preview').innerHTML,/498,00/);
 f.node('bulk-link-1-0').checked=true;f.node('bulk-link-1-0').onchange();
 const result=f.mounted.read();assert.equal(result.allocated,1900);assert.equal(result.newMoney,0);assert.equal(result.project.receipts.length,1);assert.equal(result.project.invoiceSettlements[0].existingReceipts[0].id,'a');assert.equal(f.node('bulk-error').textContent,'');
});
test('additional invoice money requires explicit entry and selection; invalid overlap blocks submission',()=>{
 const f=form();f.node('bulk-new-1').value='498,00';f.node('bulk-new-1').oninput();assert.equal(f.mounted.read().newMoney,498);assert.equal(f.mounted.read().allocated,498);
 f.node('bulk-source-0').checked=true;f.node('bulk-source-0').onchange();assert.equal(f.mounted.read().allocated,2398);assert.equal(f.mounted.read().unallocated,0);
 f.node('bulk-link-1-0').checked=true;f.node('bulk-link-1-0').onchange();assert.ok(f.node('bulk-error').textContent);assert.throws(()=>f.mounted.read());
});
test('preview is invalidated when a source is deselected and cannot be saved from a stale result',()=>{
 const f=form();f.node('bulk-select-available').onclick();assert.equal(f.mounted.read().allocated,1900);f.node('bulk-source-0').checked=false;f.node('bulk-source-0').onchange();assert.throws(()=>f.mounted.read());assert.match(f.node('bulk-preview').innerHTML,/Zaznacz źródła/);
});
