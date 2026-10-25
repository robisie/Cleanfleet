/* Shared reminder templates and arbitrary date selection. No writes until Save. */
(()=>{
 'use strict';
 const pad=n=>String(n).padStart(2,'0'),day=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 const serial=s=>Date.parse(s+'T12:00:00Z')/86400000;
 const shift=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function parts(v){const d=new Date(v);if(isNaN(+d))throw Error('Nieprawidłowy termin.');return {date:day(d),time:`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};}
 function local(date,time){if(!validDay(date))throw Error('Nieprawidłowa data.');const d=new Date(date+'T'+time);if(isNaN(+d)||day(d)!==date||`${pad(d.getHours())}:${pad(d.getMinutes())}`!==time.slice(0,5))throw Error('Wybrana godzina nie istnieje w tym dniu.');return d.toISOString();}
 function buildRows(payload,dates){
  const unique=[...new Set(dates)].sort();if(!unique.length)throw Error('Zaznacz przynajmniej jeden dzień w kalendarzu.');if(unique.length>100||unique.some(d=>!validDay(d)))throw Error('Wybierz do 100 poprawnych dat.');
  if(payload.is_payment||payload.mail_invoice_enabled||payload.recurrence!=='none')throw Error('Przy wielu datach wyłącz płatność, pocztę i powtarzanie. Każdy wybrany dzień tworzy osobne przypomnienie.');
  const start=parts(payload.start_at),end=parts(payload.end_at),offset=serial(end.date)-serial(start.date),custom=payload.reminder_mode==='custom'?parts(payload.custom_remind_at):null;
  if(new Date(payload.end_at)<new Date(payload.start_at))throw Error('Koniec nie może poprzedzać początku.');
  return unique.map(date=>{const startAt=local(date,start.time),endAt=local(shift(date,offset),end.time);let customAt=null,remindAt=startAt;
   const days=({day_1:1,day_2:2,day_3:3})[payload.reminder_mode];if(days)remindAt=local(shift(date,-days),start.time);
   if(custom){customAt=local(shift(date,serial(custom.date)-serial(start.date)),custom.time);remindAt=customAt;}
   return {...payload,start_at:startAt,due_at:startAt,end_at:endAt,remind_at:remindAt,custom_remind_at:customAt};
  });
 }
 async function saveRows(client,rows,current){
  if(!current())throw Error('Sesja została zakończona.');const owner=rows[0]?.user_id;if(!owner||rows.some(r=>r.user_id!==owner||!r.id))throw Error('Brak właściciela lub identyfikatora przypomnienia.');
  // Stable IDs make retry after a lost response safe; the insert itself is atomic.
  const before=await client.from('cf_reminders').select('id').eq('user_id',owner).in('id',rows.map(r=>r.id));if(before.error)throw before.error;
  if(!current())throw Error('Sesja została zakończona.');const found=new Set((before.data||[]).map(r=>r.id));if(rows.every(r=>found.has(r.id)))return;
  if(found.size)throw Error('Niepełny zapis serii — odśwież kalendarz przed ponowieniem.');
  const result=await client.from('cf_reminders').insert(rows);if(result.error)throw result.error;
 }
 function style(){if(document.getElementById('cfReminderBatchStyle'))return;const s=document.createElement('style');s.id='cfReminderBatchStyle';s.textContent=`
 .cf-rem-templates{margin:0 0 14px}.cf-rem-templates p{font-size:12px;margin:6px 0}.cf-rem-templates nav{display:flex;flex-wrap:wrap;gap:7px}.cf-rem-multi{margin-top:12px;background:#fff;border:1px solid #d7ddd8;border-radius:12px;padding:12px}.cf-rem-multi [hidden]{display:none!important}.cf-rem-multi label{display:flex;gap:8px;align-items:center}.cf-rem-multi-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0}.cf-rem-multi-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.cf-rem-multi-grid span{text-align:center;font-size:11px;padding:5px}.cf-rem-multi-grid button{min-height:38px;border:1px solid #d7ddd8;border-radius:7px;background:#fff;color:#182019;cursor:pointer}.cf-rem-multi-grid button[aria-pressed=true]{background:#294b34;color:#fff;border-color:#294b34;font-weight:800}.cf-rem-multi-grid button[data-out=true]{opacity:.5}.cf-rem-picked{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}.cf-rem-picked button{border:1px solid #ccd4cf;background:#eef3ec;color:#182019;border-radius:8px;padding:6px;cursor:pointer}.cf-rem-batch-status{font-size:12px;line-height:1.4}`;document.head.append(s);}
 function attach(host,{getDb,toast}){
  style();let chosen=new Set(),cursor=host.querySelector('#cfrStartDate').value.slice(0,7),request=0,prepared=null,busy=false;
  const current=()=>host.isConnected&&(!window.cfIsAdmin||window.cfIsAdmin());
  const box=document.createElement('section');box.className='cf-rem-templates';box.innerHTML=`<p><b>Gotowe szablony</b> — ustawienia możesz zmienić przed zapisem.</p><nav>${['Browar','Spotkanie','Telefon'].map(title=>`<button type="button" class="cf-rem-range-btn" data-rem-template="${title}">${title}</button>`).join('')}</nav><p class="cf-rem-batch-status" role="status" data-template-status></p><div class="cf-rem-multi"><label><input type="checkbox" data-multi-enabled>Wybierz wiele dni w kalendarzu</label><div data-multi-body hidden><div class="cf-rem-multi-head"><button type="button" class="cf-rem-range-btn" data-month-prev aria-label="Poprzedni miesiąc">‹</button><strong data-month-title></strong><button type="button" class="cf-rem-range-btn" data-month-next aria-label="Następny miesiąc">›</button></div><div class="cf-rem-multi-grid" data-day-grid></div><div class="cf-rem-picked" data-picked></div><p class="cf-rem-batch-status" data-date-count></p><button type="button" class="cf-rem-range-btn" data-clear-dates>Wyczyść daty</button><p class="cf-rem-batch-status">Te same ustawienia i godziny dla każdego dnia. Powtarzanie ustaw na „Nie powtarzaj”.</p></div></div>`;
  host.querySelector('.cf-rem-range-head').after(box);const enabled=box.querySelector('[data-multi-enabled]'),save=host.querySelector('[data-save]');
  function render(){box.querySelector('[data-multi-body]').hidden=!enabled.checked;const [y,m]=cursor.split('-').map(Number),first=new Date(y,m-1,1,12),start=new Date(y,m-1,1-((first.getDay()||7)-1),12);
   box.querySelector('[data-month-title]').textContent=first.toLocaleDateString('pl-PL',{month:'long',year:'numeric'});box.querySelector('[data-day-grid]').innerHTML=['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(s=>`<span>${s}</span>`).join('')+Array.from({length:42},(_,i)=>{const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i,12),date=day(d);return `<button type="button" data-pick-date="${date}" data-out="${d.getMonth()!==m-1}" aria-label="${date}" aria-pressed="${chosen.has(date)}">${d.getDate()}</button>`;}).join('');
   box.querySelector('[data-picked]').innerHTML=[...chosen].sort().map(date=>`<button type="button" data-remove-date="${date}" aria-label="Usuń datę ${date}">${date.split('-').reverse().join('.')} ×</button>`).join('');box.querySelector('[data-date-count]').textContent='Wybrano dni: '+chosen.size;save.textContent=enabled.checked?'Dodaj przypomnienia ('+chosen.size+')':'Zapisz';
  }
  enabled.onchange=render;box.querySelector('[data-month-prev]').onclick=()=>{const [y,m]=cursor.split('-').map(Number);cursor=day(new Date(y,m-2,1,12)).slice(0,7);render();};box.querySelector('[data-month-next]').onclick=()=>{const [y,m]=cursor.split('-').map(Number);cursor=day(new Date(y,m,1,12)).slice(0,7);render();};box.querySelector('[data-clear-dates]').onclick=()=>{chosen.clear();render();};
  box.addEventListener('click',event=>{if(busy)return;const pick=event.target.closest('[data-pick-date]'),remove=event.target.closest('[data-remove-date]');if(pick){const date=pick.dataset.pickDate;if(chosen.has(date))chosen.delete(date);else if(chosen.size<100)chosen.add(date);else toast('Możesz wybrać do 100 dni.');render();}if(remove){chosen.delete(remove.dataset.removeDate);render();}});
  function apply(title,row){const get=id=>host.querySelector('#'+id),date=get('cfrStartDate').value;let start={time:'09:00:00'},end=start,offset=0,custom=null;
   if(row){start=parts(row.start_at||row.due_at||row.remind_at);end=parts(row.end_at||row.start_at||row.due_at||row.remind_at);offset=serial(end.date)-serial(start.date);if(row.custom_remind_at)custom=parts(row.custom_remind_at);}
   get('cfrTitle').value=title;get('cfrCategory').value=row?.category||(title==='Telefon'?'phone':'private');get('cfrPriority').value=row?.priority||'normal';get('cfrNotes').value=row?.notes||'';get('cfrCompany').value=row?.company_id||'';get('cfrPlate').value=row?.vehicle_plate||'';
   get('cfrStartTime').value=start.time.slice(0,5);get('cfrEndDate').value=shift(date,offset);get('cfrEndTime').value=end.time.slice(0,5);get('cfrMode').value=row?.reminder_mode||'at_time';if(custom){get('cfrCustomDate').value=shift(date,serial(custom.date)-serial(start.date));get('cfrCustomTime').value=custom.time.slice(0,5);}get('cfrMode').onchange();get('cfrPayment').checked=false;get('cfrPayment').onchange();get('cfrRecurrence').value='none';enabled.checked=true;render();
  }
  box.querySelectorAll('[data-rem-template]').forEach(btn=>btn.onclick=async()=>{if(busy)return;const token=++request,title=btn.dataset.remTemplate,status=box.querySelector('[data-template-status]');status.textContent='Wczytuję szablon…';
   try{const client=await getDb(),auth=await client.auth.getUser(),user=auth.data?.user;if(auth.error)throw auth.error;if(!user)throw Error('Brak sesji.');if(!current()||token!==request)return;
    const result=await client.from('cf_reminders').select('title,category,priority,notes,company_id,vehicle_plate,start_at,end_at,due_at,remind_at,reminder_mode,custom_remind_at').eq('user_id',user.id).eq('title',title).eq('is_payment',false).order('created_at',{ascending:false}).limit(1);if(result.error)throw result.error;
    if(!current()||token!==request)return;apply(title,result.data?.[0]);status.textContent=result.data?.length?'Wczytano ustawienia ostatniego przypomnienia „'+title+'”. Wybierz dni.':'Szablon „'+title+'”: 09:00, normalny priorytet, przypomnienie w chwili rozpoczęcia. Wybierz dni.';
   }catch(error){if(current()&&token===request){status.textContent='Nie udało się pobrać szablonu. Spróbuj ponownie.';}}
  });render();
  return {active:()=>enabled.checked,current,cancelPending(){request++;},prepare(payload){if(busy)throw Error('Trwa zapis.');const rows=buildRows(payload,[...chosen]),signature=JSON.stringify(rows);if(!prepared||prepared.signature!==signature)prepared={signature,rows:rows.map(r=>({...r,id:crypto.randomUUID()}))};return prepared.rows;},async save(client,rows){busy=true;request++;box.querySelectorAll('button,input').forEach(el=>el.disabled=true);try{await saveRows(client,rows,current);}finally{busy=false;if(current())box.querySelectorAll('button,input').forEach(el=>el.disabled=false);}}};
 }
 window.CFReminderBatch={attach,buildRows,saveRows};
})();
