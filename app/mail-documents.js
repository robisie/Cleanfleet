(function(){
'use strict';
let root=null,session='',connected=null,items=[],controller=null,generation=0;
const el=id=>root?.querySelector('#cfMail'+id);
function status(text){if(el('Status') && el('Status').textContent!==text)el('Status').textContent=text;}
function stop(){generation++;controller?.abort();controller=null;busy(false);}
function clear(){items=[];el('Results')?.replaceChildren();if(el('Download'))el('Download').hidden=true;}
function busy(value){if(!root)return;root.querySelectorAll('input,textarea,button').forEach(node=>{if(node.id!=='cfMailCancel')node.disabled=value;});el('Cancel').hidden=!value;}
function dates(){const month=document.getElementById('cfAccountingMonth')?.value;if(!/^\d{4}-\d{2}$/.test(month || ''))return;el('From').value=month+'-01';const [y,m]=month.split('-').map(Number);el('To').value=new Date(Date.UTC(y,m,7)).toISOString().slice(0,10);}
function monthChanged(){if(!root)return;stop();clear();dates();status(connected?'Miesiąc zmieniony. Wyszukaj załączniki ponownie.':'Wpisz dane i kliknij Zapisz.');}
async function request(body,binary=false){
 if(!window.cfBackupBridge?.isAdmin())throw new Error('Moduł dostępny dla administratora.');
 const auth=await window.cfBackupBridge.getClient().auth.getSession();if(!auth.data.session)throw new Error('Zaloguj się ponownie.');
 const response=await fetch(CF_SUPABASE_URL+'/functions/v1/cleanfleet-mail',{method:'POST',headers:{Authorization:'Bearer '+auth.data.session.access_token,apikey:CF_SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({...body,session}),signal:controller?.signal,cache:'no-store'});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error || 'Nie udało się pobrać poczty ('+response.status+').');}
 return binary?response.blob():response.json();
}
async function preparedAttachment(item,signal,report=()=>{}){
 let blob=await request({action:'attachment',ticket:item.ticket},true);
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
 const isPdf=/\.pdf$/i.test(item.filename)||blob.type==='application/pdf'||(await blob.slice(0,1024).text()).includes('%PDF-');
 if(isPdf){
  if(!window.CFPdfUnlock)throw new Error('Odśwież aplikację — brakuje modułu odblokowania PDF.');
  report('Odblokowywanie PDF: '+item.filename);
  try{blob=await window.CFPdfUnlock.unlock(blob,el('PdfPassword')?.value||'',signal);}catch(error){if(error.name==='AbortError')throw error;throw new Error(item.filename+': '+error.message);}
 }
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
 return blob;
}
async function run(operation){stop();controller=new AbortController();const current=generation;busy(true);try{await operation(current);}catch(error){if(current===generation && error.name!=='AbortError')status(error.message);}finally{if(current===generation){controller=null;busy(false);}}}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function render(){const target=el('Results');target.replaceChildren();items.forEach((item,index)=>{const label=document.createElement('label');label.style.cssText='display:block;padding:10px 0;border-bottom:1px solid #ddd;overflow-wrap:anywhere';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.index=String(index);label.append(check,document.createTextNode(' '+item.filename+' · '+item.received));const detail=document.createElement('small');detail.style.display='block';detail.textContent=item.sender+' — '+item.subject;label.append(detail);target.append(label);});el('Download').hidden=!items.length;}
function mount(overlay){
 const target=overlay.querySelector('#cfMailMount');if(!target || root===target)return;root=target;
 root.innerHTML=`<div class="cf-accounting-source-top"><div><h2>Poczta o2</h2><p>Załączniki otrzymywane od banku.</p></div><span class="cf-accounting-status">IMAP</span></div>
 <details id="cfMailSettings" style="margin:12px 0"><summary style="cursor:pointer;font-weight:600;padding:10px 0">Dane logowania i ustawienia poczty</summary><form id="cfMailForm" class="cf-ksef-form"><label>Adres skrzynki<input id="cfMailEmail" type="email" autocomplete="username" required></label><label>Hasło do programu pocztowego<input id="cfMailPassword" type="password" autocomplete="new-password" required></label><label>Nadawca banku<input id="cfMailSenders" value="kontakt@mbank.pl" readonly></label><label>Tytuł wiadomości<input value="mBank - elektroniczne zestawienie operacji za *" readonly></label><label>Folder poczty<input id="cfMailFolder" value="INBOX" required></label><button id="cfMailLoadFolders" type="button">Pobierz listę folderów</button><label id="cfMailFolderChoice" style="display:none" hidden>Foldery na serwerze o2<select id="cfMailFolderList"></select></label><button type="submit">Zapisz</button></form>
 <p>Dane połączenia są zapisane w postaci zaszyfrowanej. Aby zmienić hasło, wklej nowe i kliknij Zapisz.</p><p>W o2 włącz <a href="https://pomoc.o2.pl/aktywacja-dostepu-dla-programow-pocztowych" target="_blank" rel="noopener">dostęp IMAP</a>. Przy logowaniu dwustopniowym użyj <a href="https://pomoc.o2.pl/wpkonto/hasla-do-aplikacji-zewnetrznej" target="_blank" rel="noopener">hasła do aplikacji</a>.</p></details>
 <div class="cf-ksef-form"><label>Hasło do wyciągów PDF<input id="cfMailPdfPassword" type="password" autocomplete="off" spellcheck="false" maxlength="1024" placeholder="Wpisz hasło do wyciągów bankowych"></label></div><p>Hasło służy tylko do odblokowania PDF-ów w tej przeglądarce. Nie jest zapisywane ani wysyłane. PDF-y trafią do ZIP-a bez hasła: MIESIĄC / wyciągi bankowe /.</p>
 <div class="cf-ksef-form"><label>Wiadomości otrzymane od<input id="cfMailFrom" type="date"></label><label>Wiadomości otrzymane do<input id="cfMailTo" type="date"></label><button id="cfMailSearch" type="button">Znajdź załączniki</button><button id="cfMailCancel" type="button" hidden>Anuluj</button></div><p>Pobieramy wyłącznie załączniki od kontakt@mbank.pl z tytułem „mBank - elektroniczne zestawienie operacji za …”.</p><p>Daty dotyczą otrzymania wiadomości. Domyślnie obejmują miesiąc oraz pierwsze 7 dni kolejnego miesiąca, kiedy bank może wysłać wyciąg. Sprawdź zawartość dokumentów przed przekazaniem księgowej.</p><p id="cfMailStatus" role="status" aria-live="polite">Wpisz dane i kliknij Zapisz.</p><div id="cfMailResults"></div><button id="cfMailDownload" type="button" hidden>Pobierz wybrane załączniki (ZIP)</button><p>Limit: 20 MB na załącznik, 100 MB na paczkę. PDF-y odblokowujemy przed pobraniem; pozostałe załączniki zachowujemy bez zmian.</p>`;
 el('LoadFolders').addEventListener('click',()=>run(async current=>{
 status('Pobieranie folderów z o2…');const value=await request({action:'folders',email:el('Email').value,folder:el('Folder').value,password:el('Password').dataset.saved==='true'?'':el('Password').value,useSavedPassword:el('Password').dataset.saved==='true'});if(current!==generation)return;
 const select=el('FolderList');select.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent='Wybierz folder';select.append(prompt);for(const folder of value.folders){const option=document.createElement('option');option.value=folder.path;option.textContent=folder.path;select.append(option);}select.value='';el('FolderChoice').hidden=false;el('FolderChoice').style.display='grid';status('Wybierz folder z listy i kliknij Zapisz. Lista zawiera foldery dostępne na serwerze o2.');
 }));
 el('FolderList').addEventListener('change',()=>{if(el('FolderList').value){el('Folder').value=el('FolderList').value;clear();status('Folder wybrany. Kliknij Zapisz.');}});
 el('Password').addEventListener('focus',()=>{if(el('Password').dataset.saved==='true')el('Password').select();});
 root.addEventListener('input',event=>{if(event.target.id==='cfMailPassword')event.target.dataset.saved='false';});
 el('Form').addEventListener('submit',event=>{event.preventDefault();run(async current=>{status('Łączenie z o2…');const value=await request({action:'save',email:el('Email').value,senders:el('Senders').value,folder:el('Folder').value,password:el('Password').dataset.saved==='true'?'':el('Password').value,useSavedPassword:el('Password').dataset.saved==='true'});if(current!==generation)return;session=value.session;connected=value;el('Email').value=value.email;el('Senders').value=value.senders.join(', ');el('Folder').value=value.folder;el('Password').value='************';el('Password').dataset.saved='true';clear();status('Dane poczty zapisane. Wyszukaj załączniki.');});});
 el('Search').addEventListener('click',()=>run(async current=>{if(!connected)throw new Error('Najpierw zapisz dane poczty.');if(el('Email').value.trim().toLowerCase()!==connected.email || el('Senders').value.trim()!==connected.senders.join(', ') || el('Folder').value.trim()!==connected.folder)throw new Error('Dane połączenia zmieniono. Kliknij Zapisz.');clear();status('Wyszukiwanie wiadomości…');const value=await request({action:'list',from:el('From').value,to:el('To').value});if(current!==generation)return;items=value.attachments;render();status('Wiadomości: '+value.messageCount+'. Załączniki: '+items.length+'. Zaznacz pliki do pobrania.');}));
 el('Download').addEventListener('click',()=>run(async current=>{const selected=Array.from(el('Results').querySelectorAll('input:checked')).map(node=>items[Number(node.dataset.index)]);if(!selected.length)throw new Error('Zaznacz załączniki.');if(selected.reduce((sum,item)=>sum+item.size,0)>100*1024*1024)throw new Error('Wybrane załączniki przekraczają 100 MB. Pobierz je w mniejszych paczkach.');if(!window.JSZip)throw new Error('Biblioteka ZIP niedostępna. Odśwież stronę.');const zip=new window.JSZip();let total=0;for(let index=0;index<selected.length;index++){const item=selected[index];status('Pobieranie '+(index+1)+' z '+selected.length+': '+item.filename);const blob=await preparedAttachment(item,controller.signal,status);if(current!==generation)return;total+=blob.size;if(total>100*1024*1024)throw new Error('Paczka przekracza 100 MB.');zip.file(item.received+'_'+String(index+1).padStart(3,'0')+'_'+item.filename,await blob.arrayBuffer());}status('Przygotowanie ZIP…');const blob=await zip.generateAsync({type:'blob',compression:'STORE'});if(current!==generation)return;download(blob,'Poczta-'+document.getElementById('cfAccountingMonth').value+'.zip');status('Pobrano ZIP z '+selected.length+' załącznikami.');}));
 el('Cancel').addEventListener('click',()=>{stop();status('Anulowano.');});
 ['From','To'].forEach(id=>el(id).addEventListener('change',()=>{stop();clear();status('Daty zmienione. Wyszukaj załączniki ponownie.');}));
 dates();
}
function open(){if(!root)return;if(!el('From').value)dates();if(connected)return;run(async current=>{status('Odczytywanie zapisanych danych poczty…');const value=await request({action:'config'});if(current!==generation)return;if(!value.configured){if(el('Settings'))el('Settings').open=true;status('Rozwiń dane logowania, wpisz dane i kliknij Zapisz.');return;}connected=value;el('Email').value=value.email;el('Senders').value=value.senders.join(', ');el('Folder').value=value.folder;el('Password').value='************';el('Password').dataset.saved='true';status('Dane poczty są zapisane. Wyszukaj załączniki.');});}
function close(){stop();if(el('PdfPassword'))el('PdfPassword').value='';const password=el('Password');if(password && password.dataset.saved!=='true')password.value='';}
function reset(){stop();if(el('PdfPassword'))el('PdfPassword').value='';session='';connected=null;clear();if(root){el('Form').reset();el('FolderList').replaceChildren();el('FolderChoice').hidden=true;el('FolderChoice').style.display='none';el('Password').dataset.saved='false';status('Wpisz dane i kliknij Zapisz.');}}
async function exportFiles(signal,report=()=>{}){
 if(controller)throw new Error('Poczta wykonuje inną operację. Poczekaj na jej zakończenie.');
 const current=generation;controller=new AbortController();const abort=()=>controller?.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();busy(true);
 try{
  const selected=Array.from(el('Results')?.querySelectorAll('input:checked') || []).map(node=>items[Number(node.dataset.index)]).filter(Boolean);
  if(selected.reduce((sum,item)=>sum+item.size,0)>100*1024*1024)throw new Error('Zaznaczone załączniki poczty przekraczają limit 100 MB.');
  if(current!==generation || signal.aborted)throw new DOMException('Anulowano','AbortError');const files=[];let size=0;
  for(const [index,item] of selected.entries()){
   report('Poczta: '+(index+1)+' z '+selected.length+' — '+item.filename);const blob=await preparedAttachment(item,controller.signal,report);
   if(current!==generation || signal.aborted)throw new DOMException('Anulowano','AbortError');size+=blob.size;if(size>100*1024*1024)throw new Error('Załączniki poczty przekraczają 100 MB.');files.push({name:item.received+'_'+String(index+1).padStart(3,'0')+'_'+item.filename,blob});
  }
  status('Pobrano '+files.length+' załączników do paczki miesięcznej.');return files;
 }finally{signal.removeEventListener('abort',abort);if(current===generation){controller=null;busy(false);}}
}
window.CFAccountingMail={mount,open,close,reset,monthChanged,exportFiles,isBusy:()=>Boolean(controller)};
})();

