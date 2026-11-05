import {warsawDay} from './today-badges.js?v=2';
import {totals, effectiveReceipts, purchaseNeedsInvoice, purchasePayment, number} from '../app/robisie/core.js?v=1.0.109';

export function currentItems(reminders, washes, projects, companies = [], now = new Date()) {
 const today = warsawDay(now);
 const limit = new Date(today + 'T12:00:00Z');
 limit.setUTCDate(limit.getUTCDate() + 6);
 const lastDay = limit.toISOString().slice(0,10);
 const names = new Map(companies.map(company => [company.id, company.short_name || company.name]));
 const items = [];
 for (const wash of washes) {
  const day = warsawDay(wash.order_due_date || wash.schedule_proposed_date || 'invalid');
  if (wash.wash_date || !day || day < today || day > lastDay) continue;
  items.push({kind:'Pranie', title: wash.plate || 'Pojazd', date:day,
   detail:[names.get(wash.company_id), wash.type].filter(Boolean).join(' · '),
   url:'/app/?cfOpenRecord=' + encodeURIComponent(wash.id), priority:1});
 }
 for (const reminder of reminders) {
  if (!['active','snoozed'].includes(reminder.status)) continue;
  const at = reminder.status === 'snoozed' && reminder.snoozed_until ? reminder.snoozed_until : reminder.remind_at;
  const day = warsawDay(at || reminder.due_at || 'invalid');
  items.push({kind:'Przypomnienie', title:reminder.title || 'Przypomnienie', date:day,
   detail: reminder.notes || '', module:'reminders', reminderId:reminder.id,
   priority:reminder.priority === 'high' ? 0 : 1});
 }
 for (const project of projects) {
  const data = project.payload || {};
  if (data.status === 'zakonczona') continue;
  const url = '/app/robisie/?project=' + encodeURIComponent(project.id);
  const add = (detail, date = '', priority = 1) => items.push({
   kind:'Inwestycja', title:data.name || project.contract_number || 'Inwestycja', detail, date, url, priority,
  });
  if (data.status === 'odbior') add('Inwestycja czeka na odbiór');
  if (data.endDate) add('Termin zakończenia prac', data.endDate);
  if (data.startDate && data.startDate >= today && ['przygotowanie','oferta'].includes(data.status)) add('Rozpoczęcie prac', data.startDate);
  if ((data.changes || []).some(change => !change.accepted)) add('Zmiany zakresu czekają na akceptację');
  const purchases = data.purchases || [];
  const missing = purchases.filter(purchaseNeedsInvoice).length;
  if (missing) add('Zakupy wymagające faktury: ' + missing);
  const unsettled = purchases.filter(item => purchasePayment(item).remaining > .005).length;
  if (unsettled) add('Zakupy do rozliczenia: ' + unsettled);
  const datedStages = (data.stages || []).filter(stage => stage.due);
  if (datedStages.length) {
   const agreed = totals(data).agreed;
   const receipts = effectiveReceipts(data);
   for (const stage of datedStages) {
    const paid = receipts.filter(receipt => receipt.kind === 'work' && receipt.stageId === stage.id)
     .reduce((sum, receipt) => sum + number(receipt.amount), 0);
    if (paid + .01 < agreed * number(stage.percent) / 100) add('Termin płatności: ' + stage.name, stage.due);
   }
  }
 }
 const rank = item => item.date && item.date < today ? 0 : item.date === today ? 1 : item.priority === 0 ? 2 : 3;
 return items.sort((a,b) => rank(a) - rank(b) || (a.date || '9999').localeCompare(b.date || '9999') ||
  a.priority - b.priority || a.title.localeCompare(b.title,'pl'));
}

async function readPages(makeQuery) {
 const rows=[];
 for (let offset=0;;offset+=500) {
  const {data,error}=await makeQuery().order('id').range(offset,offset+499);
  if(error)throw error;
  rows.push(...(data || []));
  if(!data || data.length<500)return rows;
 }
}

export function mountCurrentItems(db, owner, document, {openModule, openApplicationLink}) {
 const host=document.getElementById('currentItems');
 const message=document.getElementById('currentStatus');
 const count=document.getElementById('currentCount');
 let disposed=false, generation=0, pending=null, paused=false, again=false;
 function clear() {host.replaceChildren();count.textContent='';}
 async function refresh() {
  if(disposed || paused || document.hidden)return;
  if(pending){again=true;return pending;}
  const run=++generation;
  pending=(async()=>{
   const results=await Promise.allSettled([
    readPages(()=>db.from('cf_reminders').select('id,title,notes,status,priority,remind_at,snoozed_until,due_at').eq('user_id',owner).in('status',['active','snoozed'])),
    readPages(()=>db.from('wash_records').select('id,company_id,plate,type,wash_date,order_due_date,schedule_proposed_date').is('wash_date',null).or('order_due_date.not.is.null,schedule_proposed_date.not.is.null')),
    readPages(()=>db.from('rs_projects').select('id,contract_number,payload').eq('owner_id',owner)),
    readPages(()=>db.from('companies').select('id,name,short_name')),
   ]);
   if(disposed || paused || run!==generation)return;
   const failed=results.slice(0,3).map((r,i)=>r.status==='rejected'?['przypomnień','prań','inwestycji'][i]:'').filter(Boolean);
   const values=results.map(result=>result.status==='fulfilled'?result.value:[]);
   const rows=currentItems(...values);
   clear();
   count.textContent=String(rows.length);
   message.textContent=failed.length?'Nie udało się pobrać '+failed.join(', ')+'. Spróbuj odświeżyć.':
    rows.length?'Prania na najbliższe 7 dni, przypomnienia i sprawy inwestycji.':'Brak bieżących spraw.';
   const today=warsawDay();
   for(const item of rows) {
    const button=document.createElement('button');
    button.type='button';button.className='current-item';
    button.dataset.kind=item.kind;
    const top=document.createElement('span');top.className='current-item-top';
    const kind=document.createElement('small');kind.textContent=item.kind;
    const date=document.createElement('small');
    date.textContent=item.date?(item.date===today?'Dzisiaj':item.date.split('-').reverse().join('.'))+(item.date<today?' · po terminie':''):'Do sprawdzenia';
    if(item.date && item.date<today)date.className='current-overdue';
    top.append(kind,date);
    const title=document.createElement('strong');title.textContent=item.title;
    button.append(top,title);
    if(item.detail){const detail=document.createElement('span');detail.className='current-detail';detail.textContent=item.detail;button.append(detail);}
    button.onclick=()=> {
     const task=item.module ? openModule(item.module) : openApplicationLink(new URL(item.url,location.origin));
     Promise.resolve(task).catch(()=>{message.textContent='Nie udało się otworzyć wpisu. Spróbuj ponownie.';});
    };
    host.append(button);
   }
  })().catch(()=>{if(!disposed && run===generation){clear();message.textContent='Nie udało się pobrać bieżących spraw.';}})
   .finally(()=>{pending=null;if(again&&!disposed&&!paused){again=false;void refresh();}});
  return pending;
 }
 const retry=document.getElementById('currentRefresh');
 retry.onclick=()=>void refresh();
 const timer=setInterval(()=>void refresh(),60000);
 void refresh();
 return {refresh,pause(){paused=true;generation++;clear();message.textContent='Ładowanie bieżących spraw…';},
  resume(){paused=false;void refresh();},
  dispose(){disposed=true;generation++;clearInterval(timer);clear();message.textContent='';retry.onclick=null;}};
}
