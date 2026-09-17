from pathlib import Path
import subprocess, re

INDEX_SHA='0fa3296f7940c3f269955395063bf2d0cc3c5173'
SW_SHA='961de77f9b01b9f5180916bbc1bccc020fe5c037'

def blob(path):
    return subprocess.check_output(['git','hash-object',path], text=True).strip()

assert blob('app/index.html') == INDEX_SHA, f'index changed: {blob("app/index.html")}'
assert blob('app/sw.js') == SW_SHA, f'sw changed: {blob("app/sw.js")}'

p=Path('app/index.html')
s=p.read_text()
assert 'function cfParseMultiPlateSearch' not in s
assert 'function doSearch(){' in s

helper=r'''
  // CleanFleet v1.30.2 — isolated bulk plate search
  function cfBulkNorm(v){ return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function cfParseMultiPlateSearch(raw){
    const text=String(raw||'').trim();
    if(!text || !/[\n,;]/.test(text)) return [];
    const parts=text.split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean);
    if(parts.length<2) return [];
    const seen=new Set(),out=[];
    parts.forEach(part=>{const key=cfBulkNorm(part);if(key&&!seen.has(key)){seen.add(key);out.push({raw:part.toUpperCase(),key});}});
    return out.length>1?out:[];
  }
  function cfBulkRegistryMap(){
    const map=new Map();
    Object.keys(registry||{}).forEach(plate=>{const key=cfBulkNorm(plate);if(key)map.set(key,plate);});
    return map;
  }
  function cfBulkActive(plate){
    return (records||[]).some(r=>cfBulkNorm(r.tablica)===cfBulkNorm(plate)&&!!r.zlecone&&!r.data_prania);
  }
  function cfBulkLocalDate(){
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function cfShowBulkPlateSearch(raw){
    const items=cfParseMultiPlateSearch(raw); if(items.length<2)return false;
    const map=cfBulkRegistryMap();
    const rows=items.map(item=>{const plate=map.get(item.key)||'';const info=plate?(registry[plate]||{}):{};return{query:item.raw,plate,info,found:!!plate,active:plate?cfBulkActive(plate):false};});
    const found=rows.filter(r=>r.found),unknown=rows.filter(r=>!r.found),selectable=found.filter(r=>!r.active);
    const foundHtml=found.length?found.map(r=>`<label class="record-card cf-bulk-search-row" style="margin-bottom:8px;display:block;${r.active?'opacity:.62;':''}"><div class="record-top" style="align-items:center;gap:10px;"><div style="display:flex;align-items:center;gap:10px;min-width:0;"><input type="checkbox" data-cf-bulk-plate="${escapeHtml(r.plate)}" ${r.active?'disabled':'checked'} style="width:20px;height:20px;flex:0 0 auto;"><div><div class="record-plate">${escapeHtml(r.plate)}</div><div class="record-meta">${escapeHtml(r.info.marka||'—')} · ${escapeHtml(r.info.typ||'—')}${r.info.numer_taborowy?` · Tabor: ${escapeHtml(r.info.numer_taborowy)}`:''}</div></div></div><div class="record-meta" style="text-align:right;${r.active?'color:var(--orange);':'color:var(--green);'}"><strong>${r.active?'Już oczekuje na pranie':'Gotowy do dodania'}</strong></div></div></label>`).join(''):'<div class="confirm-text">Nie znaleziono żadnego pojazdu z podanych tablic.</div>';
    const unknownHtml=unknown.length?`<div style="margin-top:14px;"><div class="confirm-text" style="font-weight:700;margin-bottom:6px;">Nierozpoznane tablice (${unknown.length})</div>${unknown.map(r=>`<div class="record-card" style="margin-bottom:6px;border-left:4px solid var(--red);"><div class="record-plate">${escapeHtml(r.query)}</div><div class="record-meta">Nie znaleziono pojazdu w tej firmie</div></div>`).join('')}</div>`:'';
    reportShell('Wyszukiwanie wielu pojazdów','',`<div class="confirm-text" style="margin-bottom:10px;">Znaleziono ${found.length} ${found.length===1?'pojazd':'pojazdów'} z ${rows.length} podanych tablic.</div><div class="records cf-bulk-search-list">${foundHtml}</div>${unknownHtml}<div class="sheet-actions" style="margin-top:14px;"><button type="button" class="btn btn-solid" id="cfBulkAddWash" ${selectable.length?'':'disabled'}>Dodaj zaznaczone do prania</button></div>`);
    document.getElementById('cfBulkAddWash')?.addEventListener('click',()=>{
      const selected=[...document.querySelectorAll('[data-cf-bulk-plate]:checked')].map(cb=>String(cb.dataset.cfBulkPlate||'').toUpperCase()).filter(Boolean);
      if(!selected.length){showToast('Zaznacz przynajmniej jeden pojazd.');return;}
      if(!cfSupabase||!cfActiveCompanyId){showToast('Brak aktywnej firmy.');return;}

      const dateOverlay=document.createElement('div');
      dateOverlay.className='overlay';
      dateOverlay.id='cfBulkDatesOverlay';
      dateOverlay.innerHTML=`<div class="sheet" style="max-width:560px;"><button class="close" id="cfBulkDatesClose">&times;</button><h2>Uzupełnij dane zlecenia</h2><div class="confirm-text" style="margin-bottom:14px;">Te same daty zostaną zapisane dla ${selected.length} zaznaczonych pojazdów.</div><div class="form-grid"><label><span>Data zlecenia</span><input type="date" id="cfBulkOrderDate" value="${cfBulkLocalDate()}" required></label><label><span>Termin wykonania</span><input type="date" id="cfBulkDueDate" required></label></div><div class="sheet-actions" style="margin-top:16px;"><button type="button" class="btn" id="cfBulkDatesCancel">Anuluj</button><button type="button" class="btn btn-solid" id="cfBulkDatesConfirm">Dodaj do prania</button></div></div>`;
      document.body.appendChild(dateOverlay);
      const closeDates=()=>dateOverlay.remove();
      document.getElementById('cfBulkDatesClose')?.addEventListener('click',closeDates);
      document.getElementById('cfBulkDatesCancel')?.addEventListener('click',closeDates);
      dateOverlay.addEventListener('click',ev=>{if(ev.target===dateOverlay)closeDates();});

      document.getElementById('cfBulkDatesConfirm')?.addEventListener('click',async ev=>{
        const confirmBtn=ev.currentTarget;
        const orderDate=document.getElementById('cfBulkOrderDate')?.value||'';
        const dueDate=document.getElementById('cfBulkDueDate')?.value||'';
        if(!orderDate){showToast('Uzupełnij datę zlecenia.');return;}
        if(!dueDate){showToast('Uzupełnij termin wykonania.');return;}
        if(dueDate<orderDate){showToast('Termin wykonania nie może być wcześniejszy niż data zlecenia.');return;}
        confirmBtn.disabled=true;confirmBtn.textContent='Dodaję…';
        try{
          const {data:pendingRows,error:pendingError}=await cfSupabase.from('wash_records').select('id,plate,ordered,wash_date').eq('company_id',cfActiveCompanyId).eq('ordered',true).is('wash_date',null);
          if(pendingError)throw pendingError;
          const pending=new Set((pendingRows||[]).map(r=>cfBulkNorm(r.plate)).filter(Boolean));
          const freshMap=cfBulkRegistryMap(),inserts=[],skipped=[];
          selected.forEach((plate,index)=>{
            const key=cfBulkNorm(plate);
            if(!key||pending.has(key)){skipped.push(plate);return;}
            const canonical=freshMap.get(key);
            if(!canonical){skipped.push(plate);return;}
            const info=registry[canonical]||{};
            inserts.push({id:uid(),company_id:cfActiveCompanyId,plate:canonical,type:typeof cfCanonicalWashType==='function'?cfCanonicalWashType(info.typ||''):(info.typ||''),brand:info.marka||'',billing_category:null,ordered:true,ordered_by:'',order_date:orderDate,order_due_date:dueDate,priority:null,schedule_status:null,schedule_proposed_date:null,schedule_proposed_by:null,schedule_proposed_at:null,schedule_confirmed_by:null,schedule_confirmed_at:null,schedule_note:null,notes:'',wash_date:null,wash_start_time:null,wash_end_time:null,performed_by:'',cost:0,approved:false,paid:false,created_at:new Date(Date.now()+index).toISOString(),created_by:cfCurrentUserId||null});
            pending.add(key);
          });
          if(inserts.length){const {error}=await cfSupabase.from('wash_records').insert(inserts);if(error)throw error;}
          await loadAll();
          closeDates();
          closeModal();
          try{renderAttentionPanel();renderRecords();}catch(_){ }
          if(inserts.length&&skipped.length)showToast(`Dodano ${inserts.length} wpisów. Pominięto ${skipped.length}, bo już oczekują na pranie.`);
          else if(inserts.length)showToast(`Dodano ${inserts.length} ${inserts.length===1?'wpis':'wpisów'} do prania.`);
          else showToast('Nie dodano nowych wpisów — zaznaczone pojazdy już oczekują na pranie.');
        }catch(err){
          console.error('CleanFleet bulk add:',err);
          confirmBtn.disabled=false;confirmBtn.textContent='Dodaj do prania';
          showToast('Nie udało się dodać wpisów: '+(err?.message||'błąd'));
        }
      });
    });
    return true;
  }

'''

