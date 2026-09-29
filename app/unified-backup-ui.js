(function(){
  'use strict';
  const exportBtn=document.getElementById('cfUnifiedBackupExport');
  const importBtn=document.getElementById('cfUnifiedBackupImport');
  const fileInput=document.getElementById('cfUnifiedBackupFile');
  if(!exportBtn||!importBtn||!fileInput)return;
  const root=document.getElementById('modalRoot');
  const format='CleanFleet Unified Backup v2';
  function errorMessage(error){return error?.message||String(error||'Nieznany błąd');}
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  exportBtn.addEventListener('click',async()=>{
    if(!cfIsAdmin()){showToast('Backup może utworzyć tylko administrator.');return;}
    exportBtn.disabled=true;
    try{
      cfSetSync('Pobieranie całej kopii…');
      const {archive,manifest}=await CFUnifiedBackup.makeArchive(cfSupabase);
      download(archive,'CleanFleet-cala-aplikacja-'+manifest.createdAt.slice(0,19).replace(/[T:]/g,'-')+'.zip');
      cfSetSync('Backup pobrany','ok');showToast('Pobrano jeden pakiet backupu.');
      menuOverlay.classList.remove('open');
    }catch(e){console.error('Unified backup:',e);cfSetSync('Błąd tworzenia backupu','err');showToast('Backup: '+errorMessage(e));}
    finally{exportBtn.disabled=false;}
  });
  importBtn.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files?.[0];fileInput.value='';if(!file)return;
    if(!cfIsAdmin()){showToast('Tylko administrator może przywracać dane.');return;}
    try{
      cfSetSync('Sprawdzanie integralności backupu…');
      const result=await CFUnifiedBackup.inspectArchive(file);
      if(result.manifest.project!==new URL(CF_SUPABASE_URL).hostname.split('.')[0])
        throw new Error('Ta kopia pochodzi z innego projektu.');
      showSelection(result);
      cfSetSync('Backup sprawdzony','ok');
      menuOverlay.classList.remove('open');
    }catch(e){console.error('Backup read:',e);cfSetSync('Błąd pliku backupu','err');showToast('Nie udało się odczytać backupu: '+errorMessage(e));}
  });
  function showSelection(result){
    const {manifest,data}=result;
    const companies=data.tables.companies||[];
    const companyRows=companies.map(c=>`<label class="field-check" style="display:block;margin:9px 0;"><input type="checkbox" data-backup-company="${escapeHtml(String(c.id))}"> ${escapeHtml(c.short_name||c.name||c.id)} (${escapeHtml(String(c.id))})</label>`).join('');
    root.innerHTML=`<div class="overlay" id="cfUnifiedBackupOverlay"><div class="sheet" style="max-width:550px;max-height:min(85vh,850px);overflow:auto;"><button class="close" data-close type="button">&times;</button><h2>Przywróć wybrany zakres</h2><div class="confirm-text">Kopia z ${escapeHtml(manifest.createdAt)} · ${companies.length} firm.</div><div class="confirm-text">Panel administratora jest scalany. Wybrane firmy są zastępowane w całości. Konta użytkowników muszą już istnieć. Zdjęcia są pomijane: po przywróceniu wpisy nie będą miały zdjęć z kopii.</div><label class="field-check" style="display:block;margin:12px 0;"><input type="checkbox" id="cfRestoreAdminSection"> Panel administratora (lista firm, uprawnienia, konfiguracja)</label><div style="max-height:36vh;overflow:auto;">${companyRows}</div><div class="sheet-actions"><button class="btn btn-outline" data-close type="button">Anuluj</button><button class="btn btn-solid" id="cfBackupPreviewBtn" type="button">Sprawdź wybrane dane</button></div></div></div>`;
    root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModal));
    root.querySelector('#cfUnifiedBackupOverlay').addEventListener('click',e=>{if(e.target.id==='cfUnifiedBackupOverlay')closeModal();});
    root.querySelector('#cfBackupPreviewBtn').addEventListener('click',async()=>{
      const selection={admin:!!root.querySelector('#cfRestoreAdminSection').checked,
        companyIds:[...root.querySelectorAll('[data-backup-company]:checked')].map(x=>x.dataset.backupCompany)};
      if(!selection.admin&&!selection.companyIds.length){showToast('Wybierz panel albo firmę.');return;}
      const btn=root.querySelector('#cfBackupPreviewBtn');btn.disabled=true;
      const backup={format,project:manifest.project,createdBy:manifest.createdBy,tables:data.tables,users:data.users,objects:data.objects,localPhotos:manifest.localPhotos};
      try{
        const {data:preview,error}=await cfSupabase.functions.invoke('cleanfleet-backup',{body:{action:'preview',backup,selection}});
        if(error||preview?.error)throw new Error(preview?.error||error?.message);
        const count=preview.summary.reduce((sum,x)=>sum+x.count,0);
        showConfirm('Przywrócić wybrany zakres?',`Sprawdzono ${count} rekordów. Zmiany wybranych firm zostaną wykonane w jednej transakcji.`,async()=>{
          try{
            cfSetSync('Przywracanie danych…');
            const {data:done,error:restoreError}=await cfSupabase.functions.invoke('cleanfleet-backup',{body:{action:'restore',backup,selection,expectedPlanHash:preview.planHash}});
            if(restoreError||done?.error)throw new Error(done?.error||restoreError?.message);
            closeModal();cfSetSync('Backup przywrócony','ok');showToast('Przywrócono zaznaczony zakres.');
            location.reload();
          }catch(e){console.error('Backup restore:',e);cfSetSync('Błąd przywracania','err');showToast('Przywracanie: '+errorMessage(e));}
        });
      }catch(e){console.error('Backup preview:',e);showToast('Nie można przywrócić: '+errorMessage(e));}
      finally{btn.disabled=false;}
    });
  }
})();
