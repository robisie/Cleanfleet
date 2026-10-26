/* Read-only dashboard counts; uses the authenticated Pack client and existing RLS. */
export function warsawDay(value=new Date()){
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value);
 const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(date);
}
export function todayCounts(reminders,washes,now=new Date()){
 const today=warsawDay(now),active=reminders.filter(r=>['active','snoozed'].includes(r.status));
 const reminderAt=r=>r.status==='snoozed'&&r.snoozed_until?r.snoozed_until:r.remind_at;
 return {reminders:active.filter(r=>warsawDay(reminderAt(r)||'invalid')===today).length,
 calendar:active.filter(r=>warsawDay(r.due_at||reminderAt(r)||'invalid')===today).length+washes.filter(w=>!w.wash_date&&warsawDay(w.order_due_date||w.schedule_proposed_date||'invalid')===today).length};
}
async function pages(makeQuery){
 const rows=[];for(let offset=0;;offset+=500){const {data,error}=await makeQuery().order('id',{ascending:true}).range(offset,offset+499);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<500)return rows;}
}
export function mountTodayBadges(db,owner,document,{clock=()=>new Date(),schedule=setInterval,cancel=clearInterval}={}){
 const nodes={reminders:document.getElementById('packReminderToday'),calendar:document.getElementById('packCalendarToday')};let disposed=false,generation=0,pending=null,again=false,timer=null;
 const hide=()=>{for(const node of Object.values(nodes))if(node){node.hidden=true;node.textContent='';node.removeAttribute('aria-label');node.removeAttribute('title');}};
 function show(counts){for(const [kind,node] of Object.entries(nodes))if(node){const count=counts[kind],label=`Dzisiaj: ${count} ${kind==='calendar'?'zdarzeń w kalendarzu':'przypomnień'}`;node.textContent=String(count);node.hidden=count===0;node.setAttribute('aria-label',label);node.setAttribute('title',label);}}
 async function refresh(){
  if(disposed||document.hidden)return;if(pending){again=true;return pending;}const run=++generation;
  pending=(async()=>{try{
   const [reminders,washes]=await Promise.all([
    pages(()=>db.from('cf_reminders').select('id,status,remind_at,snoozed_until,due_at').eq('user_id',owner).in('status',['active','snoozed'])),
    pages(()=>db.from('wash_records').select('id,wash_date,order_due_date,schedule_proposed_date').is('wash_date',null).or('order_due_date.not.is.null,schedule_proposed_date.not.is.null'))
   ]);
   if(!disposed&&run===generation)show(todayCounts(reminders,washes,clock()));
  }catch{if(!disposed&&run===generation)hide();}finally{pending=null;if(again&&!disposed){again=false;void refresh();}}})();return pending;
 }
 function pause(){if(timer!=null)cancel(timer);timer=null;generation++;again=false;hide();}
 function resume(){if(disposed)return;if(timer==null)timer=schedule(()=>{void refresh();},60000);void refresh();}
 hide();resume();return {refresh,pause,resume,dispose(){disposed=true;pause();}};
}
