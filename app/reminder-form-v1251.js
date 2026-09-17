(()=>{
  'use strict';

  const CATS={private:'Prywatne',fleet:'Flota',client:'Klient',invoice:'Faktura',purchase:'Zakup',phone:'Telefon',other:'Inne'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const parts=v=>{const d=v?new Date(v):null;if(!d||Number.isNaN(d.getTime()))return{date:'',time:''};return{date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`}};
  const iso=(date,time)=>{if(!date)return null;const d=new Date(`${date}T${time||'00:00'}:00`);return Number.isNaN(d.getTime())?null:d.toISOString()};
  const shiftDays=(isoString,days)=>{const d=new Date(isoString);d.setDate(d.getDate()-days);return d.toISOString()};

  function style(){
    if(document.getElementById('cfReminderRange1251Style'))return;
    const s=document.createElement('style');s.id='cfReminderRange1251Style';s.textContent=`
      .cf-rem-range-bg{position:fixed;inset:0;z-index:260000;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:14px}
      .cf-rem-range-sheet{width:min(680px,96vw);max-height:92vh;overflow:auto;background:#f7f7f4;color:#171914;border:1px solid #d7ddd8;border-radius:18px;padding:18px;box-shadow:0 18px 55px rgba(0,0,0,.28)}
      .cf-rem-range-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.cf-rem-range-head h2{font-size:20px;margin:0}.cf-rem-range-close{width:38px;height:38px;border:1px solid #d6dbd7;border-radius:50%;background:#fff;color:#161914;font-size:24px;line-height:1;cursor:pointer}
      .cf-rem-range-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}.cf-rem-range-span2{grid-column:span 2}.cf-rem-range-field{min-width:0}.cf-rem-range-field span{display:block;font-size:11px;color:#666f69;margin-bottom:5px;font-weight:700}.cf-rem-range-field input,.cf-rem-range-field select,.cf-rem-range-field textarea{width:100%;max-width:100%;box-sizing:border-box;border:1px solid #d3d9d5;border-radius:10px;background:#fff;color:#171914;padding:10px 11px;min-height:42px}.cf-rem-range-field input[type="date"],.cf-rem-range-field input[type="time"]{width:calc(100% - 32px)!important;max-width:calc(100% - 32px)!important}.cf-rem-range-field textarea{min-height:88px;resize:vertical}
      .cf-rem-range-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cf-rem-range-box{background:#fff;border:1px solid #dde2de;border-radius:12px;padding:10px;min-width:0}.cf-rem-range-box b{display:block;font-size:11px;margin-bottom:8px}.cf-rem-range-box .row{display:grid;grid-template-columns:1.2fr .8fr;gap:8px;min-width:0}
      .cf-rem-range-payment{grid-column:span 2;display:flex;align-items:center;gap:8px;font-weight:800;font-size:12px;padding:5px 0}.cf-rem-range-payment input{width:17px;height:17px}.cf-rem-range-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px}.cf-rem-range-btn{border:1px solid #ccd4cf;border-radius:10px;background:#fff;color:#182019;padding:10px 14px;font-weight:800;cursor:pointer}.cf-rem-range-btn.primary{background:#294b34;border-color:#294b34;color:#fff}.cf-rem-range-note{font-size:10px;color:#707b74;margin-top:6px}
      @media(max-width:620px){.cf-rem-range-sheet{padding:14px}.cf-rem-range-grid{grid-template-columns:1fr}.cf-rem-range-span2,.cf-rem-range-payment{grid-column:span 1}.cf-rem-range-dates{grid-template-columns:1fr}.cf-rem-range-box .row{grid-template-columns:1fr 1fr}}
    `;document.head.appendChild(s);
  }

  function toast(msg){
    try{if(typeof showToast==='function'){showToast(msg);return}}catch(_){}
    const h=document.getElementById('toastHost');if(h){h.innerHTML=`<div class="toast">${esc(msg)}</div>`;setTimeout(()=>h.innerHTML='',2200)}
  }

  async function db(){
    try{if(typeof cfSupabase!=='undefined'&&cfSupabase)return cfSupabase}catch(_){}
    if(window.CFCalendarEngine?.loadSupabase)return await window.CFCalendarEngine.loadSupabase();
    throw new Error('Brak połączenia z bazą.');
  }

  async function companies(){
    try{if(typeof cfCompanies!=='undefined'&&Array.isArray(cfCompanies)&&cfCompanies.length)return cfCompanies}catch(_){}
    if(window.CFCalendarEngine?.loadAll){const d=await window.CFCalendarEngine.loadAll();return d?.companies||[]}
    return[];
  }

  function companyLabel(c){
    try{if(typeof cfCompanyDisplayName==='function')return cfCompanyDisplayName(c)}catch(_){}
    return c?.short_name||c?.name||'Firma';
  }

  function reminderAt(startAt,mode,custom){
    if(mode==='day_1')return shiftDays(startAt,1);
    if(mode==='day_2')return shiftDays(startAt,2);
    if(mode==='day_3')return shiftDays(startAt,3);
    if(mode==='custom'&&custom)return custom;
    return startAt;
  }

  async function open(reminder=null,onSaved=null,options={}){
    style();
    const list=await companies();
    const start=parts(reminder?.start_at||reminder?.due_at||reminder?.remind_at||null);
    const end=parts(reminder?.end_at||reminder?.start_at||reminder?.due_at||reminder?.remind_at||null);
    const today=options.prefillDate||`${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`;
    const startDate=start.date||today,startTime=start.time||'09:00',endDate=end.date||startDate,endTime=end.time||startTime;
    const mode=reminder?.reminder_mode||'at_time';
    const custom=parts(reminder?.custom_remind_at||null);
    const isPay=!!reminder?.is_payment;

    const host=document.createElement('div');host.className='cf-rem-range-bg';host.id='cfReminderRangeOverlay';
    host.innerHTML=`<div class="cf-rem-range-sheet">
      <div class="cf-rem-range-head"><h2>${reminder?'Edytuj przypomnienie':'Nowe przypomnienie'}</h2><button type="button" class="cf-rem-range-close" data-close>×</button></div>
      <div class="cf-rem-range-grid">
        <label class="cf-rem-range-field cf-rem-range-span2"><span>Tytuł</span><input id="cfrTitle" value="${esc(reminder?.title||'')}" placeholder="Np. Zapłać ratę leasingu"></label>
        <label class="cf-rem-range-field"><span>Kategoria</span><select id="cfrCategory">${Object.entries(CATS).map(([k,v])=>`<option value="${k}" ${String(reminder?.category||'private')===k?'selected':''}>${v}</option>`).join('')}</select></label>
        <label class="cf-rem-range-field"><span>Priorytet</span><select id="cfrPriority"><option value="low" ${reminder?.priority==='low'?'selected':''}>Niski</option><option value="normal" ${!reminder||reminder?.priority==='normal'?'selected':''}>Normalny</option><option value="high" ${reminder?.priority==='high'?'selected':''}>Wysoki</option></select></label>
        <div class="cf-rem-range-dates cf-rem-range-span2">
          <div class="cf-rem-range-box"><b>Od</b><div class="row"><label class="cf-rem-range-field"><span>Data od</span><input id="cfrStartDate" type="date" value="${startDate}"></label><label class="cf-rem-range-field"><span>Godzina od</span><input id="cfrStartTime" type="time" value="${startTime}"></label></div></div>
          <div class="cf-rem-range-box"><b>Do</b><div class="row"><label class="cf-rem-range-field"><span>Data do</span><input id="cfrEndDate" type="date" value="${endDate}"></label><label class="cf-rem-range-field"><span>Godzina do</span><input id="cfrEndTime" type="time" value="${endTime}"></label></div></div>
        </div>
        <label class="cf-rem-range-field cf-rem-range-span2"><span>Kiedy przypomnieć</span><select id="cfrMode"><option value="at_time" ${mode==='at_time'?'selected':''}>W chwili rozpoczęcia</option><option value="day_1" ${mode==='day_1'?'selected':''}>1 dzień wcześniej</option><option value="day_2" ${mode==='day_2'?'selected':''}>2 dni wcześniej</option><option value="day_3" ${mode==='day_3'?'selected':''}>3 dni wcześniej</option><option value="custom" ${mode==='custom'?'selected':''}>Własny termin</option></select></label>
        <div id="cfrCustomWrap" class="cf-rem-range-dates cf-rem-range-span2" style="display:${mode==='custom'?'grid':'none'}"><div class="cf-rem-range-box" style="grid-column:1/-1"><b>Własny termin przypomnienia</b><div class="row"><label class="cf-rem-range-field"><span>Data</span><input id="cfrCustomDate" type="date" value="${custom.date||startDate}"></label><label class="cf-rem-range-field"><span>Godzina</span><input id="cfrCustomTime" type="time" value="${custom.time||startTime}"></label></div></div></div>
        <label class="cf-rem-range-field"><span>Powtarzanie</span><select id="cfrRecurrence"><option value="none" ${!reminder||reminder?.recurrence==='none'?'selected':''}>Nie powtarzaj</option><option value="daily" ${reminder?.recurrence==='daily'?'selected':''}>Codziennie</option><option value="weekly" ${reminder?.recurrence==='weekly'?'selected':''}>Co tydzień</option><option value="monthly" ${reminder?.recurrence==='monthly'?'selected':''}>Co miesiąc</option></select></label>
        <label class="cf-rem-range-field"><span>Firma (opcjonalnie)</span><select id="cfrCompany"><option value="">Bez firmy</option>${list.map(c=>`<option value="${esc(c.id)}" ${String(reminder?.company_id||'')===String(c.id)?'selected':''}>${esc(companyLabel(c))}</option>`).join('')}</select></label>
        <label class="cf-rem-range-field cf-rem-range-span2"><span>Tablica / pojazd (opcjonalnie)</span><input id="cfrPlate" value="${esc(reminder?.vehicle_plate||'')}" placeholder="Np. ST1234X"></label>
        <label class="cf-rem-range-payment"><input id="cfrPayment" type="checkbox" ${isPay?'checked':''}>To jest płatność</label>
        <div id="cfrPayFields" class="cf-rem-range-grid cf-rem-range-span2" style="display:${isPay?'grid':'none'};grid-template-columns:repeat(3,1fr)">
          <label class="cf-rem-range-field"><span>Kwota</span><input id="cfrAmount" type="number" step="0.01" min="0" value="${reminder?.amount??''}"></label>
          <label class="cf-rem-range-field"><span>Odbiorca</span><input id="cfrPayee" value="${esc(reminder?.payee||'')}"></label>
          <label class="cf-rem-range-field"><span>Nr faktury</span><input id="cfrInvoice" value="${esc(reminder?.invoice_number||'')}"></label>
        </div>
        <label class="cf-rem-range-field cf-rem-range-span2"><span>Notatka</span><textarea id="cfrNotes">${esc(reminder?.notes||'')}</textarea></label>
      </div>
      <div class="cf-rem-range-note">Zakres „od–do” będzie również używany przez duży kalendarz.</div>
      <div class="cf-rem-range-actions"><button type="button" class="cf-rem-range-btn" data-close>Anuluj</button><button type="button" class="cf-rem-range-btn primary" data-save>Zapisz</button></div>
    </div>`;
    document.getElementById('cfReminderRangeOverlay')?.remove();document.body.appendChild(host);
    const close=()=>host.remove();host.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);host.addEventListener('click',e=>{if(e.target===host)close()});
    const modeEl=host.querySelector('#cfrMode'),payEl=host.querySelector('#cfrPayment');
    modeEl.onchange=()=>host.querySelector('#cfrCustomWrap').style.display=modeEl.value==='custom'?'grid':'none';
    payEl.onchange=()=>host.querySelector('#cfrPayFields').style.display=payEl.checked?'grid':'none';
    host.querySelector('[data-save]').onclick=async()=>{
      const title=host.querySelector('#cfrTitle').value.trim();
      const startAt=iso(host.querySelector('#cfrStartDate').value,host.querySelector('#cfrStartTime').value);
      const endAt=iso(host.querySelector('#cfrEndDate').value,host.querySelector('#cfrEndTime').value);
      if(!title){toast('Podaj tytuł przypomnienia.');return}
      if(!startAt||!endAt){toast('Podaj datę i godzinę od oraz do.');return}
      if(new Date(endAt)<new Date(startAt)){toast('Termin „do” nie może być wcześniejszy niż „od”.');return}
      let customAt=null;if(modeEl.value==='custom')customAt=iso(host.querySelector('#cfrCustomDate').value,host.querySelector('#cfrCustomTime').value);
      if(modeEl.value==='custom'&&!customAt){toast('Podaj własny termin przypomnienia.');return}
      const client=await db();const {data:{user}}=await client.auth.getUser();if(!user){toast('Brak zalogowanego użytkownika.');return}
      const isPayment=payEl.checked;
      const payload={
        user_id:user.id,title,notes:host.querySelector('#cfrNotes').value.trim(),category:host.querySelector('#cfrCategory').value,priority:host.querySelector('#cfrPriority').value,
        company_id:host.querySelector('#cfrCompany').value||null,vehicle_plate:host.querySelector('#cfrPlate').value.trim().toUpperCase()||null,
        is_payment:isPayment,amount:isPayment&&host.querySelector('#cfrAmount').value!==''?Number(host.querySelector('#cfrAmount').value):null,payee:isPayment?(host.querySelector('#cfrPayee').value.trim()||null):null,invoice_number:isPayment?(host.querySelector('#cfrInvoice').value.trim()||null):null,
        start_at:startAt,end_at:endAt,due_at:startAt,reminder_mode:modeEl.value,custom_remind_at:modeEl.value==='custom'?customAt:null,remind_at:reminderAt(startAt,modeEl.value,customAt),recurrence:host.querySelector('#cfrRecurrence').value,status:reminder?.status||'active',push_sent_at:null
      };
      const saveBtn=host.querySelector('[data-save]');saveBtn.disabled=true;
      try{const q=reminder?.id?client.from('cf_reminders').update(payload).eq('id',reminder.id):client.from('cf_reminders').insert(payload);const {error}=await q;if(error)throw error;close();toast(reminder?'Przypomnienie zaktualizowane.':'Przypomnienie dodane.');if(typeof onSaved==='function')await onSaved()}catch(err){console.error('CleanFleet reminder range:',err);toast('Nie udało się zapisać przypomnienia.');saveBtn.disabled=false}
    };
  }

  window.CFReminderForm={open};
  try{window.cfOpenReminderForm=(reminder,onSaved)=>open(reminder,onSaved)}catch(_){}
})();
