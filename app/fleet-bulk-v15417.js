(function(){
  'use strict';

  const state={selected:new Map(),lastSearch:[]};

  function norm(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function esc(v){return typeof escapeHtml==='function'?escapeHtml(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function parse(raw){
    const text=String(raw||'').trim();
    if(!text)return[];
    let parts=text.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);
    if(parts.length===1 && /^([A-Z0-9-]+\s+){1,}[A-Z0-9-]+$/i.test(text)){
      const tokens=text.split(/\s+/).filter(Boolean);
      if(tokens.every(x=>norm(x).length>=5))parts=tokens;
    }
    const seen=new Set(),out=[];
    for(const p of parts){const key=norm(p);if(key&&!seen.has(key)){seen.add(key);out.push({raw:String(p).toUpperCase(),key});}}
    return out;
  }
  function registryMap(){
    const map=new Map();
    Object.keys(registry||{}).forEach(plate=>{const k=norm(plate);if(k)map.set(k,plate);});
    return map;
  }
  function selectedEntries(){return [...state.selected.values()];}
  function updateSelectionUi(){
    const count=state.selected.size;
    const label=document.getElementById('cfFleetSelectedCount');
    if(label)label.textContent='Wybrano: '+count;
    document.querySelectorAll('[data-cf-fleet-action]').forEach(btn=>btn.disabled=!count);
    document.querySelectorAll('[data-cf-fleet-select]').forEach(cb=>{cb.checked=state.selected.has(norm(cb.value));});
    document.querySelectorAll('[data-cf-fleet-table-select]').forEach(cb=>{cb.checked=state.selected.has(norm(cb.value));});
  }
  function setSelected(item,on){
    const key=norm(item.plate||item.query);
    if(!key)return;
    if(on)state.selected.set(key,item);
    else state.selected.delete(key);
    updateSelectionUi();
  }
  function itemForPlate(plate){
    const info=registry?.[plate]||{};
    return {query:plate,plate,exists:true,inFleet:info.in_fleet!==false,info};
  }
  function renderSearchResults(){
    const host=document.getElementById('cfFleetBulkResults');
    if(!host)return;
    if(!state.lastSearch.length){host.innerHTML='';host.hidden=true;return;}
    host.hidden=false;
    host.innerHTML='<div class="cf-fleet-bulk-result-list">'+state.lastSearch.map(item=>{
      const key=norm(item.plate||item.query);
      const status=!item.exists?'Nie ma jeszcze w bazie':item.inFleet?'Aktywny w flocie':'Poza aktywną flotą';
      const info=item.info||{};
      return '<label class="cf-fleet-bulk-result '+(!item.exists?'is-new':(!item.inFleet?'is-inactive':''))+'">'+
        '<input type="checkbox" data-cf-fleet-select value="'+esc(item.plate||item.query)+'" '+(state.selected.has(key)?'checked':'')+'>'+
        '<span><strong>'+esc(item.plate||item.query)+'</strong><small>'+esc([info.marka,info.typ,status].filter(Boolean).join(' · '))+'</small></span>'+
        '</label>';
    }).join('')+'</div>';
    host.querySelectorAll('[data-cf-fleet-select]').forEach(cb=>cb.addEventListener('change',()=>{
      const item=state.lastSearch.find(x=>norm(x.plate||x.query)===norm(cb.value));
      if(item)setSelected(item,cb.checked);
    }));
  }
  function doSearch(){
    const input=document.getElementById('cfFleetBulkSearch');
    const items=parse(input?.value||'');
    if(!items.length){showToast('Wpisz co najmniej jedną tablicę.');return;}
    const map=registryMap();
    state.lastSearch=items.map(x=>{
      const plate=map.get(x.key)||'';
      if(!plate)return{query:x.raw,plate:'',exists:false,inFleet:false,info:{}};
      return itemForPlate(plate);
    });
    state.selected.clear();
    state.lastSearch.forEach(item=>setSelected(item,true));
    renderSearchResults();
    updateSelectionUi();
  }
  function commonFieldsHtml(mode){
    return '<div class="confirm-text">Te same uzupełnione wartości zostaną zapisane we wszystkich wybranych pojazdach. Puste pola nie zmienią istniejących danych.</div>'+
      '<div class="cf-fleet-bulk-edit-grid">'+
      '<label class="field"><span>Typ</span><input id="cfFleetBulkType" type="text" list="cfFleetBulkTypeList" placeholder="bez zmian"><datalist id="cfFleetBulkTypeList">'+((options?.typ||[]).map(x=>'<option value="'+esc(x)+'">').join(''))+'</datalist></label>'+
      '<label class="field"><span>Marka</span><input id="cfFleetBulkBrand" type="text" list="cfFleetBulkBrandList" placeholder="bez zmian"><datalist id="cfFleetBulkBrandList">'+((options?.marka||[]).map(x=>'<option value="'+esc(x)+'">').join(''))+'</datalist></label>'+
      '<label class="field"><span>Model</span><input id="cfFleetBulkModel" type="text" placeholder="bez zmian"></label>'+
      '<label class="field"><span>Rocznik</span><input id="cfFleetBulkYear" type="number" min="1950" max="2100" placeholder="bez zmian"></label>'+
      '<label class="field cf-span-2"><span>Spółka rozliczeniowa</span><select id="cfFleetBulkBilling"><option value="__NOCHANGE__">Bez zmian</option>'+cfBillingCompanyOptions('',true)+'</select></label>'+
      '<label class="field cf-span-2"><span>Uwagi o pojeździe</span><textarea id="cfFleetBulkNotes" rows="3" placeholder="bez zmian"></textarea></label>'+
      '</div>';
  }
  function readCommon(){
    const yearRaw=String(document.getElementById('cfFleetBulkYear')?.value||'').trim();
    let year;
    if(yearRaw){
      year=Number(yearRaw);
      if(!Number.isInteger(year)||year<1950||year>2100){showToast('Sprawdź rocznik.');return null;}
    }
    const billing=String(document.getElementById('cfFleetBulkBilling')?.value||'__NOCHANGE__');
    const patch={};
    const type=String(document.getElementById('cfFleetBulkType')?.value||'').trim();
    const brand=String(document.getElementById('cfFleetBulkBrand')?.value||'').trim();
    const model=String(document.getElementById('cfFleetBulkModel')?.value||'').trim();
    const notes=String(document.getElementById('cfFleetBulkNotes')?.value||'').trim();
    if(type)patch.type=type;
    if(brand)patch.brand=brand;
    if(model)patch.model=model;
    if(yearRaw)patch.production_year=year;
    if(notes)patch.vehicle_notes=notes;
    if(billing!=='__NOCHANGE__'){
      patch.billing_company_id=billing||null;
      patch.currency=cfBillingCompanyCurrency(billing||null,'PLN');
    }
    return patch;
  }
  async function updateBatches(plates,patch){
    for(let i=0;i<plates.length;i+=75){
      const batch=plates.slice(i,i+75);
      const {error}=await cfSupabase.from('vehicles').update(patch).eq('company_id',cfActiveCompanyId).in('plate',batch);
      if(error)throw error;
    }
  }
  async function refreshList(message){
    if(typeof loadAll==='function')await loadAll();
    state.selected.clear();
    if(typeof showAllOutstanding==='function')await showAllOutstanding();
    if(message)showToast(message);
  }
  function openCommonModal(mode){
    const chosen=selectedEntries();
    if(!chosen.length)return;
    const existing=chosen.filter(x=>x.exists);
    if(mode==='edit'&&!existing.length){showToast('Zaznaczone tablice nie istnieją jeszcze w bazie.');return;}
    const root=document.getElementById('modalRoot');
    const previous=document.getElementById('cfFleetBulkEditOverlay');previous?.remove();
    const overlay=document.createElement('div');
    overlay.className='overlay';overlay.id='cfFleetBulkEditOverlay';overlay.style.zIndex='100001';
    const title=mode==='add'?'Dodaj do floty':'Edytuj zaznaczone pojazdy';
    overlay.innerHTML='<div class="sheet cf-fleet-bulk-edit-sheet"><button class="close" data-close type="button">&times;</button><h2>'+title+'</h2>'+
      '<div class="confirm-text" style="margin-bottom:10px;">Wybrano <strong>'+chosen.length+'</strong> pojazdów.</div>'+
      commonFieldsHtml(mode)+
      '<div class="sheet-actions"><button type="button" class="btn btn-outline" data-close>Anuluj</button><button type="button" class="btn btn-solid" id="cfFleetBulkSave">'+(mode==='add'?'Dodaj do floty':'Zapisz zmiany')+'</button></div></div>';
    document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.getElementById('cfFleetBulkSave')?.addEventListener('click',async e=>{
      const btn=e.currentTarget,patch=readCommon();if(!patch)return;
      btn.disabled=true;btn.textContent='Zapisuję…';
      try{
        if(mode==='edit'){
          await updateBatches(existing.map(x=>x.plate),patch);
        }else{
          const existingPlates=existing.map(x=>x.plate);
          if(existingPlates.length)await updateBatches(existingPlates,{...patch,in_fleet:true,fleet_removed_at:null});
          const unknown=chosen.filter(x=>!x.exists);
          if(unknown.length){
            const payloads=unknown.map(x=>({
              plate:norm(x.query),company_id:cfActiveCompanyId,type:'',brand:'',...patch,in_fleet:true,fleet_removed_at:null
            }));
            for(let i=0;i<payloads.length;i+=75){
              const {error}=await cfSupabase.from('vehicles').insert(payloads.slice(i,i+75));
              if(error)throw error;
            }
          }
        }
        close();
        await refreshList(mode==='add'?'Pojazdy dodane do aktywnej floty.':'Zapisano zmiany w pojazdach.');
      }catch(error){
        console.error('CleanFleet fleet bulk save:',error);
        showToast('Nie udało się zapisać zmian: '+(error?.message||'błąd'));
        btn.disabled=false;btn.textContent=mode==='add'?'Dodaj do floty':'Zapisz zmiany';
      }
    });
  }
  function removeSelected(){
    const plates=selectedEntries().filter(x=>x.exists&&x.inFleet).map(x=>x.plate);
    if(!plates.length){showToast('Wśród zaznaczonych nie ma aktywnych pojazdów floty.');return;}
    showConfirm(
      'Usunąć z aktywnej floty?',
      'Wybrane pojazdy ('+plates.length+') znikną z aktywnej listy floty. Ich karty, historia prań, zdjęcia i rozliczenia pozostaną w bazie.',
      async()=>{
        try{
          await updateBatches(plates,{in_fleet:false,fleet_removed_at:new Date().toISOString()});
          await refreshList('Pojazdy usunięte z aktywnej floty. Historia została zachowana.');
        }catch(error){showToast('Nie udało się usunąć pojazdów z floty: '+(error?.message||'błąd'));}
      }
    );
  }
  function mountTableCheckboxes(){
    const table=document.getElementById('allVehiclesTable');if(!table)return;
    const head=table.querySelector('thead tr');
    if(head&&!head.querySelector('[data-cf-fleet-select-head]')){
      const th=document.createElement('th');th.dataset.cfFleetSelectHead='1';th.textContent='✓';head.prepend(th);
    }
    table.querySelectorAll('tbody tr').forEach(row=>{
      if(row.querySelector('[data-cf-fleet-table-select]'))return;
      const plate=row.querySelector('[data-vehicle-profile]')?.getAttribute('data-vehicle-profile')||'';
      const td=document.createElement('td');
      td.innerHTML='<input type="checkbox" data-cf-fleet-table-select value="'+esc(plate)+'" aria-label="Zaznacz '+esc(plate)+'">';
      row.prepend(td);
      const cb=td.querySelector('input');
      cb.checked=state.selected.has(norm(plate));
      cb.addEventListener('change',()=>setSelected(itemForPlate(plate),cb.checked));
    });
  }
  function ensureStyles(){
    if(document.getElementById('cfFleetBulkStyles'))return;
    const style=document.createElement('style');style.id='cfFleetBulkStyles';
    style.textContent=`
      .cf-fleet-bulk-toolbar{margin:14px 0;padding:12px;border:1px solid var(--line,#dfe3df);border-radius:12px;background:#f8f8f5}
      .cf-fleet-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch}
      .cf-fleet-search-row textarea{box-sizing:border-box;width:100%;min-height:46px;resize:vertical;border:1px solid var(--line-strong,#ccd2cd);border-radius:9px;background:#fff;padding:10px 12px;font:600 13px/1.35 'JetBrains Mono',monospace;text-transform:uppercase}
      .cf-fleet-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
      .cf-fleet-actions strong{margin-right:auto;font-size:12px}
      .cf-fleet-bulk-result-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}
      .cf-fleet-bulk-result{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid var(--line,#dfe3df);border-radius:9px;background:#fff;min-width:0}
      .cf-fleet-bulk-result.is-inactive{border-style:dashed}.cf-fleet-bulk-result.is-new{background:#fffdf2}
      .cf-fleet-bulk-result input{width:18px;height:18px;flex:0 0 auto}
      .cf-fleet-bulk-result span{display:flex;flex-direction:column;min-width:0}.cf-fleet-bulk-result strong{font:800 12px/1.2 'JetBrains Mono',monospace}.cf-fleet-bulk-result small{margin-top:3px;color:var(--ink-soft,#747b76);font-size:10px;white-space:normal}
      .cf-fleet-bulk-edit-sheet{max-width:680px!important}.cf-fleet-bulk-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-top:12px}.cf-fleet-bulk-edit-grid .cf-span-2{grid-column:span 2}
      .cf-fleet-inactive-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;padding:10px 12px;border:1px solid #e2b866;border-radius:10px;background:#fff8e8;color:#674a10;font-size:12px}.cf-fleet-inactive-banner span{font-size:10px;opacity:.85}
      #allVehiclesTable th:first-child,#allVehiclesTable td:first-child{text-align:center;width:34px}
      @media(max-width:620px){
        .cf-fleet-search-row{grid-template-columns:1fr}.cf-fleet-search-row .btn{width:100%}
        .cf-fleet-bulk-result-list{grid-template-columns:1fr}
        .cf-fleet-actions{align-items:stretch}.cf-fleet-actions strong{width:100%;margin:0}.cf-fleet-actions .btn{flex:1 1 calc(50% - 8px);min-width:120px}
        .cf-fleet-bulk-edit-grid{grid-template-columns:1fr}.cf-fleet-bulk-edit-grid .cf-span-2{grid-column:span 1}
        .cf-fleet-inactive-banner{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }
  function bind(){
    ensureStyles();
    const table=document.getElementById('allVehiclesTable');if(!table)return;
    if(!document.getElementById('cfFleetBulkToolbar')){
      const toolbar=document.createElement('section');
      toolbar.id='cfFleetBulkToolbar';
      toolbar.className='cf-fleet-bulk-toolbar';
      toolbar.innerHTML='<div class="cf-fleet-search-row"><textarea id="cfFleetBulkSearch" rows="2" placeholder="Wklej tablice, np. SB1234A, SB5678B, SB9012C"></textarea><button type="button" class="btn btn-solid" id="cfFleetBulkSearchBtn">Szukaj</button></div>'+
        '<div id="cfFleetBulkResults" hidden></div>'+
        '<div class="cf-fleet-actions"><strong id="cfFleetSelectedCount">Wybrano: '+state.selected.size+'</strong><button class="btn btn-outline" type="button" data-cf-fleet-action="edit">Edytuj dane</button><button class="btn btn-solid" type="button" data-cf-fleet-action="add">Dodaj do floty</button><button class="btn btn-danger" type="button" data-cf-fleet-action="remove">Usuń z floty</button></div>';
      const target=document.querySelector('#reportOverlay .vehicle-list-toolbar')||table.parentElement;
      target?.parentElement?.insertBefore(toolbar,target);
      document.getElementById('cfFleetBulkSearchBtn')?.addEventListener('click',doSearch);
      document.getElementById('cfFleetBulkSearch')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')doSearch();});
      toolbar.querySelector('[data-cf-fleet-action="edit"]')?.addEventListener('click',()=>openCommonModal('edit'));
      toolbar.querySelector('[data-cf-fleet-action="add"]')?.addEventListener('click',()=>openCommonModal('add'));
      toolbar.querySelector('[data-cf-fleet-action="remove"]')?.addEventListener('click',removeSelected);
    }
    mountTableCheckboxes();
    renderSearchResults();
    updateSelectionUi();
  }

  window.CFFleetBulk={bind};
})();