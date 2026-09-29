(function(){
  'use strict';
  const button=document.getElementById('cfUnifiedBackupRestore');
  if(!button)return;
  const element=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
  const message=error=>error?.context?.body?.error||error?.message||String(error);
  async function invoke(client,body){
    const {data,error}=await client.functions.invoke('cleanfleet-backup-restore',{body});
    if(error){
      let detail='';try{detail=(await error.context?.json())?.error||'';}catch(_){}
      throw new Error(detail||error.message);
    }
    if(data?.error)throw new Error(data.error);
    return data;
  }
  button.addEventListener('click',()=>{
    document.getElementById('menuOverlay')?.classList.remove('open');
    const bridge=window.cfBackupBridge;
    if(!bridge?.isAdmin()){bridge?.toast('Przywracanie jest dostępne dla administratora.');return;}
    const root=document.getElementById('modalRoot')||document.body;
    const overlay=element('div',null,'overlay'),sheet=element('div',null,'sheet');
    sheet.style.maxWidth='540px';sheet.style.maxHeight='85vh';sheet.style.overflowY='auto';
    sheet.append(element('h2','Przywróć backup całej aplikacji'));
    sheet.append(element('p','Wybierz plik ZIP. Następnie wskaż panel administratora lub firmy do przywrócenia.'));
    const file=element('input');file.type='file';file.accept='.zip,application/zip';file.style.maxWidth='100%';sheet.append(file);
    const info=element('div');info.style.margin='16px 0';sheet.append(info);
    const status=element('p','');status.setAttribute('role','status');sheet.append(status);
    const actions=element('div');actions.style.display='flex';actions.style.gap='10px';actions.style.flexWrap='wrap';
    const preview=element('button','Sprawdź zakres','btn btn-solid');preview.type='button';preview.disabled=true;
    const close=element('button','Zamknij','btn');close.type='button';close.onclick=()=>overlay.remove();
    actions.append(preview,close);sheet.append(actions);overlay.append(sheet);root.append(overlay);
    let backup=null,manifest=null,companies=[];
    function selection(){return {admin:!!info.querySelector('[data-admin]')?.checked,
      companyIds:[...info.querySelectorAll('[data-company]:checked')].map(x=>x.dataset.company)};}
    file.onchange=async()=>{
      backup=null;preview.disabled=true;info.replaceChildren();status.textContent='Sprawdzam plik…';
      try{
        const inspected=await window.CFUnifiedBackup.inspectArchive(file.files?.[0]);
        manifest=inspected.manifest;
        companies=inspected.data.tables.companies||[];
        backup={format:manifest.format,project:manifest.project,tables:inspected.data.tables,
          users:inspected.data.users,objects:inspected.data.objects,localPhotos:manifest.localPhotos};
        const label=element('p','Kopia z: '+new Date(manifest.createdAt).toLocaleString('pl-PL')+'; firm: '+companies.length);
        info.append(label);
        const choice=(title,attr,value)=>{
          const wrapper=element('label');wrapper.style.display='block';wrapper.style.margin='8px 0';
          const input=element('input');input.type='checkbox';input.checked=false;
          if(attr==='admin')input.dataset.admin='';else input.dataset.company=value;
          wrapper.append(input,document.createTextNode(' '+title));info.append(wrapper);
        };
        choice('Panel administratora (istniejące wpisy zostaną zaktualizowane)','admin');
        for(const company of companies)choice('Firma: '+(company.name||company.nazwa||company.id),'company',String(company.id));
        status.textContent='Wybierz zakres i sprawdź skutki przywrócenia.';preview.disabled=false;
      }catch(error){status.textContent='Nie można odczytać backupu: '+message(error);}
    };
    preview.onclick=async()=>{
      const selected=selection();
      if(!selected.admin&&!selected.companyIds.length){status.textContent='Wybierz panel albo co najmniej jedną firmę.';return;}
      preview.disabled=true;file.disabled=true;status.textContent='Porównuję kopię z bieżącymi danymi…';
      try{
        const client=bridge.getClient();
        const plan=await invoke(client,{action:'preview',backup,selection:selected});
        const deletes=plan.summary.filter(x=>x.action==='delete').reduce((n,x)=>n+x.count,0);
        const inserts=plan.summary.filter(x=>x.action==='insert').reduce((n,x)=>n+x.count,0);
        const merges=plan.summary.filter(x=>x.action==='merge').reduce((n,x)=>n+x.count,0);
        status.textContent=`Zakres: ${selected.admin?'panel administratora, ':''}${selected.companyIds.length} firm. Usunięcie ${deletes}, wstawienie ${inserts}, aktualizacja/dodanie do ${merges} wpisów panelu. Zaznaczone firmy zostaną zastąpione danymi z kopii.`;
        const confirm=element('button','Przywróć wybrany zakres','btn btn-solid');confirm.type='button';
        actions.insertBefore(confirm,close);
        confirm.onclick=async()=>{
          if(!window.confirm('Potwierdź przywrócenie wybranego zakresu z backupu. Wskazane firmy zostaną zastąpione.'))return;
          confirm.disabled=true;close.disabled=true;status.textContent='Przywracam dane. Nie zamykaj tej strony…';
          try{
            await invoke(client,{action:'restore',backup,selection:selected,expectedPlanHash:plan.planHash});
            bridge.setSync('Backup przywrócony','ok');status.textContent='Przywrócono wybrany zakres. Odświeżam aplikację…';
            window.location.reload();
          }catch(error){status.textContent='Nie przywrócono danych: '+message(error);confirm.disabled=false;close.disabled=false;}
        };
      }catch(error){status.textContent='Nie można przygotować podglądu: '+message(error);preview.disabled=false;file.disabled=false;}
    };
  });
})();