s=s.replace('  function doSearch(){', helper+'  function doSearch(){', 1)
needle="    const raw = document.getElementById('searchInput').value.trim();\n    if(!raw){ showToast('Wpisz tablicę, markę, typ, osobę lub numer faktury'); return; }"
assert needle in s
s=s.replace(needle, needle+"\n    if(cfShowBulkPlateSearch(raw)) return;", 1)

# Update source-visible version only; do not touch admin/view logic.
s=re.sub(r'Wersja aplikacji:\s*v\d+\.\d+\.\d+(?:\s*beta)?','Wersja aplikacji: v1.30.2',s,count=1)
assert 'function cfShowBulkPlateSearch' in s
assert 'if(cfShowBulkPlateSearch(raw)) return;' in s
assert 'Wersja aplikacji: v1.30.2' in s
p.write_text(s)

p=Path('app/sw.js')
s=p.read_text()
assert 'Wersja aplikacji: v1.29.1' in s
s=s.replace('Wersja aplikacji: v1.29.1','Wersja aplikacji: v1.30.2')
p.write_text(s)

# Verify no unrelated production files are touched and JS syntax remains valid enough for git diff checks.
subprocess.run(['git','diff','--check'],check=True)
changed=subprocess.check_output(['git','diff','--name-only'],text=True).strip().splitlines()
assert set(changed)=={'app/index.html','app/sw.js'}, changed
