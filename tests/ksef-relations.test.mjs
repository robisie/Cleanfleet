import test from 'node:test';
import assert from 'node:assert/strict';
import {relatedGroups,historyRanges} from '../bill/ksef-relations.js';
import {stockMarkup} from '../bill/stock.js';
const row=(id,date,type='Vat',seller='1111111111')=>({ksefNumber:id,invoiceNumber:id,issueDate:date,invoiceType:type,seller:{nip:seller,name:'Sklep'},grossAmount:100,currency:'PLN'});
const a=row('original','2026-01-10'),b=row('correction','2026-04-10','Kor'),c=row('correction2','2026-06-10','Kor');
const docs=[{metadata:a},{metadata:b,references:[{ksefNumber:a.ksefNumber}]},{metadata:c,references:[{ksefNumber:a.ksefNumber}]}];
test('original month shows original and all future corrections; correction month reverses order',()=>{
 let [group]=relatedGroups([a],docs);assert.equal(group.anchor.ksefNumber,'original');assert.deepEqual(group.children.map(r=>r.ksefNumber),['correction','correction2']);assert.ok(group.children.every(r=>r.outsidePeriod));
 [group]=relatedGroups([b],docs);assert.equal(group.anchor.ksefNumber,'correction');assert.equal(group.children[0].ksefNumber,'original');assert.ok(group.children[0].outsidePeriod);
});
test('same period anchors original once, including an original on another loaded metadata page',()=>{
 const same={...a,issueDate:'2026-04-01'},index=[{metadata:same},docs[1],docs[2]];
 const groups=relatedGroups([b,same],index);assert.equal(groups.length,1);assert.equal(groups[0].anchor.ksefNumber,'original');assert.equal(groups[0].children[0].outsidePeriod,false);
 const [paged]=relatedGroups([b],index,{from:'2026-04-01',to:'2026-04-30'});assert.equal(paged.anchor.ksefNumber,'original');assert.equal(paged.children[0].outsidePeriod,false);
});
test('search keeps a correction family together and unrelated matches stay separate',()=>{
 const unrelated=row('other','2026-01-20');const groups=relatedGroups([a,b,unrelated],docs,{q:'correction'});assert.equal(groups.length,1);assert.equal(groups[0].anchor.ksefNumber,'original');assert.equal(groups[0].children.length,2);
 assert.equal(relatedGroups([a,unrelated],docs).length,2);
});
test('printed reference needs exact number, date and supplier; explicit references ignore case',()=>{
 const ref={metadata:b,references:[{number:'original',issueDate:a.issueDate}]};assert.equal(relatedGroups([b],[{metadata:a},ref])[0].children.length,1);
 assert.equal(relatedGroups([b],[{metadata:{...a,seller:{nip:'other'}}},ref])[0].children.length,0);
 ref.references[0].issueDate='2026-01-11';assert.equal(relatedGroups([b],[{metadata:a},ref])[0].children.length,0);
 assert.equal(relatedGroups([b],[{metadata:a},{metadata:b,references:[{ksefNumber:'ORIGINAL'}]}])[0].children.length,1);
});
test('multiple referenced invoices form one group; circular references terminate',()=>{
 const original2=row('second','2026-01-11');const index=[...docs,{metadata:original2}];index[1]={metadata:b,references:[{ksefNumber:'original'},{ksefNumber:'second'}]};const g=relatedGroups([b],index);assert.equal(g.length,1);assert.equal(g[0].children.length,3);
 assert.equal(relatedGroups([b],[{metadata:b,references:[{ksefNumber:'correction2'}]},{metadata:c,references:[{ksefNumber:'correction'}]}]).length,1);
});
test('history intervals cover every day including DST and leap days without gaps or exceeding 99 days',()=>{
 const ranges=historyRanges('2024-01-01','2026-10-23');assert.equal(ranges[0].from,'2024-01-01');assert.equal(ranges.at(-1).to,'2026-10-23');for(const [i,r]of ranges.entries()){assert.ok((Date.parse(r.to)-Date.parse(r.from))/86400000<=98);if(i)assert.equal((Date.parse(r.from)-Date.parse(ranges[i-1].to))/86400000,1);}
});
test('stock markup escapes product and source, exposes available quantities, cost and actions',()=>{
 const html=stockMarkup([{metadata:a,item:{index:1,name:'<script>',unit:'szt.',gross:400},capacity:4,assigned:2,manualReturned:1,correctedReturned:1,returned:1,available:1}]);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.match(html,/Pozostało: 1/);assert.match(html,/100,00/);assert.match(html,/Przypisz do inwestycji/);assert.match(html,/Cofnij ręczny zwrot/);
});
