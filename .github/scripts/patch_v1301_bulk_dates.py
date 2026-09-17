from pathlib import Path
import re, subprocess

INDEX_SHA='7070a1ac92de6296fb2d94c83c3e6e26cd0a593e'
SW_SHA='38eec01b393fd5cee52b52fabb0a117cdb35bc77'

def blob(path):
    return subprocess.check_output(['git','hash-object',path], text=True).strip()

assert blob('app/index.html') == INDEX_SHA, f'index changed: {blob("app/index.html")}'
assert blob('app/sw.js') == SW_SHA, f'sw changed: {blob("app/sw.js")}'

p=Path('app/index.html')
s=p.read_text()

start="    document.getElementById('cfBulkAddWash')?.addEventListener('click',async e=>{"
end="    return true;"
start_pos=s.find(start)
assert start_pos!=-1, 'bulk handler start not found'
end_pos=s.find(end,start_pos)
assert end_pos!=-1, 'bulk handler end not found'
old=s[start_pos:end_pos]
assert old.count("cfSupabase.from('wash_records')") == 2, 'unexpected bulk handler structure'

new=r'''    document.getElementById('cfBulkAddWash')?.addEventListener('click',e=>{
      const selected=[...document.querySelectorAll('[data-cf-bulk-plate]:checked')].map(cb=>String(cb.dataset.cfBulkPlate||'').toUpperCase()).filter(Boolean);
      if(!selected.length){showToast('Zaznacz przynajmniej jeden pojazd.');return;}
      if(!cfSupabase||!cfActiveCompanyId){showToast('Brak aktywnej firmy.');return;}

      const dateOverlay=document.createElement('div');
      dateOverlay.className='overlay';
      dateOverlay.id='cfBulkDatesOverlay';
      dateOverlay.innerHTML=`<div class="sheet" style="max-width:560px;">
        <button class="close" id="cfBulkDatesClose">&times;</button>
        <h2>Uzupełnij dane zlecenia</h2>
        <div class="confirm-text" style="margin-bottom:14px;">Te same daty zostaną zapisane dla ${selected.length} zaznaczonych pojazdów.</div>
        <div class="form-grid">
          <label><span>Data zlecenia</span><input type="date" id="cfBulkOrderDate" value="${cfBulkLocalDate()}" required></label>
          <label><span>Termin wykonania</span><input type="date" id="cfBulkDueDate" required></label>
        </div>
        <div class="sheet-actions" style="margin-top:16px;">
          <button type="button" class="btn" id="cfBulkDatesCancel">Anuluj</button>
          <button type="button" class="btn btn-solid" id="cfBulkDatesConfirm">Dodaj do prania</button>
        </div>
      </div>`;
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
            inserts.push({id:uid(),company_id:cfActiveCompanyId,plate:canonical,type:info.typ||'',brand:info.marka||'',billing_category:null,ordered:true,ordered_by:'',order_date:orderDate,order_due_date:dueDate,priority:null,schedule_status:null,schedule_proposed_date:null,schedule_proposed_by:null,schedule_proposed_at:null,schedule_confirmed_by:null,schedule_confirmed_at:null,schedule_note:null,notes:'',wash_date:null,wash_start_time:null,wash_end_time:null,performed_by:'',cost:0,approved:false,paid:false,created_at:new Date(Date.now()+index).toISOString(),created_by:cfCurrentUserId||null});
            pending.add(key);
          });
          if(inserts.length){const {error}=await cfSupabase.from('wash_records').insert(inserts);if(error)throw error;}
          await loadAll();
          closeDates();
          closeModal();
          try{renderAttentionPanel();renderRecords();}catch(_){}
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
'''
s=s[:start_pos]+new+s[end_pos:]

assert 'order_date:orderDate,order_due_date:dueDate' in s
assert 'Uzupełnij dane zlecenia' in s

# Bump visible version in source to the maintenance release carrying this UX fix.
s=s.replace('Wersja aplikacji: v1.30.0','Wersja aplikacji: v1.30.1')
assert 'Wersja aplikacji: v1.30.1' in s
p.write_text(s)

p=Path('app/sw.js')
s=p.read_text()
count=s.count('Wersja aplikacji: v1.30.0')
assert count>=1, f'expected v1.30.0 version markers in sw, got {count}'
s=s.replace('Wersja aplikacji: v1.30.0','Wersja aplikacji: v1.30.1')
# Also make the version correction resilient if a later script rewrites the label.
old='<script>try{const v=document.getElementById("cfAppVersion");if(v)v.textContent="Wersja aplikacji: v1.30.1";}catch(_){}</script>'
new='<script>try{const f=()=>{const v=document.getElementById("cfAppVersion");if(v&&v.textContent!=="Wersja aplikacji: v1.30.1")v.textContent="Wersja aplikacji: v1.30.1";};f();setTimeout(f,250);setTimeout(f,1200);}catch(_){}</script>'
assert old in s, 'version injection marker not found'
s=s.replace(old,new,1)
p.write_text(s)

subprocess.run(['git','diff','--check'],check=True)
