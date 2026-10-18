/* Existing CleanFleet reminder renderer and actions, hosted by Pack. */
const CF_REMINDER_CATEGORIES = {
  private:'Prywatne',
  fleet:'Flota',
  client:'Klient',
  invoice:'Faktura',
  purchase:'Zakup',
  phone:'Telefon',
  other:'Inne'
};

function cfReminderCategoryLabel(key){ return CF_REMINDER_CATEGORIES[key] || 'Inne'; }
function cfReminderPriorityLabel(key){ return ({low:'Niski',normal:'Normalny',high:'Wysoki'})[key] || 'Normalny'; }

function cfReminderLocalParts(iso){
  const d=iso ? new Date(iso) : new Date(Date.now()+3600000);
  if(Number.isNaN(d.getTime())) return {date:'',time:''};
  const pad=n=>String(n).padStart(2,'0');
  return {
    date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    time:`${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}
function cfReminderIso(date,time){
  if(!date) return null;
  const d=new Date(`${date}T${time||'09:00'}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function cfReminderFmtDateTime(iso){
  if(!iso) return '—';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function cfReminderMoney(v){
  if(v===null || v===undefined || v==='') return '';
  return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(v)||0);
}
function cfReminderEffectiveAt(r){
  return r.status==='snoozed' && r.snoozed_until ? r.snoozed_until : r.remind_at;
}
function cfReminderBucket(r, now=new Date()){
  if(r.status==='done' || r.status==='cancelled') return 'done';
  const at=new Date(cfReminderEffectiveAt(r));
  if(Number.isNaN(at.getTime())) return 'upcoming';
  const dayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const nextDay=new Date(dayStart); nextDay.setDate(nextDay.getDate()+1);
  if(at < now) return 'overdue';
  if(at < nextDay) return 'today';
  return 'upcoming';
}
function cfReminderNextOccurrence(iso, recurrence){
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return null;
  if(recurrence==='daily') d.setDate(d.getDate()+1);
  else if(recurrence==='weekly') d.setDate(d.getDate()+7);
  else if(recurrence==='monthly') d.setMonth(d.getMonth()+1);
  else return null;
  return d.toISOString();
}

function cfReminderCalcRemindAt(dueAt, mode, customAt){
  if(!dueAt) return null;
  const due=new Date(dueAt);
  if(Number.isNaN(due.getTime())) return null;
  if(mode==='custom') return customAt || due.toISOString();
  const days=mode==='day_1'?1:mode==='day_2'?2:mode==='day_3'?3:0;
  if(days) due.setDate(due.getDate()-days);
  return due.toISOString();
}
function cfReminderAdvanceIso(iso, recurrence){
  if(!iso) return null;
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())) return null;
  if(recurrence==='daily') d.setDate(d.getDate()+1);
  else if(recurrence==='weekly') d.setDate(d.getDate()+7);
  else if(recurrence==='monthly') d.setMonth(d.getMonth()+1);
  else return null;
  return d.toISOString();
}

async function cfRefreshReminderTileCount(){
  if(!cfIsAdmin()) return;
  const badge=document.getElementById('cfReminderTileBadge');
  if(!badge) return;
  try{
    const {data,error}=await cfSupabase.from('cf_reminders')
      .select('id,status,remind_at,snoozed_until')
      .in('status',['active','snoozed']);
    if(error) throw error;
    const count=(data||[]).filter(r=>['today','overdue'].includes(cfReminderBucket(r))).length;
    badge.textContent=String(count);
    badge.hidden=count===0;
  }catch(e){
    console.warn('Reminder tile count:',e);
  }
}

