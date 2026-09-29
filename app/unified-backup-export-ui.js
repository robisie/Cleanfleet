(function(){
  'use strict';
  const button=document.getElementById('cfUnifiedBackupExport');
  if(!button)return;
  button.addEventListener('click',async()=>{
    if(!cfIsAdmin()){showToast('Backup może utworzyć tylko administrator.');return;}
    button.disabled=true;
    try{
      cfSetSync('Pobieranie danych do backupu…');
      const {archive,manifest}=await CFUnifiedBackup.makeArchive(cfSupabase);
      // Verify the finished archive before offering it for download.
      await CFUnifiedBackup.inspectArchive(archive);
      const url=URL.createObjectURL(archive),link=document.createElement('a');
      link.href=url;
      link.download='CleanFleet-backup-'+manifest.createdAt.slice(0,19).replace(/[T:]/g,'-')+'.zip';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      document.getElementById('menuOverlay')?.classList.remove('open');
      cfSetSync('Backup pobrany','ok');showToast('Pobrano backup CleanFleet.');
    }catch(error){
      console.error('Backup export:',error);
      cfSetSync('Błąd tworzenia backupu','err');
      showToast('Backup: '+(error?.message||String(error)));
    }finally{button.disabled=false;}
  });
})();
