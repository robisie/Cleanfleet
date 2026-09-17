(()=>{
  'use strict';

  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function registryMap(){
    const m=new Map();
    try{Object.keys(registry||{}).forEach(p=>m.set(norm(p),p));}catch(_){ }
    return m;
  }

  function parseMulti(raw){
    const text=String(raw||'').trim();
    if(!text) return [];
    const map=registryMap();
    let parts=[];

    if(/[\n,;|]+/.test(text)){
      parts=text.split(/[\n,;|]+/);
    }else{
      const ws=text.split(/\s+/).filter(Boolean);
      if(ws.length>1 && ws.every(x=>map.has(norm(x)))) parts=ws;
      else return [];
    }

    const out=[];
    const seen=new Set();
    for(const part of parts){
      const p=norm(part);
      if(!p || seen.has(p)) continue;
      seen.add(p);out.push(p);
    }
    return out.length>1?out:[];
  }

  function activeForPlate(plate){
    try{return (records||[]).some(r=>norm(r.tablica)===norm(plate) && !r.data_prania && !r.zaplacone);}catch(_){return false}
  }

  function showBulk(raw){
    const wanted=parseMulti(raw);
    if(wanted.length<2) return false;
    const map=registryMap();
    const rows=wanted.map(q=>{
      const plate=map.get(q)||'';
      if(!plate) return {query:q,plate:'',found:false,active:false,info:{}};
      const info=(registry&&registry[plate])||{};
      return {query:q,plate,found:true,active:activeForPlate(plate),info};
    });
    const found=rows.filter(x=>x.found);
    const selectable=found.filter(x=>!x.active);

    const html=`
      <div class="confirm-text" style="margin-bottom:10px;">Rozpoznano ${rows.length} tablic. Zaznacz pojazdy, dla których chcesz utworzyć nowe wpisy prania.</div>
      <div class="records cf-bulk-search-list">
        ${rows.map((x,i)=>{
          if(!x.found) return `<div class="record-card" style="margin-bottom:8px;border-left:4px solid var(--red);"><div class="record-top"><div><div class="record-plate">${esc(x.query)}</div><div class="record-meta">Nie znaleziono pojazdu w tej firmie</div></div></div></div>`;
          const status=x.active?'Już ma aktywny wpis — pominięto':'Gotowy do dodania';
          return `<label class="record-card cf-bulk-search-row" style="margin-bottom:8px;display:block;${x.active?'opacity:.62;':''}">
            <div class="record-top" style="align-items:center;gap:10px;">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                <input type="checkbox" data-cf-bulk-index="${i}" ${x.active?'disabled':'checked'} style="width:20px;height:20px;flex:0 0 auto;">
                <div><div class="record-plate">${esc(x.plate)}</div><div class="record-meta">${esc(x.info.marka||'—')} · ${esc(x.info.typ||'—')}${x.info.numer_taborowy?` · Tabor: ${esc(x.info.numer_taborowy)}`:''}</div></div>
              </div>
              <div class="record-meta" style="text-align:right;${x.active?'color:var(--orange);':'color:var(--green);'}"><strong>${esc(status)}</strong></div>
            </div>
          </label>`;
        }).join('')}
      </div>
      <div class="sheet-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-solid" id="cfBulkAddWash" ${selectable.length?'':'disabled'}>Dodaj zaznaczone do prania</button>
      </div>`;

    reportShell('Wyszukiwanie wielu pojazdów','',html);
    const input=document.getElementById('searchInput');if(input) input.value='';

    document.getElementById('cfBulkAddWash')?.addEventListener('click',async e=>{
      const btn=e.currentTarget;
      const selected=[...document.querySelectorAll('[data-cf-bulk-index]:checked')]
        .map(cb=>rows[Number(cb.dataset.cfBulkIndex)])
        .filter(x=>x?.found && !x.active);
      if(!selected.length){showToast('Zaznacz przynajmniej jeden pojazd.');return;}

      btn.disabled=true;btn.textContent='Dodaję…';
      let ok=0;const failed=[];
      for(let i=0;i<selected.length;i++){
        const x=selected[i];
        const info=x.info||{};
        const rec={
          id:uid(),
          created_by:cfCurrentUserId,
          tablica:x.plate,
          typ:typeof cfCanonicalWashType==='function'?cfCanonicalWashType(info.typ||''):(info.typ||''),
          marka:info.marka||'',
          billing_category:null,
          zlecone:false,
          kto_zlecil:'',
          data_zlecenia:'',
          priority:null,
          data_zlecenia_do:'',
          schedule_status:'',
          schedule_proposed_date:'',
          schedule_proposed_by:null,
          schedule_proposed_at:null,
          schedule_confirmed_by:null,
          schedule_confirmed_at:null,
          schedule_note:'',
          uwagi:'',
          data_prania:'',
          kto_wykonal:'',
          koszt:0,
          zatwierdzone:false,
          zaplacone:false,
          created_at:Date.now()+i
        };
        records.push(rec);
        try{await saveRecords(rec.id);ok++;}
        catch(err){
          records=records.filter(r=>r.id!==rec.id);
          failed.push(x.plate);
          console.error('CleanFleet bulk add:',x.plate,err);
        }
      }

      closeModal();
      try{renderAttentionPanel();renderRecords();}catch(_){ }
      if(failed.length) showToast(`Dodano ${ok} wpisów. Nie udało się dodać: ${failed.join(', ')}`);
      else showToast(`Dodano ${ok} ${ok===1?'wpis':'wpisów'} do prania`);
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
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    try{if(typeof cfHideSearchSuggestions==='function') cfHideSearchSuggestions();}catch(_){ }
    showBulk(raw);
  }

  function boot(){
    document.addEventListener('click',intercept,true);
    document.addEventListener('keydown',intercept,true);
    const input=document.getElementById('searchInput');
    if(input) input.setAttribute('placeholder','np. ST7765X lub kilka tablic po przecinku');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();