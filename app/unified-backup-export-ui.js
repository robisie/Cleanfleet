(function(){
  'use strict';
  const button=document.getElementById('cfUnifiedBackupExport');
  if(!button)return;
  button.addEventListener('click',async()=>{
    document.getElementById('menuOverlay')?.classList.remove('open');
    if(!cfIsAdmin()){showToast('Backup może utworzyć tylko administrator.');return;}
    button.disabled=true;
    try{
      cfSetSync('Pobieranie danych do backupu…');
      showToast('Przygotowuję backup całej aplikacji…');
      const {archive,manifest}=await CFUnifiedBackup.makeArchive(cfSupabase);
      // Verify the finished archive before offering it for download.
      await CFUnifiedBackup.inspectArchive(archive);
      const url=URL.createObjectURL(archive),link=document.createElement('a');
      link.href=url;
      link.download='CleanFleet-backup-'+manifest.createdAt.slice(0,19).replace(/[T:]/g,'-')+'.zip';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      cfSetSync('Backup pobrany','ok');showToast('Pobrano backup CleanFleet.');
    }catch(error){
      console.error('Backup export:',error);
      cfSetSync('Błąd tworzenia backupu','err');
      const message='Backup: '+(error?.message||String(error));
      showToast(message);
      const root=document.getElementById('modalRoot');
      if(root){
        const overlay=document.createElement('div');overlay.className='overlay';
        const sheet=document.createElement('div');sheet.className='sheet';sheet.style.maxWidth='420px';
        const heading=document.createElement('h2');heading.textContent='Nie udało się utworzyć backupu';
        const detail=document.createElement('div');detail.className='confirm-text';detail.textContent=message;
        const close=document.createElement('button');close.className='btn btn-solid';close.type='button';close.textContent='Zamknij';
        close.onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
        sheet.append(heading,detail,close);overlay.append(sheet);root.append(overlay);
      }
    }finally{button.disabled=false;}
  });
})();
