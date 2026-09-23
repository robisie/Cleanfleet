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
  function todayLocal(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
        font-size:13px!important;
        line-height:1.1!important;
      }
      .cf-completion-span-2{grid-column:1/-1}
      .cf-completion-duration{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:#f8f7f3;font-size:12px}
      .cf-completion-duration strong{font-size:14px}
      .cf-completion-services-wrap{margin-top:18px}
      .cf-completion-services-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .cf-completion-services-head strong{font-size:13px}
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
      .cf-completion-total-hint.manual{color:#9c6400;font-weight:700}
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
      <h2>Cennik usług</h2>
      <div class="confirm-text">Stawki używane są do automatycznego wyliczania kwoty przy zakończeniu prania. Zmiana ceny nie zmienia historycznych wykonań.</div>
      <div class="cf-service-catalog-list" id="cfServiceCatalogList"></div>
      <button class="btn btn-outline cf-service-catalog-add" id="cfServiceCatalogAdd" type="button">+ Dodaj usługę</button>
      <div class="sheet-actions">
        <button class="btn btn-outline" data-close type="button">Anuluj</button>
        <button class="btn btn-solid" id="cfServiceCatalogSave" type="button">Zapisz cennik</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
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

  async function openCompletion(id){
    if(opening)return;
    opening=true;
    injectStyles();
    try{
      if(typeof cfSupabase==='undefined')throw new Error('Brak połączenia z bazą.');
      const [{data:row,error:rowError},catalog]=await Promise.all([
        cfSupabase.from('wash_records')
          .select('id,company_id,plate,type,brand,notes,wash_date,wash_start_time,wash_end_time,performed_by,cost,approved,work_items,completion_notes')
          .eq('id',id).maybeSingle(),
        fetchCatalog(true)
      ]);
      if(rowError)throw rowError;
      if(!row)throw new Error('Nie znaleziono wpisu.');
      if(row.approved){return;}

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
          <h2>Zakończ pranie</h2>
          <span class="cf-completion-plate">${esc(row.plate||'')}</span>
        </div>
        <div class="cf-completion-grid">
          <label class="field"><span>Data prania</span><input id="cfCompleteDate" type="date" value="${esc(row.wash_date||todayLocal())}"></label>
          <label class="field"><span>Kto wykonał</span><input id="cfCompletePerformer" type="text" list="cfCompletePerformerList" value="${esc(row.performed_by||'')}" placeholder="Imię / osoba"><datalist id="cfCompletePerformerList">${performerValues.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></label>
          <label class="field"><span>Godzina od</span><input id="cfCompleteStart" type="time" value="${esc(row.wash_start_time?String(row.wash_start_time).slice(0,5):'')}"></label>
          <label class="field"><span>Godzina do</span><input id="cfCompleteEnd" type="time" value="${esc(row.wash_end_time?String(row.wash_end_time).slice(0,5):'')}"></label>
          <div class="cf-completion-duration cf-completion-span-2"><span>Czas prania</span><strong id="cfCompleteDuration">—</strong></div>
        </div>

        <div class="cf-completion-services-wrap">
          <div class="cf-completion-services-head">
            <strong>Zakres wykonanych prac</strong>
            ${isAdmin()?'<button class="btn btn-outline" id="cfCompleteCatalogBtn" type="button">Cennik usług</button>':''}
          </div>
          <div class="cf-completion-services" id="cfCompleteServices"></div>
        </div>

        ${row.notes?`<div class="cf-completion-existing-note"><strong>Uwagi ze zlecenia:</strong><br>${esc(row.notes)}</div>`:''}

        <div class="cf-completion-grid">
          <label class="field cf-completion-span-2"><span>Opis wykonania</span><textarea id="cfCompleteNotes" rows="3" placeholder="Krótki opis wykonanej pracy">${esc(row.completion_notes||'')}</textarea></label>
          <div class="cf-completion-span-2 cf-completion-total-row">
            <label class="field"><span>Kwota (zł)</span><input id="cfCompleteCost" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(row.cost)||0}"><div class="cf-completion-total-hint" id="cfCompleteCostHint">Kwota wyliczana z zaznaczonych usług. Możesz ją zmienić ręcznie.</div></label>
            <button class="btn btn-outline" id="cfCompleteRecalc" type="button">Przelicz z usług</button>
          </div>
        </div>

        <div class="cf-completion-error" id="cfCompleteError" role="alert"></div>
        <div class="sheet-actions">
          <button class="btn btn-outline" data-close type="button">Anuluj</button>
          <button class="btn btn-solid" id="cfCompleteSave" type="button">Zapisz i oznacz jako wykonane</button>
        </div>
      </div>`;
      root.appendChild(overlay);

      const close=()=>overlay.remove();
      overlay.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
      overlay.addEventListener('click',e=>{if(e.target===overlay)close();});

      const servicesEl=overlay.querySelector('#cfCompleteServices');
      const costEl=overlay.querySelector('#cfCompleteCost');
      const costHint=overlay.querySelector('#cfCompleteCostHint');
      let catalogRows=catalog;
      let manualTouched=false;

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
          if(cb.checked){
            if(cb.dataset.exclusive==='1'){
              servicesEl.querySelectorAll('input[type="checkbox"]').forEach(other=>{
                if(other!==cb)other.checked=false;
              });
            }else{
              servicesEl.querySelectorAll('input[type="checkbox"][data-exclusive="1"]').forEach(other=>{other.checked=false;});
            }
          }
          if(!manualTouched)costEl.value=(Math.round(selectedTotal()*100)/100).toFixed(2);
          syncCostHint();
        }));
      };

      const syncDuration=()=>{
        overlay.querySelector('#cfCompleteDuration').textContent=durationLabel(
          overlay.querySelector('#cfCompleteStart').value,
          overlay.querySelector('#cfCompleteEnd').value
        );
      };
      const syncCostHint=()=>{
        const total=selectedTotal();
        costHint.textContent=manualTouched
          ? `Kwota wpisana ręcznie. Suma z zaznaczonych usług: ${money(total)}.`
          : `Suma z zaznaczonych usług: ${money(total)}. Pole kwoty możesz zmienić ręcznie.`;
        costHint.classList.toggle('manual',manualTouched);
      };

      renderServices(false);
      {
        const initialServicesTotal=Math.round(selectedTotal()*100)/100;
        if(initialServicesTotal>0 || !(Number(row.cost)>0)) costEl.value=initialServicesTotal.toFixed(2);
      }
      syncDuration();
      syncCostHint();
      overlay.querySelector('#cfCompleteStart')?.addEventListener('input',syncDuration);
      overlay.querySelector('#cfCompleteEnd')?.addEventListener('input',syncDuration);
      costEl?.addEventListener('input',()=>{manualTouched=true;syncCostHint();});
      overlay.querySelector('#cfCompleteRecalc')?.addEventListener('click',()=>{
        manualTouched=false;
        costEl.value=(Math.round(selectedTotal()*100)/100).toFixed(2);
        syncCostHint();
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
        if(!manualTouched)costEl.value=(Math.round(selectedTotal()*100)/100).toFixed(2);
        syncCostHint();
      }));

      overlay.querySelector('#cfCompleteSave')?.addEventListener('click',async()=>{
        const saveBtn=overlay.querySelector('#cfCompleteSave');
        const washDate=overlay.querySelector('#cfCompleteDate').value;
        const start=overlay.querySelector('#cfCompleteStart').value;
        const end=overlay.querySelector('#cfCompleteEnd').value;
        const performer=overlay.querySelector('#cfCompletePerformer').value.trim();
        const serviceIds=selectedIds();
        const cost=Number(String(costEl.value||'').replace(',','.'));
        const notes=overlay.querySelector('#cfCompleteNotes').value.trim();

        clearFormError();
        const dateEl=overlay.querySelector('#cfCompleteDate');
        const startEl=overlay.querySelector('#cfCompleteStart');
        const endEl=overlay.querySelector('#cfCompleteEnd');
        const performerEl=overlay.querySelector('#cfCompletePerformer');
        if(!washDate){showFormError('Podaj datę prania.',dateEl);return;}
        if(!start){showFormError('Podaj godzinę rozpoczęcia prania.',startEl);return;}
        if(!end){showFormError('Podaj godzinę zakończenia prania.',endEl);return;}
        if(durationMinutes(start,end)===null||durationMinutes(start,end)<=0){showFormError('Sprawdź godzinę rozpoczęcia i zakończenia prania.',endEl);return;}
        if(!performer){showFormError('Podaj, kto wykonał pranie.',performerEl);return;}
        if(!serviceIds.length){showFormError('Zaznacz co najmniej jeden zakres wykonanych prac.',servicesEl);return;}
        if(!Number.isFinite(cost)||cost<0){showFormError('Podaj poprawną kwotę.',costEl);return;}

        saveBtn.disabled=true;
        saveBtn.textContent='Zapisuję…';
        try{
          const {data,error}=await cfSupabase.rpc('cf_complete_wash_record',{
            p_wash_record_id:id,
            p_wash_date:washDate,
            p_start_time:start,
            p_end_time:end,
            p_performed_by:performer,
            p_cost:Math.round(cost*100)/100,
            p_service_ids:serviceIds,
            p_completion_notes:notes||null
          });
          if(error)throw error;
          close();
          try{
            if(typeof addOptionIfNew==='function')addOptionIfNew('kto_wykonal',performer);
          }catch(_){}
          if(typeof loadAll==='function')await loadAll();
          try{if(typeof renderAttentionPanel==='function')renderAttentionPanel();}catch(_){}
          try{if(typeof renderRecords==='function')renderRecords();}catch(_){}
          try{if(typeof cfLoadChangeNotifications==='function')await cfLoadChangeNotifications();}catch(_){}
          toast(`Pranie zakończone · ${durationLabel(start,end)} · ${money(cost)}`);
        }catch(err){
          console.error('CleanFleet complete wash:',err);
          showFormError(err?.message||'Nie udało się zakończyć prania.');
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

  async function quickCompleteBus(id){
    const rec=(typeof records!=='undefined'&&Array.isArray(records))
      ? records.find(r=>String(r?.id||'')===String(id))
      : null;

    const {error}=await cfSupabase
      .from('wash_records')
      .update({approved:true})
      .eq('id',id);

    if(error)throw error;

    if(rec) rec.zatwierdzone=true;

    if(typeof loadAll==='function'){
      await loadAll();
    }else{
      try{if(typeof renderAttentionPanel==='function')renderAttentionPanel();}catch(_){}
      try{if(typeof renderRecords==='function')renderRecords();}catch(_){}
    }

    toast('Oznaczono jako wykonane');
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
        await quickCompleteBus(id);
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
