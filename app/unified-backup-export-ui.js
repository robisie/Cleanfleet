(function(){
  'use strict';
  const button=document.getElementById('cfUnifiedBackupExport');
  if(!button)return;
  button.addEventListener('click',async()=>{
    document.getElementById('menuOverlay')?.classList.remove('open');
    button.disabled=true;
    try{
      const bridge=window.cfBackupBridge;
      if(!bridge?.isAdmin())throw new Error('Backup może utworzyć tylko administrator.');
      bridge.setSync('Pobieranie danych do backupu…');
      bridge.toast('Przygotowuję backup całej aplikacji…');
      const {archive,manifest}=await window.CFUnifiedBackup.makeArchive(bridge.getClient());
      // Verify the finished archive before offering it for download.
      await window.CFUnifiedBackup.inspectArchive(archive);
      const url=URL.createObjectURL(archive),link=document.createElement('a');
      link.href=url;
      link.download='CleanFleet-backup-'+manifest.createdAt.slice(0,19).replace(/[T:]/g,'-')+'.zip';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      bridge.setSync('Backup pobrany','ok');bridge.toast('Pobrano backup CleanFleet.');
    }catch(error){
      console.error('Backup export:',error);
      window.cfBackupBridge?.setSync('Błąd tworzenia backupu','err');
      const message='Backup: '+(error?.message||String(error));
      window.cfBackupBridge?.toast(message);
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
