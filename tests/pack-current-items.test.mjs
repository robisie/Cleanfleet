import test from 'node:test';
import assert from 'node:assert/strict';
import {currentItems,mountCurrentItems} from '../pack/current-items.js';
import {spanningLayout} from '../pack/tiles.js';
const now=new Date('2026-10-24T22:30:00Z'); // Warsaw: DST transition day, October 25.
test('washes cover exactly seven Warsaw dates and exclude completed and old work',()=>{
 const washes=['2026-10-24','2026-10-25','2026-10-31','2026-11-01'].map((date,i)=>({id:String(i),order_due_date:date}));
 washes.push({id:'done',order_due_date:'2026-10-25',wash_date:'2026-10-25'});
 washes.push({id:'scheduled',schedule_proposed_date:'2026-10-26',company_id:'c',plate:'ABC'});
 const items=currentItems([],washes,[],[{id:'c',name:'Firma'}],now);
 assert.deepEqual(items.map(x=>x.date),['2026-10-25','2026-10-26','2026-10-31']);
 assert.equal(items[1].detail,'Firma');
});
test('active reminders include overdue and distant future, respect snoozing, omit done',()=>{
 const reminders=[{id:'old',title:'Zaległe',status:'active',remind_at:'2026-10-24'}, {id:'done',status:'done',remind_at:'2026-10-25'}, {id:'future',status:'snoozed',remind_at:'2026-10-24',snoozed_until:'2027-01-01'}];
 const items=currentItems(reminders,[],[],[],now);
 assert.deepEqual(items.map(x=>x.reminderId),['old','future']);
 assert.equal(items[1].date,'2027-01-01');
});
test('investment feed includes actionable costs, acceptance and unpaid stages but excludes completed projects',()=>{
 const project={id:'p',payload:{name:'Dom',status:'odbior',endDate:'2026-10-30',offer:[{qty:1,price:100}],stages:[{id:'stage',name:'Etap',percent:100,due:'2026-10-24'}],changes:[{accepted:false}],purchases:[{amount:50,charge:50,paidAmount:0,invoiceRequired:true}]}};
 const rows=currentItems([],[],[project,{id:'closed',payload:{...project.payload,status:'zakonczona'}}],[],now);
 assert(rows.some(x=>x.detail==='Termin płatności: Etap'));
 assert(rows.some(x=>x.detail==='Inwestycja czeka na odbiór'));
 assert(rows.some(x=>x.detail==='Zakupy do rozliczenia: 1'));
 assert(rows.every(x=>x.url.includes('project=p')));
 project.payload.receipts=[{kind:'work',stageId:'stage',amount:100}];
 assert(!currentItems([],[],[project],[],now).some(x=>x.detail.startsWith('Termin płatności:')));
});
test('two-column feed reserves its full area on every grid size and shrinking restores preferred slots',()=>{
 const layout={feed:0,a:1,b:2,c:3,d:4};
 for(const cols of [2,3,6]){
  const sizes={feed:{columns:2,rows:4}},placed=spanningLayout(layout,sizes,cols),occupied=new Set();
  for(const [id,slot] of Object.entries(placed))for(let y=0;y<(sizes[id]?.rows||1);y++)for(let x=0;x<(sizes[id]?.columns||1);x++){
   const cell=slot+y*cols+x;assert(!occupied.has(cell));occupied.add(cell);
  }
  const smaller=spanningLayout(layout,{feed:{columns:2,rows:1}},cols);
  assert(smaller.a<=placed.a);if(cols===2)assert(smaller.a<placed.a);assert.equal(layout.a,1);
 }
 assert.equal(spanningLayout({feed:5},{feed:{columns:2,rows:1}},6).feed,4);
});
test('late server responses never restore a disposed feed',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const nodes=Object.fromEntries(['currentItems','currentCount','currentStatus','currentRefresh'].map(id=>[id,{textContent:'',replaceChildren(){this.cleared=true;}}]));
 const query={select(){return this},eq(){return this},in(){return this},is(){return this},or(){return this},order(){return this},async range(){await gate;return {data:[]}}};
 const panel=mountCurrentItems({from:()=>query},'owner',{hidden:false,getElementById:id=>nodes[id]},{});
 const waiting=panel.refresh();panel.dispose();release();await waiting;
 assert.equal(nodes.currentStatus.textContent,'');assert.equal(nodes.currentCount.textContent,'');
});
