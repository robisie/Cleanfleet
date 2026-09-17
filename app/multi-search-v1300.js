(()=>{
  'use strict';

  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function registryMap(){
    const map=new Map();
    try{
      Object.keys(registry||{}).forEach(plate=>{
        const key=norm(plate);
        if(key) map.set(key,plate);
      });
    }catch(_){ }
    return map;
  }

  function parseMulti(raw){
    const text=String(raw||'').trim();
    if(!text || !/[\n,;]/.test(text)) return [];
    const parts=text.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);
    if(parts.length<2) return [];
    const out=[];
    const seen=new Set();
    for(const part of parts){
      const key=norm(part);
      if(!key || seen.has(key)) continue;
      seen.add(key);
      out.push({raw:part.toUpperCase(),key});
    }
    return out.length>1?out:[];
  }

  function activeForPlate(plate){
    try{
      return (records||[]).some(r=>norm(r.tablica)===norm(plate) && !!r.zlecone && !r.data_prania);
    }catch(_){ return false; }
  }

  function localDateISO(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function buildRows(items){
    const map=registryMap();
    return items.map(item=>{
      const plate=map.get(item.key)||'';
      if(!plate) return {query:item.raw,key:item.key,plate:'',found:false,active:false,info:{}};
      const info=(registry&&registry[plate])||{};
      return {query:item.raw,key:item.key,plate,found:true,active:activeForPlate(plate),info};
    });
  }

  function showBulk(raw){
    const items=parseMulti(raw);
    if(items.length<2) return false;
    const rows=buildRows(items);
    const found=rows.filter(x=>x.found);
    const unknown=rows.filter(x=>!x.found);
    const selectable=found.filter(x=>!x.active);

    const foundHtml=found.length?found.map((x,i)=>{
      const status=x.active?'Już oczekuje na pranie':'Gotowy do dodania';
      return `<label class="record-card cf-bulk-search-row" style="margin-bottom:8px;display:block;${x.active?'opacity:.62;':''}">
        <div class="record-top" style="align-items:center;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <input type="checkbox" data-cf-bulk-plate="${esc(x.plate)}" ${x.active?'disabled':'checked'} style="width:20px;height:20px;flex:0 0 auto;">
            <div>
              <div class="record-plate">${esc(x.plate)}</div>
              <div class="record-meta">${esc(x.info.marka||'—')} · ${esc(x.info.typ||'—')}${x.info.numer_taborowy?` · Tabor: ${esc(x.info.numer_taborowy)}`:''}</div>
            </div>
          </div>
          <div class="record-meta" style="text-align:right;${x.active?'color:var(--orange);':'color:var(--green);'}"><strong>${esc(status)}</strong></div>
        </div>
      </label>`;
    }).join(''):'<div class="confirm-text">Nie znaleziono żadnego pojazdu z podanych tablic.</div>';

    const unknownHtml=unknown.length?`<div style="margin-top:14px;">
      <div class="confirm-text" style="font-weight:700;margin-bottom:6px;">Nierozpoznane tablice (${unknown.length})</div>
      ${unknown.map(x=>`<div class="record-card" style="margin-bottom:6px;border-left:4px solid var(--red);"><div class="record-plate">${esc(x.query)}</div><div class="record-meta">Nie znaleziono pojazdu w tej firmie</div></div>`).join('')}
    </div>`:'';

    const html=`
      <div class="confirm-text" style="margin-bottom:10px;">Znaleziono ${found.length} ${found.length===1?'pojazd':'pojazdów'} z ${rows.length} podanych tablic.</div>
      <div class="records cf-bulk-search-list">${foundHtml}</div>
      ${unknownHtml}
      <div class="sheet-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-solid" id="cfBulkAddWash" ${selectable.length?'':'disabled'}>Dodaj zaznaczone do prania</button>
      </div>`;

    reportShell('Wyszukiwanie wielu pojazdów','',html);

    document.getElementById('cfBulkAddWash')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      const selected=[...document.querySelectorAll('[data-cf-bulk-plate]:checked')]
        .map(cb=>String(cb.dataset.cfBulkPlate||'').toUpperCase())
        .filter(Boolean);
      if(!selected.length){ showToast('Zaznacz przynajmniej jeden pojazd.'); return; }
      if(!cfSupabase || !cfActiveCompanyId){ showToast('Brak aktywnej firmy.'); return; }

      btn.disabled=true;
      btn.textContent='Dodaję…';
      try{
        const {data:pendingRows,error:pendingError}=await cfSupabase
          .from('wash_records')
          .select('id,plate,ordered,wash_date')
          .eq('company_id',cfActiveCompanyId)
          .eq('ordered',true)
          .is('wash_date',null);
        if(pendingError) throw pendingError;

        const pending=new Set((pendingRows||[]).map(r=>norm(r.plate)).filter(Boolean));
        const map=registryMap();
        const inserts=[];
        const skipped=[];

        selected.forEach((plate,index)=>{
          const key=norm(plate);
          if(!key || pending.has(key)){ skipped.push(plate); return; }
          const canonicalPlate=map.get(key);
          if(!canonicalPlate){ skipped.push(plate); return; }
          const info=(registry&&registry[canonicalPlate])||{};
          inserts.push({
            id:uid(),
            company_id:cfActiveCompanyId,
            plate:canonicalPlate,
            type:typeof cfCanonicalWashType==='function'?cfCanonicalWashType(info.typ||''):(info.typ||''),
            brand:info.marka||'',
            billing_category:null,
            ordered:true,
            ordered_by:'',
            order_date:localDateISO(),
            order_due_date:null,
            priority:null,
            schedule_status:null,
            schedule_proposed_date:null,
            schedule_proposed_by:null,
            schedule_proposed_at:null,
            schedule_confirmed_by:null,
            schedule_confirmed_at:null,
            schedule_note:null,
            notes:'',
            wash_date:null,
            wash_start_time:null,
            wash_end_time:null,
            performed_by:'',
            cost:0,
            approved:false,
            paid:false,
            created_at:new Date(Date.now()+index).toISOString(),
            created_by:cfCurrentUserId||null
          });
          pending.add(key);
        });

        if(inserts.length){
          const {error}=await cfSupabase.from('wash_records').insert(inserts);
          if(error) throw error;
        }

        await loadAll();
        closeModal();
        try{ renderAttentionPanel(); renderRecords(); }catch(_){ }
        if(inserts.length && skipped.length) showToast(`Dodano ${inserts.length} wpisów. Pominięto ${skipped.length}, bo już oczekują na pranie.`);
        else if(inserts.length) showToast(`Dodano ${inserts.length} ${inserts.length===1?'wpis':'wpisów'} do prania.`);
        else showToast('Nie dodano nowych wpisów — zaznaczone pojazdy już oczekują na pranie.');
      }catch(err){
        console.error('CleanFleet bulk add:',err);
        btn.disabled=false;
        btn.textContent='Dodaj zaznaczone do prania';
        showToast('Nie udało się dodać wpisów: '+(err?.message||'błąd'));
      }
    });
    return true;
  }

  function intercept(e){
    const input=document.getElementById('searchInput');
    if(!input) return;
    if(e.type==='click'){
      if(!e.target.closest?.('#searchBtn')) return;
    }else if(e.type==='keydown'){
      if(e.target!==input || e.key!=='Enter') return;
    }else return;

    const raw=input.value||'';
    if(parseMulti(raw).length<2) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try{ if(typeof cfHideSearchSuggestions==='function') cfHideSearchSuggestions(); }catch(_){ }
    showBulk(raw);
  }

  function boot(){
    document.addEventListener('click',intercept,true);
    document.addEventListener('keydown',intercept,true);
    const input=document.getElementById('searchInput');
    if(input) input.setAttribute('placeholder','np. ST7765X lub kilka tablic po przecinku');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();