const test=require('node:test'),assert=require('node:assert/strict');
const {reconcile,cents,numberIn,render}=require('../app/accounting-reconcile.js');
const month='2026-08',iban='50114020040000360276034397';
const invoice=(overrides={})=>({number:'FV/2026/081',nrKSeF:'5265877635-20260802-123456789ABC-AB',seller:'ABC Serwis',gross:'123.45',currency:'PLN',date:'2026-08-02',type:'VAT',accounts:[iban],...overrides});
const op=(overrides={})=>({booked:'2026-08-05',amount:-12345n,party:'ABC Serwis',title:'Zapłata FV/2026/081',description:'PRZELEW',counterAccount:iban,...overrides});
function result(invoices,operations,extra={}){return reconcile({month,purchases:{month,count:invoices.length,invoices},bankResults:[{month,statement:{account:iban,currency:'PLN',operations}}],...extra});}
test('unique amount/currency and identifying details match; incoming transfers excluded',()=>{
 const r=result([invoice()],[op(),op({amount:12345n})]);assert.equal(r.rows.length,1);assert.equal(r.counts.matched,1);assert.equal(r.unmatchedInvoices.length,0);assert.match(r.rows[0].reason,/numer faktury/);
});
test('amount alone, several candidates, repeated payment, operators and installments remain uncertain',()=>{
 assert.equal(result([invoice({accounts:[]})],[op({party:'Someone',title:'Purchase',counterAccount:''})]).counts.uncertain,1);
 assert.equal(result([invoice(),invoice({number:'FV/2026/082',nrKSeF:'5265877635-20260802-223456789ABC-AB'})],[op({title:'Purchase'})]).counts.uncertain,1);
 const duplicate=result([invoice()],[op(),op()]);assert.equal(duplicate.counts.matched,0);assert.equal(duplicate.counts.uncertain,2);assert.equal(duplicate.unmatchedInvoices.length,1);
 assert.equal(result([invoice()],[op({party:'PAYU Allegro'})]).counts.uncertain,1);
 assert.equal(result([invoice()],[op({amount:-5000n})]).counts.uncertain,1);
 assert.equal(result([invoice({currency:'EUR'})],[op()]).counts.uncertain,1);
 assert.equal(result([invoice({date:'2026-08-20'})],[op()]).counts.uncertain,1);
 assert.equal(result([invoice({type:'KOR',gross:'-123.45'})],[op()]).counts.uncertain,1);
});
test('unknown expense stays for review; tax and fees shown separately, not treated as missing invoices',()=>{
 const r=result([],[op({title:'Purchase'}),op({party:'ZUS',title:'Składki'}),op({description:'OPŁATA ZA PROWADZENIE RACHUNKU',title:'Fee'})]);assert.equal(r.counts.review,1);assert.equal(r.counts.other,2);assert.equal(result([],[op({description:'PRZELEW WŁASNY'})]).counts.other,1);
});
test('missing, stale and incomplete inputs never yield a misleading all-clear',()=>{
 assert.match(reconcile({month}).warnings.join(' '),/Brak przekonwertowanego.*Nie pobrano/);
 const r=result([invoice()],[op()],{purchases:{month,count:2,invoices:[invoice()]}});assert.equal(r.counts.matched,0);assert.match(r.warnings.join(' '),/ponownie/);
 const stale=result([invoice()],[op()],{purchases:{month:'2026-07',count:1,invoices:[invoice()]}});assert.equal(stale.counts.matched,0);assert.ok(stale.warnings.length);
 assert.equal(result([invoice()],[op({amount:-12344n,title:'Other',party:'Other',counterAccount:''})]).counts.review,1);
});
test('cents use exact arithmetic and invoice numbers require full boundaries',()=>{
 assert.equal(cents('9007199254740993.01'),900719925474099301n);assert.equal(cents('0,10'),10n);assert.equal(cents('bad'),null);assert.equal(cents('123.456'),null);
 assert.equal(numberIn('Zapłata FV/2026/081','FV/2026/081'),true);assert.equal(numberIn('FV/2026/0810','FV/2026/081'),false);assert.equal(numberIn('FV/2026/081/extra','FV/2026/081'),false);assert.equal(numberIn('payment 1','1'),false);
});
test('render treats invoice and bank text as text, including HTML-looking descriptions',()=>{
 const nodes=[];const dom=require('./accounting-dom.cjs');global.document={createElement:tag=>{const node=new dom.Node(tag);nodes.push(node);return node;}};
 const root={replaceChildren(){},appendChild(){}};render(root,result([invoice()],[op({title:'<img onerror=alert(1)>',party:'Unknown',counterAccount:''})]));assert.ok(nodes.some(n=>String(n.textContent).includes('<img onerror')));assert.ok(nodes.every(n=>n.innerHTML===undefined));
});