async function cfShowReminders(){
  if(!cfIsAdmin()) return;
  const root=document.getElementById('modalRoot');
  root.innerHTML=`<div class="overlay" id="cfRemindersOverlay">
    <div class="sheet cf-reminders-sheet">
      <button class="close" data-close type="button">&times;</button>
      <div class="cf-reminders-head">
        <div>
          <h2>Przypomnienia</h2>
          <div class="confirm-text">Prywatne płatności, terminy i zadania w jednym miejscu.</div>
        </div>
        <button type="button" class="btn btn-solid" id="cfReminderAddBtn">+ Dodaj przypomnienie</button>
      </div>
      <div class="cf-reminder-summary" id="cfReminderSummary"></div>
      <div class="cf-reminder-tabs" id="cfReminderTabs">
        <button type="button" data-reminder-tab="today" class="active">Dzisiaj <span>0</span></button>
        <button type="button" data-reminder-tab="overdue">Zaległe <span>0</span></button>
        <button type="button" data-reminder-tab="upcoming">Nadchodzące <span>0</span></button>
        <button type="button" data-reminder-tab="done">Zakończone <span>0</span></button>
      </div>
      <div class="cf-reminder-toolbar">
        <select id="cfReminderCategoryFilter">
          <option value="">Wszystkie kategorie</option>
          ${Object.entries(CF_REMINDER_CATEGORIES).map(([k,v])=>`<option value="${k}">${escapeHtml(v)}</option>`).join('')}
        </select>
        <select id="cfReminderPaymentFilter">
          <option value="">Wszystkie</option>
          <option value="payment">Tylko płatności</option>
          <option value="task">Bez płatności</option>
        </select>
      </div>
      <div id="cfReminderList"><div class="cf-statistics-loading">Ładowanie przypomnień…</div></div>
    </div>
  </div>`;

  const overlay=document.getElementById('cfRemindersOverlay');
  const close=()=>{root.innerHTML='';};
  overlay?.querySelector('[data-close]')?.addEventListener('click',close);
  overlay?.addEventListener('click',e=>{if(e.target===overlay) close();});

  let rows=[];
  window.cfRefreshPackReminders=()=>load();
  let activeTab='today';

  const load=async()=>{
    const {data,error}=await cfSupabase.from('cf_reminders')
      .select('*')
      .order('remind_at',{ascending:true});
    if(error) throw error;
    if(!cfIsAdmin())return;
    rows=data||[];
    render();
    cfRefreshReminderTileCount();
  };

  const render=()=>{
    const now=new Date();
    const buckets={today:[],overdue:[],upcoming:[],done:[]};
    rows.forEach(r=>buckets[cfReminderBucket(r,now)].push(r));

    document.querySelectorAll('#cfReminderTabs [data-reminder-tab]').forEach(btn=>{
      const key=btn.dataset.reminderTab;
      btn.classList.toggle('active',key===activeTab);
      const span=btn.querySelector('span');
      if(span) span.textContent=String(buckets[key]?.length||0);
    });

    const activeCount=buckets.today.length+buckets.overdue.length+buckets.upcoming.length;
    const activePayments=[...buckets.today,...buckets.overdue,...buckets.upcoming].filter(r=>r.is_payment);
    const isCurrentMonthPayment=(r)=>{
      const raw=r?.due_at || r?.remind_at;
      if(!raw) return false;
      const dt=new Date(raw);
      if(Number.isNaN(dt.getTime())) return false;
      return dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth();
    };
    const paymentDue=activePayments.filter(isCurrentMonthPayment);
    const paymentSum=paymentDue.reduce((s,r)=>s+(Number(r.amount)||0),0);
    const summary=document.getElementById('cfReminderSummary');
    if(summary) summary.innerHTML=`
      <div><span>Aktywne</span><strong>${activeCount}</strong></div>
      <div><span>Dzisiaj</span><strong>${buckets.today.length}</strong></div>
      <div><span>Zaległe</span><strong>${buckets.overdue.length}</strong></div>
      <div><span>Płatności w tym miesiącu</span><strong>${paymentDue.length}</strong><small>${paymentDue.length?cfReminderMoney(paymentSum):'—'}</small></div>`;

    const cat=document.getElementById('cfReminderCategoryFilter')?.value||'';
    const payment=document.getElementById('cfReminderPaymentFilter')?.value||'';
    const filtered=(buckets[activeTab]||[]).filter(r=>
      (!cat || r.category===cat) &&
      (!payment || (payment==='payment' ? r.is_payment : !r.is_payment))
    );

    const list=document.getElementById('cfReminderList');
    if(!list) return;
    if(!filtered.length){
      list.innerHTML='<div class="empty-state">Brak przypomnień w tym widoku.</div>';
      return;
    }

    list.innerHTML=`<div class="cf-reminder-list">${filtered.map(r=>{
      const at=cfReminderEffectiveAt(r);
      const bucket=cfReminderBucket(r,now);
      const company=(cfCompanies||[]).find(c=>String(c.id)===String(r.company_id));
      const meta=[
        cfReminderCategoryLabel(r.category),
        r.is_payment && r.amount!=null ? cfReminderMoney(r.amount) : '',
        r.payee||'',
        r.invoice_number ? `Faktura: ${r.invoice_number}` : '',
        r.mail_invoice_enabled ? (({waiting:'Poczta: oczekiwanie na fakturę',applied:'Poczta: dane z faktury',needs_review:'Poczta: faktura do sprawdzenia',error:'Poczta: błąd sprawdzania',missing:'Brak faktury — kwota niepotwierdzona'})[r.mail_scan_status]||'Poczta: automatyczny odczyt') : '',
        company ? cfCompanyDisplayName(company) : '',
        r.vehicle_plate||''
      ].filter(Boolean).join(' · ');
      const recurrence=({none:'',daily:'codziennie',weekly:'co tydzień',monthly:'co miesiąc'})[r.recurrence]||'';
      return `<article class="cf-reminder-card ${bucket==='overdue'?'is-overdue':''} ${r.priority==='high'?'is-high':''}">
        <div class="cf-reminder-card-top">
          <div>
            <div class="cf-reminder-card-tags">
              <span>${escapeHtml(cfReminderCategoryLabel(r.category))}</span>
              ${r.is_payment?'<span class="payment">Płatność</span>':''}
              ${r.priority==='high'?'<span class="priority">Wysoki priorytet</span>':''}
            </div>
            <h3>${escapeHtml(r.title)}</h3>
          </div>
          ${r.is_payment && r.amount!=null?`<strong class="cf-reminder-amount">${escapeHtml(cfReminderMoney(r.amount))}</strong>`:''}
        </div>
        <div class="cf-reminder-when">${bucket==='overdue'?'⚠️ ':''}Przypomnienie: ${escapeHtml(cfReminderFmtDateTime(at))}${r.status==='snoozed'?' · odłożone':''}${recurrence?' · '+escapeHtml(recurrence):''}</div>
        ${r.due_at?`<div class="cf-reminder-due">Termin: <strong>${escapeHtml(cfReminderFmtDateTime(r.due_at))}</strong></div>`:''}
        ${meta?`<div class="cf-reminder-meta">${escapeHtml(meta)}</div>`:''}
        ${r.notes?`<div class="cf-reminder-notes">${escapeHtml(r.notes)}</div>`:''}
        <div class="cf-reminder-actions">
          ${activeTab!=='done' ? (r.is_payment
            ? `<button type="button" class="btn btn-solid" data-reminder-paid="${r.id}">✓ Opłacone</button>`
            : `<button type="button" class="btn btn-solid" data-reminder-done="${r.id}">✓ Wykonane</button>`) : ''}
          ${activeTab!=='done'?`<button type="button" class="btn btn-outline" data-reminder-snooze="${r.id}">Odłóż</button>`:''}
          <button type="button" class="btn btn-outline" data-reminder-edit="${r.id}">Edytuj</button>
          <button type="button" class="btn btn-outline" data-reminder-delete="${r.id}">Usuń</button>
        </div>
      </article>`;
    }).join('')}</div>`;

    list.querySelectorAll('[data-reminder-done]').forEach(b=>b.addEventListener('click',()=>completeReminder(b.dataset.reminderDone,false)));
    list.querySelectorAll('[data-reminder-paid]').forEach(b=>b.addEventListener('click',()=>completeReminder(b.dataset.reminderPaid,true)));
    list.querySelectorAll('[data-reminder-snooze]').forEach(b=>b.addEventListener('click',()=>snoozeReminder(b.dataset.reminderSnooze)));
    list.querySelectorAll('[data-reminder-edit]').forEach(b=>b.addEventListener('click',()=>cfOpenReminderForm(rows.find(r=>String(r.id)===String(b.dataset.reminderEdit)),load)));
    list.querySelectorAll('[data-reminder-delete]').forEach(b=>b.addEventListener('click',()=>deleteReminder(b.dataset.reminderDelete)));
  };

  const completeReminder=async(id,paid)=>{
    const r=rows.find(x=>String(x.id)===String(id));
    if(!r) return;
    const nowIso=new Date().toISOString();
    const recurrenceBase=(r.mail_invoice_enabled&&r.mail_anchor_due_at)?r.mail_anchor_due_at:(r.due_at||r.remind_at);
    const nextDue=cfReminderAdvanceIso(recurrenceBase,r.recurrence);
    if(nextDue){
      let nextCustom=null;
      if(r.reminder_mode==='custom' && r.custom_remind_at){
        const oldDue=new Date(recurrenceBase);
        const oldCustom=new Date(r.custom_remind_at);
        const nextDueDate=new Date(nextDue);
        const diff=oldDue.getTime()-oldCustom.getTime();
        nextCustom=new Date(nextDueDate.getTime()-diff).toISOString();
      }
      const nextRemind=cfReminderCalcRemindAt(nextDue,r.reminder_mode||'at_time',nextCustom);
      const {error}=await cfSupabase.from('cf_reminders').insert({
        user_id:r.user_id,title:r.title,notes:r.notes,category:r.category,priority:r.priority,
        company_id:r.company_id,vehicle_plate:r.vehicle_plate,amount:r.mail_invoice_enabled?null:r.amount,payee:r.payee,invoice_number:r.mail_invoice_enabled?null:r.invoice_number,
        is_payment:r.is_payment,remind_at:nextRemind,due_at:nextDue,reminder_mode:r.reminder_mode||'at_time',
        custom_remind_at:nextCustom,recurrence:r.recurrence,status:'active',
        mail_invoice_enabled:!!r.mail_invoice_enabled,
        mail_folder:r.mail_invoice_enabled?(r.mail_folder||null):null,
        mail_sender:r.mail_invoice_enabled?(r.mail_sender||null):null,
        mail_subject_contains:r.mail_invoice_enabled?(r.mail_subject_contains||null):null,
        mail_attachment_contains:r.mail_invoice_enabled?(r.mail_attachment_contains||null):null,
        mail_scan_days_before:r.mail_invoice_enabled?Number(r.mail_scan_days_before??2):2,
        mail_anchor_due_at:r.mail_invoice_enabled?nextDue:null,
        mail_scan_status:r.mail_invoice_enabled?'waiting':'off',
        mail_last_checked_at:null,mail_last_error:null,mail_source_message_uid:null,mail_source_subject:null,mail_source_received_at:null,mail_source_attachment:null,mail_invoice_detected_at:null,mail_candidate:null
      });
      if(error){showToast('Nie udało się utworzyć kolejnego przypomnienia.');return;}
    }
    const patch={status:'done',completed_at:nowIso,snoozed_until:null};
    if(paid) patch.paid_at=nowIso;
    const {error}=await cfSupabase.from('cf_reminders').update(patch).eq('id',id);
    if(error){showToast('Nie udało się zapisać przypomnienia.');return;}
    showToast(paid?'Oznaczono jako opłacone.':'Oznaczono jako wykonane.');
    await load();
  };

  const snoozeReminder=async(id)=>{
    const choice=prompt('Odłóż na ile godzin? Wpisz liczbę godzin, np. 1, 3, 24', '24');
    if(choice===null) return;
    const hours=Number(String(choice).replace(',','.'));
    if(!Number.isFinite(hours)||hours<=0){showToast('Podaj poprawną liczbę godzin.');return;}
    const until=new Date(Date.now()+hours*3600000).toISOString();
    const {error}=await cfSupabase.from('cf_reminders').update({status:'snoozed',snoozed_until:until,push_sent_at:null}).eq('id',id);
    if(error){showToast('Nie udało się odłożyć przypomnienia.');return;}
    await load();
  };

  const deleteReminder=async id=>{
    if(!confirm('Usunąć to przypomnienie?')) return;
    const {error}=await cfSupabase.from('cf_reminders').delete().eq('id',id);
    if(error){showToast('Nie udało się usunąć przypomnienia.');return;}
    await load();
  };

  document.getElementById('cfReminderAddBtn')?.addEventListener('click',()=>cfOpenReminderForm(null,load));
  document.getElementById('cfReminderTabs')?.querySelectorAll('[data-reminder-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    activeTab=btn.dataset.reminderTab;
    render();
  }));
  document.getElementById('cfReminderCategoryFilter')?.addEventListener('change',render);
  document.getElementById('cfReminderPaymentFilter')?.addEventListener('change',render);

  try{ await load(); }
  catch(e){
    console.error(e);
    const list=document.getElementById('cfReminderList');
    if(list) list.innerHTML=`<div class="empty-state">Nie udało się pobrać przypomnień: ${escapeHtml(e?.message||String(e))}</div>`;
  }
}


async function cfOpenReminderForm(reminder,onSaved){
 if(!cfIsAdmin()||!window.CFReminderForm?.open)return;
 return window.CFReminderForm.open(reminder,onSaved);
}
