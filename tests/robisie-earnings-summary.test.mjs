import test from 'node:test';import assert from 'node:assert/strict';
import * as C from '../app/robisie/core.js';import {records,analyze,markup} from '../app/robisie/earnings-summary.js';
function project(id,date='2026-10-20',status='zakonczona'){const payload=C.newProject('Remont '+id,'Inwestor '+id);payload.status=status;payload.handover={date,accepted:true};payload.works=[{id:'w',qty:1,price:1000,included:true,done:true}];payload.purchases=[{id:'m',amount:200,charge:220,paid:false}];payload.receipts=[{id:'material',date,kind:'materials',amount:100},{id:'work',date,kind:'work',amount:500}];return {id,contract_number:'UUR/'+id,payload};}
const earning=(id,extra={})=>({id:'e-'+id,source_robisie_project_id:id,work_date:'2026-10-20',total_amount:'1000.00',my_amount:'650.00',employee_amount:'350.00',employee_paid:false,...extra});
test('only completed investments are counted once, with employee split and material cash separate',()=>{
 const rows=records([project('a'),project('b','2026-10-21','prace')],[earning('a'),earning('a'),earning('b'),{...earning('other'),source_robisie_project_id:null,my_amount:999999}]);const s=analyze(rows,{year:'2026',month:'10'});
 assert.equal(s.count,1);assert.equal(s.total,1000);assert.equal(s.mine,650);assert.equal(s.employee,350);assert.equal(s.unpaid,350);assert.equal(s.materials,220);assert.equal(s.materialReceived,100);assert.equal(s.received,500);assert.equal(s.average,650);
});
test('month/year filters follow completion date and include all twelve zero months; reopened entries are excluded',()=>{
 const rows=records([project('a'),project('b','2026-09-15'),project('old','2025-10-01'),project('open','2026-10-20','prace')],[earning('a'),earning('b',{employee_paid:true}),earning('old'),earning('open')]);
 const october=analyze(rows,{year:'2026',month:'10'});assert.equal(october.count,1);assert.equal(october.previous.count,1);assert.equal(october.yearChange,0);assert.equal(october.months.length,12);assert.equal(october.months[0].count,0);assert.equal(october.annual.count,2);assert.equal(analyze(rows,{year:'2025'}).count,1);assert.equal(analyze(rows,{year:'2026',month:'09'}).unpaid,0);
});
test('missing/invalid splits and dates are disclosed instead of inventing personal earnings or closure dates',()=>{
 const rows=records([project('no-split'),project('no-date',''),project('invalid')],[earning('invalid',{my_amount:1000,employee_amount:350})]);const s=analyze(rows,{year:'2026'});assert.equal(s.count,2);assert.equal(s.total,2000);assert.equal(s.mine,0);assert.equal(s.missing,2);assert.equal(s.average,null);assert.equal(s.undated.length,1);const html=markup(rows,{year:'2026'});assert.match(html,/Do uzupełnienia/);assert.match(html,/bez daty odbioru: 1/);assert(!html.includes('NaN'));
});
test('edited saved earnings remain intact and content is escaped',()=>{
 const p=project('a');p.payload.name='<img onerror="bad">';const rows=records([p],[earning('a',{total_amount:900,my_amount:600,employee_amount:300})]);const s=analyze(rows,{year:'2026'});assert.equal(s.changed,1);assert.equal(s.mine,600);const html=markup(rows,{year:'2026'});assert(html.includes('&lt;img onerror=&quot;bad&quot;&gt;'));assert(!html.includes('<img'));assert(html.includes('cf-earning-analytics-kpis'));assert(html.includes('data-action="earnings-project"'));
});
