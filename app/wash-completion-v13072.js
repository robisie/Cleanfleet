(()=>{
  'use strict';

  const STYLE_ID='cf-wash-completion-v13072-style';
  let opening=false;

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function money(value){
    return (Number(value)||0).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' zł';
  }
  function startingCost(row){
    const value=row.order_currency===row.currency ? (row.order_cost??row.cost) : row.cost;
    return Number(value??0).toFixed(2);
  }
  const twoDigits=value=>String(value).padStart(2,'0');
  function localDate(d=new Date()){
    return `${d.getFullYear()}-${twoDigits(d.getMonth()+1)}-${twoDigits(d.getDate())}`;
  }
  function photoRange(times){
    let first=Infinity,last=-Infinity;
    for(const time of times){
      if(!Number.isFinite(time)||time<=0||time>8640000000000000)continue;
      first=Math.min(first,time);
      last=Math.max(last,time);
    }
    if(last<=first||last-first>=86400000)return null;
    const startDate=new Date(first),endDate=new Date(last);
    const clock=d=>`${twoDigits(d.getHours())}:${twoDigits(d.getMinutes())}`;
    const date=localDate(startDate),start=clock(startDate),end=clock(endDate);
    // The current start/end fields represent one interval of less than 24 hours.
    if(localDate(endDate)===date?end<=start:end>=start)return null;
    return {date,start,end};
  }
  function durationMinutes(start,end){
    if(!start||!end)return null;
    const sm=String(start).match(/^(\d{1,2}):(\d{2})/);
    const em=String(end).match(/^(\d{1,2}):(\d{2})/);
    if(!sm||!em)return null;
    let s=Number(sm[1])*60+Number(sm[2]);
    let e=Number(em[1])*60+Number(em[2]);
    if(e<s)e+=1440;
    return e-s;
  }
  function durationLabel(start,end){
    const mins=durationMinutes(start,end);
    if(mins===null)return '—';
    const h=Math.floor(mins/60),m=mins%60;
    if(h&&m)return `${h} godz. ${m} min`;
    if(h)return `${h} godz.`;
    return `${m} min`;
  }
  function toast(message){
    try{
      if(typeof showToast==='function')return showToast(message);
      if(typeof cfShowToast==='function')return cfShowToast(message);
    }catch(_){}
    console.info(message);
  }
  function parseDuration(value){
    const text=String(value||'').trim().replace(',','.');
    if(!text)return null;
    if(/^\d+:\d{2}$/.test(text)){
      const [h,m]=text.split(':').map(Number);
      return m<60 ? h+m/60 : NaN;
    }
    return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  }
  function hoursLabel(hours){
    if(hours==null||!Number.isFinite(hours)||hours<=0)return '—';
    const seconds=Math.round(hours*3600);
    const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
    return [h?`${h} godz.`:'',m?`${m} min`:'',s?`${s} s`:''].filter(Boolean).join(' ');
  }
  function currentRole(){
    const role=document.body?.getAttribute('data-cf-role')||'';
    if(role) return role;
    try{
      if(typeof cfIsAdmin==='function'&&cfIsAdmin()) return 'admin';
      if(typeof cfIsCleanFleetEmployee==='function'&&cfIsCleanFleetEmployee()) return 'cleanfleet_employee';
      if(typeof cfIsFleetEmployee==='function'&&cfIsFleetEmployee()) return 'fleet_employee';
    }catch(_){}
    return '';
  }
  function canComplete(){
    const role=currentRole();
    return role==='admin'||role==='cleanfleet_employee';
  }
  function isAdmin(){
    return currentRole()==='admin';
  }
  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .cf-completion-sheet{max-width:760px!important;width:min(760px,96vw)!important;max-height:92vh;overflow:auto}
      .cf-completion-head{padding-right:42px}
      .cf-completion-head h2{margin-bottom:5px}
      .cf-completion-plate{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid var(--line-strong);border-radius:6px;background:#fff;font:800 13px/1 'JetBrains Mono',monospace;letter-spacing:.04em}
      .cf-completion-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
      .cf-completion-grid .field{margin:0;min-width:0}
      .cf-completion-grid .field input,
      .cf-completion-grid .field textarea{box-sizing:border-box}
      .cf-completion-grid input,.cf-completion-grid select{font-size:16px!important;max-width:100%;min-width:0}
      .cf-completion-grid [hidden]{display:none!important}
      #cfWashCompletionOverlay{z-index:17000}
      #cfCompleteDate{
        width:calc(100% - 32px)!important;
        max-width:calc(100% - 32px)!important;
        min-width:0!important;
      }
      #cfCompleteStart,
      #cfCompleteEnd{
        display:block!important;
        width:calc(100% - 32px)!important;
        max-width:calc(100% - 32px)!important;
        min-width:0!important;
        height:36px!important;
        min-height:36px!important;
        max-height:36px!important;
        padding:4px 10px!important;
        box-sizing:border-box!important;
        border:1px solid var(--line-strong)!important;
        border-radius:8px!important;
        background:#fff!important;
        color:var(--ink,#16150f)!important;
        font-size:16px!important;
        line-height:1.1!important;
      }
      .cf-completion-span-2{grid-column:1/-1}
      .cf-completion-duration{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#f8f7f3;font-size:12px}
      .cf-completion-duration strong{font-size:14px}
      .cf-completion-services-wrap{margin-top:18px}
      .cf-completion-services-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .cf-completion-services-head strong{font-size:13px}
      .cf-completion-extra{display:flex;align-items:center;gap:9px;margin:0 0 10px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#f8f7f3;font-size:13px;font-weight:700;cursor:pointer}
      .cf-completion-extra input{width:19px;height:19px;margin:0;accent-color:var(--green-ink)}
      .cf-completion-condition{margin-top:16px;padding:13px;border:1px solid var(--line-strong);border-radius:10px;background:#fafbf6}
      .cf-completion-condition strong,.cf-completion-condition small{display:block;margin-bottom:8px}
      .cf-completion-condition select{width:100%;min-height:42px;font-size:16px}
      .cf-completion-photo-choice{margin:14px 0 0}
      .cf-completion-grid input:disabled{background:#f2f2ef;color:var(--ink);opacity:1}
      .cf-completion-services{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .cf-completion-service{display:flex;align-items:flex-start;gap:9px;padding:11px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer}
      .cf-completion-service:has(input:checked){border-color:var(--green-ink);background:var(--green-bg,#f3f6df)}
      .cf-completion-service input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--green-ink);flex:0 0 18px}
      .cf-completion-service-main{min-width:0;flex:1}
      .cf-completion-service-name{display:block;font-size:13px;font-weight:700;line-height:1.25}
      .cf-completion-service-price{display:block;margin-top:3px;font:700 11px/1.2 'JetBrains Mono',monospace;color:var(--green-ink)}
      .cf-completion-empty{padding:14px;border:1px dashed var(--line-strong);border-radius:10px;color:var(--ink-soft);font-size:12px}
      .cf-completion-total-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
      .cf-completion-total-row .field{margin:0}
      .cf-completion-total-row .btn{height:42px;white-space:nowrap}
      .cf-completion-total-hint{margin-top:5px;font-size:10px;color:var(--ink-soft)}
      .cf-completion-existing-note{margin-top:14px;padding:10px 12px;border-left:3px solid var(--line-strong);background:#faf9f5;font-size:11px;color:var(--ink-soft);line-height:1.45}
      .cf-completion-error{display:none;margin-top:12px;padding:10px 12px;border:1px solid #c94b42;border-radius:8px;background:#fff4f2;color:#9c302b;font-size:12px;font-weight:700;line-height:1.35}
      .cf-completion-error.show{display:block}
      .cf-completion-invalid{border-color:#c94b42!important;box-shadow:0 0 0 2px rgba(201,75,66,.10)!important}
      .cf-service-catalog-sheet{max-width:700px!important;width:min(700px,96vw)!important;max-height:90vh;overflow:auto}
      .cf-service-catalog-list{display:grid;gap:8px;margin-top:14px}
      .cf-service-catalog-row{display:grid;grid-template-columns:minmax(0,1fr) 120px auto auto;gap:8px;align-items:center;padding:9px;border:1px solid var(--line);border-radius:9px;background:#fff}
      .cf-service-catalog-row input[type="text"],.cf-service-catalog-row input[type="number"]{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--line-strong);border-radius:7px;font:13px 'Inter',sans-serif}
      .cf-service-active{display:flex;align-items:center;gap:6px;font-size:11px;white-space:nowrap}
      .cf-service-active input{width:17px;height:17px;accent-color:var(--green-ink)}
      .cf-service-delete{min-width:38px;height:38px;padding:0 10px!important;font-size:18px!important;line-height:1!important}
      .cf-service-default-note{grid-column:1/-1;font-size:10px;color:var(--green-ink);font-weight:700}
      .cf-service-catalog-add{margin-top:10px}
      @media(max-width:600px){
        .cf-completion-grid,.cf-completion-services{grid-template-columns:1fr}
        .cf-completion-span-2{grid-column:auto}
        .cf-completion-total-row{grid-template-columns:1fr}
        .cf-completion-total-row .btn{width:100%}
        .cf-service-catalog-row{grid-template-columns:minmax(0,1fr) 100px auto}
        .cf-service-active{grid-column:1/3}
        .cf-service-delete{grid-column:3;grid-row:1/3;align-self:center}
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchCatalog(activeOnly=true){
    let q=cfSupabase.from('cf_service_catalog').select('id,name,price,active,sort_order,is_default,exclusive').order('sort_order',{ascending:true}).order('name',{ascending:true});
    if(activeOnly)q=q.eq('active',true);
    const {data,error}=await q;
    if(error)throw error;
    return data||[];
  }

  async function openCatalogManager(onSaved){
    if(!isAdmin()){toast('Cennik może edytować tylko administrator.');return;}
    injectStyles();
    let rows;
    const deletedIds=new Set();
    try{rows=await fetchCatalog(false);}
    catch(err){console.error('CleanFleet service catalog:',err);toast('Nie udało się pobrać cennika.');return;}

    const overlay=document.createElement('div');
    overlay.className='overlay';
    overlay.id='cfServiceCatalogOverlay';
    overlay.style.zIndex='26000';
    overlay.innerHTML=`<div class="sheet cf-service-catalog-sheet">
      <button class="close" data-close type="button">&times;</button>
      <h2>Cennik usług</h2><section><h3>Roczna korekta GUS</h3><div data-cf-inflation></div></section>
      <div class="confirm-text">Stawki używane są do automatycznego wyliczania kwoty przy zakończeniu prania. Zmiana ceny nie zmienia historycznych wykonań.</div>
      <div class="cf-service-catalog-list" id="cfServiceCatalogList"></div>
      <button class="btn btn-outline cf-service-catalog-add" id="cfServiceCatalogAdd" type="button">+ Dodaj usługę</button>
      <div class="sheet-actions">
        <button class="btn btn-outline" data-close type="button">Anuluj</button>
        <button class="btn btn-solid" id="cfServiceCatalogSave" type="button">Zapisz cennik</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    window.CFInflation?.mount(overlay.querySelector('[data-cf-inflation]'));
    overlay.addEventListener('input',()=>{overlay.dataset.gusDirty='true';});
    const close=()=>overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    const list=overlay.querySelector('#cfServiceCatalogList');

    const render=()=>{
      list.innerHTML=rows.map((r,index)=>`<div class="cf-service-catalog-row" data-service-row="${index}">
        <input type="text" data-service-name value="${esc(r.name||'')}" placeholder="Nazwa usługi">
        <input type="number" data-service-price min="0" step="0.01" inputmode="decimal" value="${Number(r.price)||0}" placeholder="0,00">
        <label class="cf-service-active"><input type="checkbox" data-service-active ${r.active!==false?'checked':''}> Aktywna</label>
        <button class="btn btn-outline cf-service-delete" type="button" data-service-delete="${index}" aria-label="Usuń usługę" title="Usuń usługę">×</button>
        ${r.is_default?'<div class="cf-service-default-note">Domyślna przy zakończeniu prania · wyklucza pozostałe pozycje</div>':''}
      </div>`).join('');
      list.querySelectorAll('[data-service-delete]').forEach(btn=>btn.addEventListener('click',()=>{
        overlay.dataset.gusDirty='true';
        const idx=Number(btn.dataset.serviceDelete);
        const row=rows[idx];
        if(!row)return;
        if(row.id)deletedIds.add(String(row.id));
        rows.splice(idx,1);
        render();
      }));
    };
    render();

    overlay.querySelector('#cfServiceCatalogAdd')?.addEventListener('click',()=>{
      overlay.dataset.gusDirty='true';
      rows.push({id:null,name:'',price:0,active:true,sort_order:(rows.length+1)*10,is_default:false,exclusive:false});
      render();
      list.lastElementChild?.querySelector('[data-service-name]')?.focus();
    });

    overlay.querySelector('#cfServiceCatalogSave')?.addEventListener('click',async()=>{
      const btn=overlay.querySelector('#cfServiceCatalogSave');
      const uiRows=[...list.querySelectorAll('[data-service-row]')];
      const payload=[];
      for(const el of uiRows){
        const idx=Number(el.dataset.serviceRow);
        const original=rows[idx]||{};
        const name=el.querySelector('[data-service-name]')?.value.trim()||'';
        const price=Number(String(el.querySelector('[data-service-price]')?.value||'0').replace(',','.'));
        const active=!!el.querySelector('[data-service-active]')?.checked;
        if(!name){toast('Każda usługa musi mieć nazwę.');return;}
        if(!Number.isFinite(price)||price<0){toast('Podaj poprawną stawkę dla każdej usługi.');return;}
        payload.push({...original,name,price:Math.round(price*100)/100,active,sort_order:original.sort_order??((idx+1)*10)});
      }
      btn.disabled=true;
      btn.textContent='Zapisuję…';
      try{
        for(const id of deletedIds){
          const {error}=await cfSupabase.from('cf_service_catalog').delete().eq('id',id);
          if(error)throw error;
        }
        for(const row of payload){
          if(row.id){
            const {error}=await cfSupabase.from('cf_service_catalog').update({
              name:row.name,price:row.price,active:row.active,sort_order:row.sort_order,is_default:!!row.is_default,exclusive:!!row.exclusive,updated_at:new Date().toISOString()
            }).eq('id',row.id);
            if(error)throw error;
          }else{
            const {error}=await cfSupabase.from('cf_service_catalog').insert({
              name:row.name,price:row.price,active:row.active,sort_order:row.sort_order,is_default:!!row.is_default,exclusive:!!row.exclusive
            });
            if(error)throw error;
          }
        }
        close();
        toast('Cennik został zapisany.');
        if(typeof onSaved==='function')await onSaved();
      }catch(err){
        console.error('CleanFleet service catalog save:',err);
        toast(err?.message||'Nie udało się zapisać cennika.');
        btn.disabled=false;
        btn.textContent='Zapisz cennik';
      }
    });
  }

  function applyServiceSelection(inputs,changed,allowExtra){
    if(!changed.checked)return;
    if(changed.dataset.exclusive==='1'){
      inputs.forEach(other=>{if(other!==changed&&(!allowExtra||other.dataset.exclusive==='1'))other.checked=false;});
    }else if(!allowExtra){
      inputs.forEach(other=>{if(other.dataset.exclusive==='1')other.checked=false;});
    }
  }

  async function openCompletion(target,onSaved){
    if(opening)return;
    if(!canComplete()){toast('Brak uprawnień do zakończenia prania.');return;}
    const ids=[...new Set((Array.isArray(target)?target:[target]).map(String))];
    if(!ids.length)return;
    opening=true;
    injectStyles();
    try{
      if(typeof cfSupabase==='undefined')throw new Error('Brak połączenia z bazą.');
      const [{data:rows,error:rowError},catalog]=await Promise.all([
        cfSupabase.from('wash_records')
          .select('id,company_id,plate,type,brand,notes,wash_date,duration_hours,wash_start_time,wash_end_time,performed_by,cost,currency,order_cost,order_currency,approved,paid,work_items,completion_notes,condition_level,condition_factors')
          .in('id',ids),
        fetchCatalog(true)
      ]);
      if(rowError)throw rowError;
      if(!rows||rows.length!==ids.length)throw new Error('Nie znaleziono wszystkich zaznaczonych wpisów.');
      const pending=rows.filter(r=>!r.approved&&!r.paid);
      if(!pending.length){toast('Zaznaczone wpisy są już wykonane.');return;}
      if(new Set(pending.map(r=>r.company_id)).size!==1)throw new Error('Wybierz wpisy jednej firmy.');
      if(new Set(pending.map(r=>r.currency||'PLN')).size!==1)throw new Error('Wybierz wpisy w tej samej walucie.');
      const bulk=pending.length>1;
      const row=pending[0];
      const completionIds=pending.map(r=>r.id);
      const currency=row.currency||'PLN';

      const root=document.getElementById('modalRoot')||document.body;
      const existing=document.getElementById('cfWashCompletionOverlay');
      existing?.remove();

      const savedItems=Array.isArray(row.work_items)?row.work_items:[];
      const savedIds=new Set(savedItems.map(x=>String(x?.id||'')).filter(Boolean));
      const performerValues=(()=>{
        const set=new Set();
        if(String(row.performed_by||'').trim())set.add(String(row.performed_by).trim());
        try{
          if(typeof options!=='undefined'&&Array.isArray(options?.kto_wykonal))options.kto_wykonal.forEach(x=>{if(String(x||'').trim())set.add(String(x).trim());});
        }catch(_){}
        return [...set].sort((a,b)=>a.localeCompare(b,'pl'));
      })();

      const overlay=document.createElement('div');
      overlay.className='overlay';
      overlay.id='cfWashCompletionOverlay';
      overlay.innerHTML=`<div class="sheet cf-completion-sheet">
        <button class="close" data-close type="button">&times;</button>
        <div class="cf-completion-head">
          <h2>${bulk?'Zakończ prania':'Zakończ pranie'}</h2>
          <span class="cf-completion-plate">${bulk?`Liczba aut: ${pending.length}`:esc(row.plate||'')}</span>
          ${bulk?`<p>${pending.map(r=>esc(r.plate)).join(', ')}</p><p>Data, wykonawca i zakres prac dotyczą każdego auta. Łączny czas zostanie podzielony równo.</p>`:''}
          ${pending.length<rows.length?'<p>Wpisy już wykonane lub opłacone zostały pominięte.</p>':''}
        </div>
        <div class="cf-completion-grid">
          <label class="field"><span>Data prania</span><input id="cfCompleteDate" type="date" value="${esc(row.wash_date||localDate())}"></label>
          <label class="field"><span>Kto wykonał</span><input id="cfCompletePerformer" type="text" list="cfCompletePerformerList" value="${esc(row.performed_by||'')}" placeholder="Imię / osoba"><datalist id="cfCompletePerformerList">${performerValues.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
          ${bulk?'':`<label class="cf-completion-extra cf-completion-photo-choice cf-completion-span-2"><input id="cfCompleteUsePhotos" type="checkbox" checked><span>Pobierz godzinę ze zdjęć</span></label>`}
          <label class="field cf-completion-span-2"><span>${bulk?'Łączny czas wszystkich aut':'Czas prania'} (opcjonalnie)</span><select id="cfCompleteTimeMode"><option value="range">Godziny od–do</option><option value="duration" ${!bulk&&row.duration_hours!=null&&!(row.wash_start_time&&row.wash_end_time)?'selected':''}>Wpisz czas trwania</option><option value="none">Bez czasu</option></select></label>
          <label class="field" data-time-range><span>Godzina od</span><input id="cfCompleteStart" type="time" value="${esc(!bulk&&row.wash_start_time?String(row.wash_start_time).slice(0,5):'')}"></label>
          <label class="field" data-time-range><span>Godzina do</span><input id="cfCompleteEnd" type="time" value="${esc(!bulk&&row.wash_end_time?String(row.wash_end_time).slice(0,5):'')}"></label>
          <small id="cfCompletePhotoHint" class="cf-completion-span-2" hidden></small>
          <label class="field cf-completion-span-2" data-time-duration hidden><span>Czas trwania w godzinach</span><input id="cfCompleteManualDuration" type="text" inputmode="decimal" placeholder="np. 1:30 lub 1,5" value="${!bulk&&row.duration_hours!=null?esc(row.duration_hours):''}"><small>Możesz wpisać 1:30 lub 1,5 — oba oznaczają 1 godz. 30 min.</small></label>
          <div class="cf-completion-duration cf-completion-span-2"><span>Czas prania</span><strong id="cfCompleteDuration">—</strong></div>
        </div>

        <div class="cf-completion-services-wrap">
          <div class="cf-completion-services-head">
            <strong>Zakres wykonanych prac</strong>
            ${isAdmin()?'<button class="btn btn-outline" id="cfCompleteCatalogBtn" type="button">Cennik usług</button>':''}
          </div>
          <label class="cf-completion-extra"><input type="checkbox" id="cfCompleteExtraService" ${savedIds.size>1&&catalog.some(item=>item.exclusive&&savedIds.has(String(item.id)))?'checked':''}><span>Usługa dodatkowa — pozwól dodać pozycję do kompleksowego sprzątania</span></label>
          <div class="cf-completion-services" id="cfCompleteServices"></div>
        </div>

        ${row.notes?`<div class="cf-completion-existing-note"><strong>Uwagi ze zlecenia:</strong><br>${esc(row.notes)}</div>`:''}

        ${bulk?'':`<div class="cf-completion-condition"><strong>Stan auta przed praniem</strong><small>Opcjonalnie · oceń stopień zabrudzenia przy odbiorze auta.</small><select id="cfCompleteCondition" aria-label="Stan czystości przed praniem">${window.CFWashCondition.options(row.condition_level)}</select><div class="cf-condition-factors" id="cfCompleteConditionFactors">${window.CFWashCondition.picker(row.condition_factors)}</div></div>`}

        <div class="cf-completion-grid">
          <label class="field cf-completion-span-2"><span>Opis wykonania</span><textarea id="cfCompleteNotes" rows="3" placeholder="Krótki opis wykonanej pracy">${esc(row.completion_notes||'')}</textarea></label>
          <div class="cf-completion-span-2 cf-completion-total-row">
            <label class="field"><span>Kwota finalna ${bulk?'za jedno auto ':''}(${esc(currency)})</span><input id="cfCompleteCost" type="number" min="0" step="0.01" inputmode="decimal" value="${bulk?'':esc(startingCost(row))}" aria-describedby="cfCompleteCostHint">
              <div class="cf-completion-total-hint" id="cfCompleteCostHint"></div>
            </label>
            ${currency==='PLN'?'<button class="btn btn-outline" id="cfCompleteRecalc" type="button">Przelicz z usług</button>':''}
          </div>
        </div>

        <div class="cf-completion-error" id="cfCompleteError" role="alert"></div>
        <div class="sheet-actions">
          <button class="btn btn-outline" data-close type="button">Anuluj</button>
          <button class="btn btn-solid" id="cfCompleteSave" type="button">Zapisz i oznacz jako wykonane</button>
        </div>
      </div>`;
      root.appendChild(overlay);

      let saving=false;
      const close=()=>{if(!saving)overlay.remove();};
      overlay.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
      overlay.addEventListener('click',e=>{if(e.target===overlay)close();});

      const conditionInput=overlay.querySelector('#cfCompleteCondition');
      const conditionTags=overlay.querySelector('#cfCompleteConditionFactors');
      const syncConditionTags=()=>{if(conditionTags)conditionTags.hidden=!conditionInput?.value;};
      conditionInput?.addEventListener('change',syncConditionTags);
      syncConditionTags();
      const servicesEl=overlay.querySelector('#cfCompleteServices');
      const extraServiceEl=overlay.querySelector('#cfCompleteExtraService');
      const costEl=overlay.querySelector('#cfCompleteCost');
      const costHint=overlay.querySelector('#cfCompleteCostHint');
      let catalogRows=catalog;

      const selectedIds=()=>[...servicesEl.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
      const selectedTotal=()=>[...servicesEl.querySelectorAll('input[type="checkbox"]:checked')].reduce((sum,cb)=>{
        const item=catalogRows.find(x=>String(x.id)===String(cb.value));
        return sum+(Number(item?.price)||0);
      },0);

      const renderServices=(preserveSelected=true)=>{
        const defaults=new Set(catalogRows.filter(x=>x.is_default).map(x=>String(x.id)));
        const current=preserveSelected
          ? new Set(selectedIds())
          : (savedIds.size ? new Set(savedIds) : defaults);
        if(!catalogRows.length){
          servicesEl.innerHTML='<div class="cf-completion-empty">Brak aktywnych usług w cenniku. Administrator może dodać je przez „Cennik usług”.</div>';
          return;
        }
        servicesEl.innerHTML=catalogRows.map(item=>{
          const checked=current.has(String(item.id));
          return `<label class="cf-completion-service">
            <input type="checkbox" value="${esc(item.id)}" data-exclusive="${item.exclusive?'1':'0'}" ${checked?'checked':''}>
            <span class="cf-completion-service-main">
              <span class="cf-completion-service-name">${esc(item.name)}</span>
              <span class="cf-completion-service-price">${money(item.price)}</span>
            </span>
          </label>`;
        }).join('');
        servicesEl.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.addEventListener('change',()=>{
          applyServiceSelection([...servicesEl.querySelectorAll('input[type="checkbox"]')],cb,extraServiceEl.checked);
          syncCostHint();
        }));
      };

      const timeMode=overlay.querySelector('#cfCompleteTimeMode');
      const manualDuration=overlay.querySelector('#cfCompleteManualDuration');
      const startInput=overlay.querySelector('#cfCompleteStart');
      const endInput=overlay.querySelector('#cfCompleteEnd');
      const dateInput=overlay.querySelector('#cfCompleteDate');
      const usePhotos=overlay.querySelector('#cfCompleteUsePhotos');
      const photoHint=overlay.querySelector('#cfCompletePhotoHint');
      let photoReady=false,photoRequest=0,dateEdited=false;
      const totalHours=()=>{
        if(timeMode.value==='none')return null;
        if(timeMode.value==='duration')return parseDuration(manualDuration.value);
        const mins=durationMinutes(overlay.querySelector('#cfCompleteStart').value,overlay.querySelector('#cfCompleteEnd').value);
        return mins==null?null:mins/60;
      };
      const syncDuration=()=>{
        overlay.querySelectorAll('[data-time-range]').forEach(el=>{el.hidden=timeMode.value!=='range';});
        overlay.querySelector('[data-time-duration]').hidden=timeMode.value!=='duration';
        const hours=totalHours();
        overlay.querySelector('#cfCompleteDuration').textContent=hours==null?'Bez czasu':
          (bulk?`${hoursLabel(hours)} łącznie · ${hoursLabel(hours/pending.length)} / auto`:hoursLabel(hours));
      };
      const syncCostHint=()=>{
        const tip=bulk?'Zostaw puste, aby zachować kwotę zlecenia każdego auta.':'Możesz zmienić kwotę przed zapisem.';
        costHint.textContent=`${tip} Suma z cennika: ${money(selectedTotal())}.`;
      };

      renderServices(false);
      extraServiceEl.addEventListener('change',()=>{
        if(!extraServiceEl.checked){
          const checked=[...servicesEl.querySelectorAll('input[type="checkbox"]:checked')];
          const exclusive=checked.find(cb=>cb.dataset.exclusive==='1');
          if(exclusive)checked.forEach(cb=>{if(cb!==exclusive)cb.checked=false;});
        }
        syncCostHint();
      });
      syncDuration();
      syncCostHint();
      startInput.addEventListener('input',syncDuration);
      endInput.addEventListener('input',syncDuration);
      timeMode.addEventListener('change',()=>{syncDuration();clearFormError();});
      manualDuration.addEventListener('input',syncDuration);
      dateInput.addEventListener('input',()=>{dateEdited=true;});
      const loadPhotoTime=async()=>{
        const request=++photoRequest;
        photoReady=false;
        timeMode.value='range';
        timeMode.disabled=true;
        startInput.disabled=true;
        endInput.disabled=true;
        startInput.value='';endInput.value='';
        photoHint.hidden=false;
        photoHint.textContent='Odczytuję godziny ze zdjęć…';
        syncDuration();
        try{
          const times=await window.cfPhotoLocalCaptureTimes?.(row.id);
          if(request!==photoRequest||!usePhotos.checked||!overlay.isConnected||saving)return;
          const range=photoRange(times||[]);
          if(!range){photoHint.textContent='Brak dwóch zdjęć z różnymi godzinami. Odznacz opcję, aby wpisać godziny ręcznie.';return;}
          startInput.value=range.start;endInput.value=range.end;
          if(!dateEdited&&!row.wash_date)dateInput.value=range.date;
          photoReady=true;
          photoHint.textContent='Godzina startu: pierwsze zdjęcie; godzina końca: ostatnie zdjęcie.';
          syncDuration();
        }catch(error){
          console.warn('CleanFleet photo time:',error);
          if(request===photoRequest&&usePhotos.checked&&overlay.isConnected)
            photoHint.textContent='Nie udało się odczytać zdjęć. Odznacz opcję, aby wpisać godziny ręcznie.';
        }
      };
      if(usePhotos){
        usePhotos.addEventListener('change',()=>{
          if(usePhotos.checked)loadPhotoTime();
          else{
            ++photoRequest;
            photoReady=false;
            timeMode.disabled=false;startInput.disabled=false;endInput.disabled=false;
            photoHint.hidden=true;
            syncDuration();
          }
          clearFormError();
        });
        loadPhotoTime();
      }
      overlay.querySelector('#cfCompleteRecalc')?.addEventListener('click',()=>{
        costEl.value=selectedTotal().toFixed(2);
        clearFormError();
      });

      const errorEl=overlay.querySelector('#cfCompleteError');
      const clearFormError=()=>{
        errorEl?.classList.remove('show');
        if(errorEl) errorEl.textContent='';
        overlay.querySelectorAll('.cf-completion-invalid').forEach(el=>el.classList.remove('cf-completion-invalid'));
      };
      const showFormError=(message,el)=>{
        if(errorEl){
          errorEl.textContent=message;
          errorEl.classList.add('show');
          errorEl.scrollIntoView({block:'nearest',behavior:'smooth'});
        }else{
          toast(message);
        }
        if(el){
          el.classList.add('cf-completion-invalid');
          try{el.focus({preventScroll:true});}catch(_){try{el.focus();}catch(__){}}
        }
      };
      overlay.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('input',clearFormError));
      servicesEl.addEventListener('change',clearFormError);

      overlay.querySelector('#cfCompleteCatalogBtn')?.addEventListener('click',()=>openCatalogManager(async()=>{
        const keep=new Set(selectedIds());
        catalogRows=await fetchCatalog(true);
        renderServices(true);
        [...servicesEl.querySelectorAll('input[type="checkbox"]')].forEach(cb=>{if(keep.has(cb.value))cb.checked=true;});
        syncCostHint();
      }));

      overlay.querySelector('#cfCompleteSave')?.addEventListener('click',async()=>{
        if(saving)return;
        const saveBtn=overlay.querySelector('#cfCompleteSave');
        const washDate=overlay.querySelector('#cfCompleteDate').value;
        const start=timeMode.value==='range'?overlay.querySelector('#cfCompleteStart').value:'';
        const end=timeMode.value==='range'?overlay.querySelector('#cfCompleteEnd').value:'';
        const hours=totalHours();
        const performer=overlay.querySelector('#cfCompletePerformer').value.trim();
        const serviceIds=selectedIds();
        const cost=costEl.value==='' ? null : Number(costEl.value);
        const notes=overlay.querySelector('#cfCompleteNotes').value.trim();
        const conditionLevel=overlay.querySelector('#cfCompleteCondition')?.value?Number(overlay.querySelector('#cfCompleteCondition').value):null;
        const conditionFactors=conditionLevel?[...overlay.querySelectorAll('#cfCompleteConditionFactors input:checked')].map(input=>input.value):[];

        clearFormError();
        const dateEl=overlay.querySelector('#cfCompleteDate');
        const startEl=overlay.querySelector('#cfCompleteStart');
        const endEl=overlay.querySelector('#cfCompleteEnd');
        const performerEl=overlay.querySelector('#cfCompletePerformer');
        if(!washDate){showFormError('Podaj datę prania.',dateEl);return;}
        if(usePhotos?.checked&&!photoReady){showFormError('Nie ma dwóch zdjęć z różnymi godzinami. Odznacz „Pobierz godzinę ze zdjęć”, aby wpisać czas ręcznie.',usePhotos);return;}
        if((start&&!end)||(!start&&end)){showFormError('Uzupełnij obie godziny albo pozostaw obie puste.',start?endEl:startEl);return;}
        if(hours!==null&&(!Number.isFinite(hours)||hours<=0||hours>168)){showFormError('Podaj czas większy od zera, maksymalnie 168 godz.',timeMode.value==='duration'?manualDuration:endEl);return;}
        if(!performer){showFormError('Podaj, kto wykonał pranie.',performerEl);return;}
        if(!serviceIds.length){showFormError('Zaznacz co najmniej jeden zakres wykonanych prac.',servicesEl);return;}
        if(costEl.validity.badInput || (cost===null ? !bulk : !Number.isFinite(cost)||cost<0)){
          showFormError('Podaj poprawną kwotę finalną.',costEl);return;
        }
        const finalCost=cost===null?null:Math.round(cost*100)/100;

        saveBtn.disabled=true;
        saving=true;
        saveBtn.textContent='Zapisuję…';
        try{
          const {data,error}=await cfSupabase.rpc('cf_complete_wash_records',{
            p_wash_record_ids:completionIds,
            p_wash_date:washDate,
            p_start_time:start||null,
            p_end_time:end||null,
            p_duration_hours:timeMode.value==='duration'?hours:null,
            p_performed_by:performer,
            p_cost:finalCost,
            p_service_ids:serviceIds,
            p_completion_notes:notes||null,
            p_condition_level:conditionLevel,
            p_condition_factors:conditionFactors
          });
          if(error)throw error;

          // Dopiero po potwierdzonym zapisie w Supabase aktualizujemy stan na ekranie.
          // Dzięki temu przy błędzie zapisu checkbox nie może pokazać fałszywego "Wykonane".
          for(const id of completionIds)try{
            window.cfApplyCompletedWashLocal?.({
              id,
              washDate,
              start:bulk?'':start,
              end:bulk?'':end,
              durationHours:data?.duration_hours_per_vehicle??null,
              performer,
              cost:data?.cost_by_id?.[id]??finalCost,
              notes,...(bulk?{}:{conditionLevel,conditionFactors})
            });
          }catch(localError){
            console.warn('CleanFleet local completion refresh:',localError);
          }

          saving=false;
          close();
          try{onSaved?.();}catch(callbackError){console.warn('CleanFleet selection refresh:',callbackError);}

          try{
            if(typeof addOptionIfNew==='function')addOptionIfNew('kto_wykonal',performer);
          }catch(_){}

          // Pełna synchronizacja potwierdza dane z bazy, ale nie blokuje już reakcji UI.
          try{
            const refresh=window.cfReloadActiveCompanyData
              ? window.cfReloadActiveCompanyData()
              : (typeof loadAll==='function' ? loadAll() : null);
            if(refresh && typeof refresh.catch==='function'){
              refresh.catch(err=>console.warn('CleanFleet post-completion refresh:',err));
            }
          }catch(refreshError){
            console.warn('CleanFleet post-completion refresh:',refreshError);
          }

          try{
            const notesRefresh=typeof cfLoadChangeNotifications==='function'
              ? cfLoadChangeNotifications()
              : null;
            if(notesRefresh && typeof notesRefresh.catch==='function'){
              notesRefresh.catch(err=>console.warn('CleanFleet completion notifications refresh:',err));
            }
          }catch(_){}

          const priceLabel=finalCost===null?'Kwoty zleceń':`${finalCost.toFixed(2)} ${currency}${bulk?' / auto':''}`;
          toast(`${bulk?`Zakończono prania: ${pending.length}`:'Pranie zakończone'} · ${hours==null?'bez czasu':hoursLabel(hours)} · ${priceLabel}`);
        }catch(err){
          console.error('CleanFleet complete wash:',err);
          showFormError(err?.message||'Nie udało się zakończyć prania.');
          saving=false;
          saveBtn.disabled=false;
          saveBtn.textContent='Zapisz i oznacz jako wykonane';
        }
      });
    }catch(err){
      console.error('CleanFleet wash completion:',err);
      toast(err?.message||'Nie udało się otworzyć zakończenia prania.');
    }finally{
      opening=false;
    }
  }

  async function completeBus(id){
    injectStyles();
    const {data:row,error}=await cfSupabase.from('wash_records')
      .select('id,plate,wash_date,wash_start_time,wash_end_time,performed_by,completion_notes,cost,currency,order_cost,order_currency,approved,paid').eq('id',id).single();
    if(error)throw error;
    if(!row||row.approved||row.paid){toast('Ten BUS jest już wykonany.');return;}
    const root=document.getElementById('modalRoot')||document.body;
    document.getElementById('cfWashCompletionOverlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='cfWashCompletionOverlay';overlay.className='overlay';
    overlay.innerHTML=`<div class="sheet cf-completion-sheet">
      <button class="close" data-close type="button">&times;</button>
      <div class="cf-completion-head"><h2>Zakończ pranie BUS</h2><span class="cf-completion-plate">${esc(row.plate||'BUS')}</span></div>
      <div class="cf-completion-grid">
        <label class="cf-completion-extra cf-completion-photo-choice cf-completion-span-2"><input id="cfBusUsePhotos" type="checkbox" checked><span>Pobierz godzinę ze zdjęć</span></label>
        <label class="field cf-completion-span-2"><span>Data prania</span><input id="cfBusDate" type="date" value="${esc(row.wash_date||localDate())}"></label>
        <label class="field"><span>Godzina od</span><input id="cfBusStart" type="time"></label>
        <label class="field"><span>Godzina do</span><input id="cfBusEnd" type="time"></label>
        <small id="cfBusPhotoHint" class="cf-completion-span-2" aria-live="polite"></small>
        <div class="cf-completion-duration cf-completion-span-2"><span>Czas prania</span><strong id="cfBusDuration">—</strong></div>
        <label class="field cf-completion-span-2"><span>Kwota finalna (${esc(row.currency||'PLN')})</span><input id="cfBusCost" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(startingCost(row))}"></label>
      </div>
      <div class="cf-completion-error" id="cfBusError" role="alert"></div>
      <div class="sheet-actions"><button class="btn btn-outline" data-close type="button">Anuluj</button><button class="btn btn-solid" id="cfBusSave" type="button">Zapisz i oznacz jako wykonane</button></div>
    </div>`;
    root.appendChild(overlay);
    const checkbox=overlay.querySelector('#cfBusUsePhotos'),start=overlay.querySelector('#cfBusStart');
    const end=overlay.querySelector('#cfBusEnd'),date=overlay.querySelector('#cfBusDate');
    const costInput=overlay.querySelector('#cfBusCost');
    const hint=overlay.querySelector('#cfBusPhotoHint'),save=overlay.querySelector('#cfBusSave');
    const errorEl=overlay.querySelector('#cfBusError');
    let saving=false,ready=false,request=0,dateEdited=false;
    const close=()=>{if(!saving)overlay.remove();};
    overlay.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',close));
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    const sync=()=>{overlay.querySelector('#cfBusDuration').textContent=durationLabel(start.value,end.value);};
    const showError=message=>{errorEl.textContent=message;errorEl.classList.add('show');};
    for(const input of [start,end,date,costInput])input.addEventListener('input',()=>{errorEl.classList.remove('show');sync();});
    date.addEventListener('input',()=>{dateEdited=true;});
    const load=async()=>{
      const current=++request;
      ready=false;start.value='';end.value='';start.disabled=true;end.disabled=true;
      hint.textContent='Odczytuję godziny ze zdjęć…';sync();
      try{
        const times=await window.cfPhotoLocalCaptureTimes?.(id);
        if(current!==request||!checkbox.checked||!overlay.isConnected||saving)return;
        const range=photoRange(times||[]);
        if(!range){hint.textContent='Brak dwóch zdjęć z różnymi godzinami. Odznacz opcję, aby wpisać godziny ręcznie.';return;}
        start.value=range.start;end.value=range.end;
        if(!dateEdited&&!row.wash_date)date.value=range.date;
        ready=true;hint.textContent='Godzina startu: pierwsze zdjęcie; godzina końca: ostatnie zdjęcie.';sync();
      }catch(photoError){
        console.warn('CleanFleet BUS photo time:',photoError);
        if(current===request&&checkbox.checked&&overlay.isConnected)
          hint.textContent='Nie udało się odczytać zdjęć. Odznacz opcję, aby wpisać godziny ręcznie.';
      }
    };
    checkbox.addEventListener('change',()=>{
      errorEl.classList.remove('show');
      if(checkbox.checked)load();
      else{++request;ready=false;start.disabled=false;end.disabled=false;hint.hidden=true;
        start.value=row.wash_start_time?String(row.wash_start_time).slice(0,5):start.value;
        end.value=row.wash_end_time?String(row.wash_end_time).slice(0,5):end.value;sync();}
      if(checkbox.checked)hint.hidden=false;
    });
    load();
    save.addEventListener('click',async()=>{
      if(saving)return;
      errorEl.classList.remove('show');
      if(checkbox.checked&&!ready){showError('Brak dwóch zdjęć z różnymi godzinami. Odznacz opcję, aby wpisać czas ręcznie.');return;}
      if(!date.value){showError('Podaj datę prania.');return;}
      const minutes=durationMinutes(start.value,end.value);
      if(!start.value||!end.value||minutes===null||minutes<=0){showError('Podaj poprawne godziny początku i końca prania.');return;}
      const amount=Number(costInput.value);
      if(!costInput.value || !Number.isFinite(amount) || amount<0){showError('Podaj poprawną kwotę finalną.');return;}
      const cost=Math.round(amount*100)/100;
      const washDate=date.value,durationHours=minutes/60;
      saving=true;save.disabled=true;save.textContent='Zapisuję…';
      try{
        const {data:saved,error:saveError}=await cfSupabase.from('wash_records').update({
          approved:true,wash_date:washDate,wash_start_time:start.value,wash_end_time:end.value,
          duration_hours:durationHours,cost
        }).eq('id',id).eq('approved',false).eq('paid',false).select('id').maybeSingle();
        if(saveError)throw saveError;
        if(!saved)throw new Error('Nie udało się zapisać prania. Odśwież listę i spróbuj ponownie.');
        saving=false;close();
        window.cfApplyCompletedWashLocal?.({
          id,washDate,start:start.value,end:end.value,durationHours,cost,
          performer:row.performed_by,notes:row.completion_notes
        });
        if(typeof loadAll==='function')Promise.resolve(loadAll()).catch(err=>console.warn('CleanFleet BUS refresh:',err));
        else{
          try{if(typeof renderAttentionPanel==='function')renderAttentionPanel();}catch(_){}
          try{if(typeof renderRecords==='function')renderRecords();}catch(_){}
        }
        toast('Oznaczono jako wykonane · '+durationLabel(start.value,end.value));
      }catch(saveError){
        saving=false;save.disabled=false;save.textContent='Zapisz i oznacz jako wykonane';
        showError(saveError?.message||'Nie udało się zakończyć prania.');
      }
    });
  }

  document.addEventListener('click',async e=>{
    const btn=e.target.closest?.('[data-toggle-zatw]');
    if(!btn)return;
    const id=String(btn.getAttribute('data-toggle-zatw')||'');
    if(!id)return;

    const alreadyDone=btn.classList.contains('on');
    if(alreadyDone)return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if(!canComplete()){
      toast('Zakończyć pranie może administrator lub Pracownik CleanFleet z dostępem do tej firmy.');
      return;
    }

    const rec=(typeof records!=='undefined'&&Array.isArray(records))
      ? records.find(r=>String(r?.id||'')===id)
      : null;
    const type=String(rec?.typ||'').trim().toUpperCase();

    if(type==='BUS'){
      try{
        await completeBus(id);
      }catch(err){
        console.error('CleanFleet quick BUS completion:',err);
        toast(err?.message||'Nie udało się oznaczyć prania jako wykonanego.');
      }
      return;
    }

    openCompletion(id);
  },true);

  window.cfOpenWashCompletion=openCompletion;
  window.cfShowServiceCatalog=()=>openCatalogManager();
})();
