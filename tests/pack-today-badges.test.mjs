import test from 'node:test';import assert from 'node:assert/strict';import {todayCounts,dateCounts,warsawDay,mountTodayBadges} from '../pack/today-badges.js';
const now=new Date('2026-10-26T11:30:00Z'),at='2026-10-26T08:00:00Z';
const reminder=(id,extra={})=>({id,status:'active',remind_at:at,due_at:at,...extra});
function setup(reminders=[],washes=[],{delay=null,error=false}={}){
 const nodes=Object.fromEntries(['packReminderToday','packReminderTomorrow','packReminderUpcoming','packCalendarToday','packCalendarTomorrow','packCalendarUpcoming'].map(id=>[id,{textContent:'old',hidden:false,attributes:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}}])),queries=[],callbacks=[];let cancelled=0,current=now;
 const db={from(table){const query={table,filters:[]};queries.push(query);return {select(fields){query.fields=fields;return this},eq(k,v){query.filters.push(['eq',k,v]);return this},in(k,v){query.filters.push(['in',k,v]);return this},is(k,v){query.filters.push(['is',k,v]);return this},or(v){query.filters.push(['or',v]);return this},order(){return this},async range(a,b){query.range=[a,b];if(delay)await delay;if(error)return {error:Error('Offline')};return {data:(table==='cf_reminders'?reminders:washes).slice(a,b+1)}}}}};
 const controller=mountTodayBadges(db,'owner',{hidden:false,getElementById:id=>nodes[id]},{clock:()=>current,schedule:fn=>{callbacks.push(fn);return callbacks.length},cancel:()=>cancelled++});
 return {controller,nodes,queries,callbacks,cancelled:()=>cancelled,day:value=>current=new Date(value)};
}
test('counts only today, excludes completed/cancelled and respects snoozing and calendar due dates',()=>{
 const reminders=[reminder('a'),reminder('b',{status:'done'}),reminder('c',{status:'cancelled'}),reminder('d',{remind_at:'2026-10-25T08:00:00Z'}),reminder('e',{status:'snoozed',snoozed_until:'2026-10-27T08:00:00Z'}),reminder('f',{due_at:'2026-10-27T08:00:00Z'}),reminder('invalid',{remind_at:null,due_at:null})];
 const washes=[{id:'w1',order_due_date:'2026-10-26'},{id:'w2',schedule_proposed_date:'2026-10-26'},{id:'w3',wash_date:'2026-10-26',order_due_date:'2026-10-26'},{id:'w4',order_due_date:'2026-10-27',schedule_proposed_date:'2026-10-26'}];
 assert.deepEqual(todayCounts(reminders,washes,now),{reminders:2,calendar:5});
});
test('Warsaw day includes midnight crossings and the DST transition',()=>{
 assert.equal(warsawDay('2026-10-25T23:30:00Z'),'2026-10-26');assert.equal(warsawDay('2026-10-24T22:30:00Z'),'2026-10-25');assert.equal(warsawDay('2026-10-26'),'2026-10-26');assert.equal(warsawDay('invalid'),'');
 assert.deepEqual(todayCounts([reminder('late',{remind_at:'2026-10-25T23:30:00Z',due_at:null})],[],now),{reminders:1,calendar:1});
});
test('dashboard loads all pages, scopes reminders to the verified owner and clears on logout',async()=>{
 const t=setup(Array.from({length:1001},(_,i)=>reminder(String(i))));await t.controller.refresh();assert.equal(t.nodes.packReminderToday.textContent,'1001');assert.equal(t.nodes.packCalendarToday.hidden,false);assert(t.queries.some(q=>q.range[0]===1000));for(const q of t.queries.filter(q=>q.table==='cf_reminders'))assert.deepEqual(q.filters[0],['eq','user_id','owner']);
 t.controller.dispose();assert(t.cancelled()>0);assert.equal(t.nodes.packReminderToday.hidden,true);assert.equal(t.nodes.packReminderToday.textContent,'');
});
test('late reads cannot repopulate badges after session disposal',async()=>{
 let release;const delay=new Promise(r=>release=r),t=setup([reminder('a')],[],{delay}),read=t.controller.refresh();t.controller.dispose();release();await read;assert.equal(t.nodes.packReminderToday.hidden,true);assert.equal(t.nodes.packReminderToday.textContent,'');
});
test('zero/error badges stay hidden and the timer recomputes the current date',async()=>{
 const empty=setup();await empty.controller.refresh();assert.equal(empty.nodes.packReminderToday.hidden,true);empty.controller.dispose();const failed=setup([],[],{error:true});await failed.controller.refresh();assert.equal(failed.nodes.packCalendarToday.hidden,true);failed.controller.dispose();
 const t=setup([reminder('a')]);await t.controller.refresh();assert.equal(t.nodes.packReminderToday.hidden,false);t.day('2026-10-27T11:00:00Z');await t.controller.refresh();assert.equal(t.nodes.packReminderToday.hidden,true);t.controller.dispose();
});

test('date groups are exclusive: today, tomorrow and all later dates',()=>{
 const reminders=['2026-10-26','2026-10-27','2026-10-28','2027-01-01','2026-10-25'].map((day,i)=>reminder(String(i),{remind_at:day,due_at:day}));reminders.push(reminder('done',{status:'done',remind_at:'2027-01-02',due_at:'2027-01-02'}));
 const washes=[{order_due_date:'2026-10-27'},{schedule_proposed_date:'2026-10-30'},{order_due_date:'2026-10-28',wash_date:'2026-10-25'}];
 assert.deepEqual(dateCounts(reminders,washes,now),{reminders:{today:1,tomorrow:1,upcoming:2},calendar:{today:1,tomorrow:2,upcoming:3}});
});
test('tomorrow follows Warsaw calendar days across DST and New Year',()=>{
 const r=reminder('dst',{remind_at:'2026-10-25T23:30:00Z',due_at:null});assert.deepEqual(dateCounts([r],[],new Date('2026-10-24T23:30:00Z')).reminders,{today:0,tomorrow:1,upcoming:0});
 const rows=[reminder('new-year',{remind_at:'2027-01-01',due_at:null}),reminder('later',{remind_at:'2027-01-02',due_at:null})];assert.deepEqual(dateCounts(rows,[],new Date('2026-12-31T12:00:00Z')).reminders,{today:0,tomorrow:1,upcoming:1});
});
test('all three badges update and are cleared together',async()=>{
 const rows=['2026-10-26','2026-10-27','2026-10-28'].map((day,i)=>reminder(String(i),{remind_at:day,due_at:day})),t=setup(rows);await t.controller.refresh();
 for(const id of Object.keys(t.nodes)){assert.equal(t.nodes[id].hidden,false);assert.equal(t.nodes[id].textContent,'1');}assert.match(t.nodes.packReminderTomorrow.attributes['aria-label'],/Jutro/);assert.match(t.nodes.packCalendarUpcoming.attributes.title,/Nadchodzące/);
 t.controller.dispose();for(const node of Object.values(t.nodes)){assert.equal(node.hidden,true);assert.equal(node.textContent,'');}
});
