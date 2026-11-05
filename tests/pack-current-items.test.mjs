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
test('reminders cover today and next two days including snoozing, with no overdue or distant items',()=>{
 const reminders=['2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28'].map((day,i)=>({id:String(i),status:'active',remind_at:day}));
 reminders.push({id:'done',status:'done',remind_at:'2026-10-25'});
 reminders.push({id:'snoozed',status:'snoozed',remind_at:'2026-10-24',snoozed_until:'2026-10-26T23:30:00Z'});
 reminders.push({id:'invalid',status:'active'});
 const items=currentItems(reminders,[],[],[],now);
 assert.deepEqual(items.map(x=>x.reminderId),['1','2','3','snoozed']);
 assert.equal(items.at(-1).date,'2026-10-27');
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
test('category lists start collapsed and keep the user choice after a server refresh',async()=>{
 function element(tag='div'){
  return {tag,children:[],dataset:{},listeners:{},open:false,textContent:'',parent:null,
   get isConnected(){return this.connected||!!this.parent?.isConnected},
   append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}},
   replaceChildren(){for(const node of this.children)node.parent=null;this.children=[]},
   addEventListener(event,fn){this.listeners[event]=fn}};
 }
 const nodes=Object.fromEntries(['currentItems','currentCount','currentStatus','currentRefresh'].map(id=>[id,element()]));nodes.currentItems.connected=true;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());
 const query=table=>({select(){return this},eq(){return this},in(){return this},is(){return this},or(){return this},order(){return this},async range(){return {data:table==='cf_reminders'?[{id:'r',title:'Termin',status:'active',remind_at:today}]:[]}}});
 const panel=mountCurrentItems({from:query},'owner',{hidden:false,getElementById:id=>nodes[id],createElement:element},{});
 try{
  await panel.refresh();await new Promise(setImmediate);
  const groups=nodes.currentItems.children;
  assert.deepEqual(groups.map(group=>group.children[0].children[0].textContent),['Przypomnienia','Prania','Inwestycje']);
  assert(groups.every(group=>group.open===false));
  assert.equal(groups[0].children[0].children[1].textContent,'1');
  groups[0].open=true;groups[0].listeners.toggle();
  await panel.refresh();
  assert.equal(nodes.currentItems.children[0].open,true);
  assert.equal(nodes.currentItems.children[1].open,false);
  nodes.currentItems.children[0].open=false;nodes.currentItems.children[0].listeners.toggle();
  await panel.refresh();assert.equal(nodes.currentItems.children[0].open,false);
 }finally{panel.dispose();}
});
