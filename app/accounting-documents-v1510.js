(() => {
  'use strict';

  const TILE_ID = 'cfCompanyAccountingDocsCard';
  const OVERLAY_ID = 'cfAccountingDocsOverlay';
  const STYLE_ID = 'cfAccountingDocsStyle1510';
  let observer = null;
  let selectedFiles = { organizer: [], organizerPurchases: [] };
  let priorBodyOverflow = '';
  let bankFiles = [];
  let bankResults = [];
  let bankRun = 0;
  let bankBusy = false;
  let reviewRevision=0,reviewState=null;const purchaseAttachments=new Map();
  function invalidateReview(){reviewRevision++;reviewState=null;document.getElementById('cfAccountingReview')?.replaceChildren();const button=document.getElementById('cfAccountingAllConfirm');if(button)button.hidden=true;}
  const bankElement = id => document.getElementById('cfAccountingBank' + id);
  function bankStatus(message) {const el=bankElement('Status');if(el)el.textContent=message;}
  function resetBank() {
    invalidateReview();
    bankRun++;bankBusy=false;bankResults=[];
    bankElement('Results')?.replaceChildren();
    for(const id of ['Convert','Input','Number','Encoding']){const el=bankElement(id);if(el)el.disabled=false;}
  }
  function bankFileLabels() {
    const el=bankElement('File');if(!el)return;
    el.textContent=bankFiles.map(file=>file.name+' · '+fileSize(file.size)).join('\n');
    el.classList.toggle('is-visible',bankFiles.length>0);
  }
  async function convertBank() {
    if(!isAdmin() || bankBusy)return;
    resetBank();const run=bankRun,month=document.getElementById('cfAccountingMonth').value;
    if(!bankFiles.length){bankStatus('Wybierz pełny eksport CSV z mBanku.');return;}
    if(!window.CFMBankMT940){bankStatus('Konwerter nie został załadowany. Odśwież aplikację.');return;}
    const number=bankElement('Number').value,encoding=bankElement('Encoding').value;
    bankBusy=true;for(const id of ['Convert','Input','Number','Encoding'])bankElement(id).disabled=true;
    bankStatus('Sprawdzanie CSV i konwersja na MT940…');
    try {
      const converted=[],accounts=new Set();
      for(const file of bankFiles) {
        if(file.size>10*1024*1024)throw new Error(file.name+': plik przekracza limit 10 MB.');
        const bytes=await file.arrayBuffer();
        if(run!==bankRun || !isAdmin())return;
        const bank=window.CFMBankMT940;let statement,output;
        try{const decoded=bank.decode(bytes);statement=bank.parse(decoded.text,month);output=bank.encode(bank.build(statement,number),encoding);}
        catch(error){throw new Error(file.name+': '+error.message);}
        if(accounts.has(statement.account))throw new Error('Wybrano więcej niż jeden CSV dla tego samego rachunku. Zostaw jeden pełny eksport miesiąca.');
        accounts.add(statement.account);converted.push({month,statement,bytes:output,filename:'mbank-'+month+'-'+statement.account.slice(-8)+'.txt'});
      }
      if(run!==bankRun || !isAdmin())return;
      bankResults=converted;const list=bankElement('Results');
      for(const [index,result] of converted.entries()) {
        const s=result.statement,bank=window.CFMBankMT940,entry=document.createElement('div');entry.className='cf-bank-result';
        const name=document.createElement('strong');name.textContent='Rachunek …'+s.account.slice(-8)+' · '+s.currency;
        const summary=document.createElement('p');summary.textContent=s.operations.length+' operacji · Wpływy: '+bank.money(s.credits)+' · Wydatki: '+bank.money(s.debits)+'. Saldo początkowe: '+(s.opening<0n?'-':'')+bank.money(s.opening)+' · Saldo końcowe: '+(s.closing<0n?'-':'')+bank.money(s.closing)+'.';
        const button=document.createElement('button');button.type='button';button.className='cf-ksef-download';button.dataset.bankDownload=String(index);button.textContent='Pobierz MT940 (.txt)';
        entry.append(name,summary,button);list.appendChild(entry);
      }
      bankStatus('Gotowe: '+converted.length+' '+(converted.length===1?'plik MT940':'pliki MT940')+'. Salda wszystkich operacji są zgodne.');
    }catch(error){bankResults=[];bankStatus(error.message || 'Nie udało się przekonwertować CSV.');}
    finally{if(run===bankRun){bankBusy=false;for(const id of ['Convert','Input','Number','Encoding'])bankElement(id).disabled=false;}}
  }
  function downloadBank(index) {
    const result=bankResults[index];if(!result || !isAdmin())return;
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/octet-stream'})),link=document.createElement('a');
    link.href=url;link.download=result.filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }

  let ksefRun = null;
  let ksefResults = {};
  let ksefConfigRun = null;
  let ksefSaved = null;
  const KSEF_MASK = '************';
  const ksefElement = id => document.getElementById('cfKsef' + id);
  function ksefStatus(message) { const el=ksefElement('Status'); if(el)el.textContent=message; }
  function resetKsef() {
    invalidateReview();
    ksefRun?.abort(); ksefRun=null; ksefResults={}; busyKsef(false);if(ksefElement('HistoryStatus'))ksefElement('HistoryStatus').textContent='Historia zakupów jest zapisywana na koncie po pobraniu KSeF.';if(ksefElement('HistoryRetry'))ksefElement('HistoryRetry').hidden=true;
    for(const kind of ['purchases','sales']) {const el=ksefElement(kind);if(el){el.hidden=true;el.disabled=true;}}
  }
  function busyKsef(busy) {
    for(const id of ['Nip','Token','Environment','Start','Save','HistoryYear','HistoryRetry']){const el=ksefElement(id);if(el)el.disabled=busy || Boolean(ksefConfigRun);}
    const month=document.getElementById('cfAccountingMonth');if(month)month.disabled=busy;
    const cancel=ksefElement('Cancel');if(cancel)cancel.hidden=!busy;
  }
  function savedMatches() {
    return ksefSaved && ksefSaved.environment===ksefElement('Environment')?.value && ksefSaved.nip===ksefElement('Nip')?.value.replace(/[\s-]/g,'');
  }
  function showSavedToken() {
    const token=ksefElement('Token');
    if(token){token.value=KSEF_MASK;token.dataset.saved='true';}
  }
  function forgetKsefView() {
    ksefConfigRun?.abort();ksefConfigRun=null;ksefSaved=null;
    const token=ksefElement('Token');if(token){token.value='';token.dataset.saved='false';}
    resetKsef();
  }
  async function loadKsefCredential() {
    if(ksefRun || window.CFAccountingReconcile?.isBusy?.() || !isAdmin())return;
    ksefConfigRun?.abort();const controller=new AbortController();ksefConfigRun=controller;
    const environment=ksefElement('Environment').value;
    ksefSaved=null;ksefElement('Token').value='';ksefElement('Token').dataset.saved='false';busyKsef(false);
    ksefStatus('Sprawdzanie zapisanego tokenu…');
    try {
      const result=await ksefRequest({action:'credentials',environment},controller.signal);
      if(controller.signal.aborted || !isAdmin())return;
      if(result.configured){
        ksefSaved=result;ksefElement('Nip').value=result.nip;showSavedToken();
        ksefStatus('Token zapisany. Możesz pobrać faktury lub wkleić nowy token i kliknąć Zapisz.');
      }else{ksefStatus('Wpisz NIP i token z uprawnieniem do przeglądania faktur. Kliknij Zapisz, aby go zapamiętać.');}
    }catch(error){if(error.name!=='AbortError')ksefStatus(error.message);}
    finally{if(ksefConfigRun===controller){ksefConfigRun=null;busyKsef(Boolean(ksefRun));}}
  }
  async function saveKsefCredential() {
    if(ksefRun || ksefConfigRun || allRun || !isAdmin())return;
    const field=ksefElement('Token');
    if(field.dataset.saved==='true' && savedMatches()){ksefStatus('Ten token jest już zapisany. Aby go zmienić, wklej nowy i kliknij Zapisz.');return;}
    const token=field.value.trim();
    if(!token || token===KSEF_MASK){ksefStatus('Wklej nowy token, który chcesz zapisać.');return;}
    const nip=ksefElement('Nip').value,environment=ksefElement('Environment').value;
    const controller=new AbortController();ksefConfigRun=controller;busyKsef(false);ksefStatus('Zapisywanie tokenu…');
    try{
      const result=await ksefRequest({action:'save-credentials',nip,token,environment},controller.signal);
      if(controller.signal.aborted || !isAdmin())return;
      ksefSaved=result;ksefElement('Nip').value=result.nip;showSavedToken();resetKsef();
      ksefStatus('Token zapisany. Będzie dostępny przy kolejnym otwarciu modułu.');
    }catch(error){if(error.name!=='AbortError')ksefStatus(error.message);}
    finally{if(ksefConfigRun===controller){ksefConfigRun=null;busyKsef(Boolean(ksefRun));}}
  }
  function waitKsef(ms, signal) {
    return new Promise((resolve,reject)=>{
      if(signal.aborted){reject(new DOMException('Anulowano','AbortError'));return;}
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Anulowano','AbortError'));};
      const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  async function ksefRequest(body, signal, binary=false) {
    const client=window.cfBackupBridge?.getClient?.();
    const session=await client?.auth.getSession();
    const access=session?.data?.session?.access_token;
    if(!access || !isAdmin())throw new Error('Zaloguj się ponownie do CleanFleet jako administrator.');
    const response=await fetch(CF_SUPABASE_URL+'/functions/v1/cleanfleet-ksef',{
      method:'POST',headers:{Authorization:'Bearer '+access,apikey:CF_SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal,cache:'no-store'
    });
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      const error=new Error(data.error || 'Nie udało się pobrać faktur (HTTP '+response.status+').');
      error.retryAfter=response.status===429 ? data.retryAfter || 30 : 0;
      throw error;
    }
    return binary ? response.arrayBuffer() : response.json();
  }
  const ksefBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  async function downloadKsefJob(job, ready, signal, label, historyOnly=false) {
    if(ready.invoiceCount===0)return {count:0,invoices:[]};
    if(!window.JSZip)throw new Error('Biblioteka ZIP nie została załadowana. Odśwież aplikację.');
    const aes=await crypto.subtle.importKey('raw',ksefBytes(job.key),'AES-CBC',false,['decrypt']);
    const chunks=[];let size=0;
    for(const [index,part] of ready.parts.entries()){
      ksefStatus('Pobieranie: '+label+' · część '+(index+1)+' z '+ready.parts.length+'.');
      const encrypted=await ksefRequest({action:'part',ticket:part.ticket},signal,true);
      const plain=await crypto.subtle.decrypt({name:'AES-CBC',iv:ksefBytes(job.iv)},aes,encrypted);
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',plain));
      const encoded=btoa(Array.from(digest,byte=>String.fromCharCode(byte)).join(''));
      if(plain.byteLength!==part.partSize || encoded!==part.partHash)throw new Error('Nie udało się zweryfikować części archiwum. Uruchom pobieranie ponownie.');
      size+=plain.byteLength;if(size>200*1024*1024)throw new Error('Archiwum przekracza limit 200 MB.');
      chunks.push(new Uint8Array(plain));
    }
    if(signal.aborted)throw new DOMException('Anulowano','AbortError');
    if(size!==ready.size)throw new Error('Archiwum jest niepełne. Uruchom pobieranie ponownie.');
    const combined=new Uint8Array(size);let offset=0;for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.length;}
    const zip=await window.JSZip.loadAsync(combined);
    const xml=Object.values(zip.files).filter(file=>!file.dir && /\.xml$/i.test(file.name));
    if(xml.length!==ready.invoiceCount)throw new Error('Liczba faktur w archiwum jest niezgodna. Uruchom pobieranie ponownie.');
    if(signal.aborted)throw new DOMException('Anulowano','AbortError');
    if(!window.CFKsefPDF)throw new Error('Generator faktur PDF nie został załadowany. Odśwież aplikację.');
    const metadata=window.CFAccountingHistory?.archiveMetadata ? await window.CFAccountingHistory.archiveMetadata(zip,ready.invoiceCount,signal) : null;
    if(historyOnly && metadata){
      const supplements=[];
      for(const file of xml){
        if(signal.aborted || !isAdmin())throw new DOMException('Anulowano','AbortError');
        const bytes=await file.async('uint8array');
        if(bytes.byteLength>10*1024*1024)throw new Error(file.name+': faktura przekracza limit 10 MB.');
        // Metadata is the complete source; XML supplies optional bank accounts for supported schemas.
        try{supplements.push(window.CFKsefPDF.invoiceData(bytes,file.name));}catch(_){/* Other KSeF schemas can still be recorded from their verified metadata. */}
      }
      return {count:ready.invoiceCount,invoices:window.CFAccountingHistory.mergeMetadata(supplements,metadata)};
    }
    if(historyOnly){
      const invoices=[];
      for(const [index,file] of xml.entries()){
        if(signal.aborted || !isAdmin())throw new DOMException('Anulowano','AbortError');
        ksefStatus(label+' · odczyt danych '+(index+1)+' z '+xml.length+'…');
        const bytes=await file.async('uint8array');
        if(bytes.byteLength>10*1024*1024)throw new Error(file.name+': faktura przekracza limit 10 MB.');
        invoices.push(window.CFKsefPDF.invoiceData(bytes,file.name));
      }
      return {count:ready.invoiceCount,invoices};
    }
    const invoices=[];const blob=await window.CFKsefPDF.convert({archive:zip,count:ready.invoiceCount,signal,environment:ksefElement('Environment').value,onProgress:text=>ksefStatus(label+' · '+text),onInvoice:data=>invoices.push(data)});
    return {count:ready.invoiceCount,blob,format:'pdf',invoices:window.CFAccountingHistory?.mergeMetadata ? window.CFAccountingHistory.mergeMetadata(invoices,metadata) : invoices};
  }
  async function fetchKsefMonth({month,nip,useSaved,token,environment},signal,historyOnly=false){
      ksefStatus('Łączenie z KSeF i zlecanie eksportu faktur…');
      const started=await ksefRequest({action:'start',nip,...(useSaved ? {useSaved:true} : {token}),month,environment},signal);
      if(started.month!==month || started.jobs?.length!==2)throw new Error('Niepoprawna odpowiedź eksportu.');
      if(new Set(started.jobs.map(job=>job.kind)).size!==2 || !started.jobs.every(job=>['purchases','sales'].includes(job.kind)))throw new Error('Niepoprawne kategorie eksportu.');
      const remaining=started.jobs.filter(job=>!historyOnly || job.kind==='purchases'), readyJobs=[];const deadline=Date.now()+15*60*1000;
      while(remaining.length){
        if(Date.now()>deadline)throw new Error('KSeF nadal przygotowuje eksport. Spróbuj ponownie później.');
        let retry=4;
        for(let i=remaining.length-1;i>=0;i--){
          try{
            const ready=await ksefRequest({action:'status',ticket:remaining[i].ticket},signal);
            if(ready.status==='ready'){readyJobs.push({job:remaining[i],ready});remaining.splice(i,1);}
          }catch(error){if(error.retryAfter)retry=Math.max(retry,error.retryAfter);else throw error;}
        }
        if(remaining.length){ksefStatus('KSeF przygotowuje archiwa. Gotowe: '+readyJobs.length+' z '+(historyOnly?1:2)+'.');await waitKsef(retry*1000,signal);}
      }
      if(readyJobs.reduce((sum,item)=>sum+item.ready.size,0)>200*1024*1024)throw new Error('Łączny rozmiar archiwów przekracza 200 MB. Pobierz je bezpośrednio w KSeF.');
      const results={};
      for(const {job,ready} of readyJobs){
        if(!['purchases','sales'].includes(job.kind))throw new Error('Niepoprawny rodzaj eksportu.');
        results[job.kind]=await downloadKsefJob(job,ready,signal,month+' · '+(job.kind==='purchases'?'faktury zakupowe':'faktury sprzedażowe'),historyOnly);
      }
      if(signal.aborted)throw new DOMException('Anulowano','AbortError');
      if(Object.values(results).reduce((sum,result)=>sum+(result.blob?.size || 0),0)>200*1024*1024)throw new Error('PDF-y KSeF przekraczają łącznie limit 200 MB.');
      return results;
  }
  async function startKsef(event,parentSignal) {
    event.preventDefault();if(ksefRun || ksefConfigRun || allRun || !isAdmin())return;
    const month=document.getElementById('cfAccountingMonth').value;
    const field=ksefElement('Token');
    const useSaved=field.dataset.saved==='true' && Boolean(savedMatches());
    const nip=ksefElement('Nip').value, token=useSaved ? '' : field.value.trim(), environment=ksefElement('Environment').value;
    if(!useSaved && (!token || token===KSEF_MASK)){ksefStatus('Wpisz token KSeF z uprawnieniem do odczytu faktur.');return;}
    if(!useSaved)field.value='';
    resetKsef();const controller=new AbortController();ksefRun=controller;busyKsef(true);
    const signal=controller.signal;const cancel=()=>controller.abort();parentSignal?.addEventListener('abort',cancel,{once:true});if(parentSignal?.aborted)cancel();
    try{
      const credentials={month,nip,useSaved,token,environment};
      const results=await fetchKsefMonth(credentials,signal);
      ksefResults=results;results.purchases.context={month,nip,environment};
      for(const kind of ['purchases','sales']){
        const button=ksefElement(kind),result=results[kind];
        if(!result)throw new Error('Brak jednej kategorii faktur.');
        result.month=month;button.hidden=false;button.disabled=!result.blob;
        button.textContent=(kind==='purchases'?'Faktury zakupowe':'Faktury sprzedażowe')+': '+result.count+(result.blob?' · Pobierz PDF-y (ZIP)':' · Brak faktur');
      }
      const currentSaved=await saveHistory(signal);
      try{
        if(!window.CFAccountingHistory)throw new Error('Odśwież aplikację — brakuje modułu historii.');
        const previous=window.CFAccountingHistory.months(month).slice(1);
        for(const [index,pastMonth] of previous.entries()){
          ksefStatus('Odświeżanie historii: '+pastMonth+' · '+(index+1)+' z 3.');
          const past=await fetchKsefMonth({...credentials,month:pastMonth},signal,true);
          await window.CFAccountingHistory.save(window.cfBackupBridge?.getClient?.(),{month:pastMonth,nip,environment},past.purchases.invoices,signal);
        }
        if(ksefElement('HistoryStatus'))ksefElement('HistoryStatus').textContent=(currentSaved?'Historia bieżącego miesiąca zapisana. ':ksefElement('HistoryStatus').textContent+' ')+'Odświeżono historię trzech poprzednich miesięcy: '+previous.join(', ')+'.';
      }catch(error){
        if(signal.aborted)throw error;
        if(ksefElement('HistoryStatus'))ksefElement('HistoryStatus').textContent+=' Nie odświeżono całej historii: '+error.message+' Uruchom pobieranie ponownie.';
      }
      if(signal.aborted)throw new DOMException('Anulowano','AbortError');
      ksefStatus('Gotowe. Miesiąc: '+month+'. Archiwa zawierają faktury PDF wygenerowane z danych KSeF.');
    }catch(error){
      ksefResults={};ksefStatus(error.name==='AbortError'?'Pobieranie anulowane.':error.message || 'Nie udało się pobrać faktur.');
    }finally{
      parentSignal?.removeEventListener('abort',cancel);if(ksefRun===controller){ksefRun=null;busyKsef(false);}
    }
  }
  async function fillHistoryYear(){
    if(!isAdmin() || ksefRun || ksefConfigRun || allRun)return;
    const month=document.getElementById('cfAccountingMonth').value;
    const field=ksefElement('Token'),useSaved=field.dataset.saved==='true' && Boolean(savedMatches());
    const credentials={nip:ksefElement('Nip').value,environment:ksefElement('Environment').value,useSaved,token:useSaved?'':field.value.trim()};
    if(!useSaved && (!credentials.token || credentials.token===KSEF_MASK)){ksefStatus('Wpisz lub zapisz token KSeF przed uzupełnieniem historii.');return;}
    if(!useSaved)field.value='';
    const controller=new AbortController(),signal=controller.signal;ksefRun=controller;busyKsef(true);invalidateReview();
    let completed=0,total=0,activeMonth='';
    try{
      const history=window.CFAccountingHistory;if(!history)throw new Error('Odśwież aplikację — brakuje modułu historii.');
      const months=history.yearMonths(month),client=window.cfBackupBridge?.getClient?.();total=months.length;
      ksefStatus('Sprawdzanie zapisanej historii roku '+month.slice(0,4)+'…');
      const saved=await history.loadMonths(client,{...credentials,month},months,signal);
      const known=new Set(saved.snapshots.filter(row=>history.isCurrentRange?.(row)).map(row=>row.month));
      const now=new Date(),current=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
      for(const item of months){
        activeMonth=item;
        if(signal.aborted || !isAdmin())throw new DOMException('Anulowano','AbortError');
        if(!known.has(item) || item===current){
          ksefStatus('Uzupełnianie historii: '+item+' · '+(completed+1)+' z '+total+'.');
          const result=await fetchKsefMonth({...credentials,month:item},signal,true);
          await history.save(client,{...credentials,month:item},result.purchases.invoices,signal);
        }
        completed++;
        if(signal.aborted || !isAdmin())throw new DOMException('Anulowano','AbortError');
        if(ksefElement('HistoryStatus'))ksefElement('HistoryStatus').textContent='Historia roku '+month.slice(0,4)+': '+completed+' z '+total+' miesięcy zapisanych.';
      }
      ksefStatus('Gotowe. Historia roku '+month.slice(0,4)+' uzupełniona: '+total+' miesięcy.');
    }catch(error){
      if(isAdmin())ksefStatus((signal.aborted?'Uzupełnianie historii anulowane.':'Nie ukończono historii'+(activeMonth?' — '+activeMonth:'')+': '+error.message)+ ' Zapisane miesiące pozostają na koncie ('+completed+' z '+total+'). Kliknij Uzupełnij historię roku, aby kontynuować.');
    }finally{if(ksefRun===controller){ksefRun=null;busyKsef(false);}}
  }
  async function retryHistory(){if(!isAdmin()||ksefRun||ksefConfigRun||allRun)return;const controller=new AbortController();ksefRun=controller;busyKsef(true);invalidateReview();try{await saveHistory(controller.signal);}finally{if(ksefRun===controller){ksefRun=null;busyKsef(false);}}}
  async function saveHistory(signal){
    const result=ksefResults.purchases;if(!result?.context||!isAdmin())return;
    const status=ksefElement('HistoryStatus'),button=ksefElement('HistoryRetry');if(button)button.hidden=true;
    try{if(status)status.textContent='Zapisywanie historii zakupów…';if(!window.CFAccountingHistory)throw new Error('Odśwież aplikację — brakuje modułu historii.');const count=await window.CFAccountingHistory.save(window.cfBackupBridge?.getClient?.(),result.context,result.invoices,signal);if(signal?.aborted||ksefResults.purchases!==result||!isAdmin())return;if(status)status.textContent='Historia zapisana na koncie: '+result.context.month+' · '+count+' faktur zakupowych. Starsze miesiące uzupełnisz przyciskiem Uzupełnij historię roku.';return true;}
    catch(error){if(signal?.aborted||ksefResults.purchases!==result||!isAdmin())return;if(status)status.textContent='PDF-y są gotowe, ale historia nie została zapisana. '+error.message;if(button)button.hidden=false;return false;}
  }
  let allRun=null;
  const allElement=id=>document.getElementById('cfAccountingAll'+id);
  function allStatus(text){const el=allElement('Status');if(el)el.textContent=text;}
  function allBusy(busy){const review=document.getElementById('cfAccountingReview');if(review){review.inert=busy;}const inputs=document.getElementById('cfAccountingInputs');if(inputs)inputs.disabled=busy;if(allElement('Start'))allElement('Start').disabled=busy;if(allElement('Confirm'))allElement('Confirm').disabled=busy;if(allElement('Cancel'))allElement('Cancel').hidden=!busy;}
  async function downloadAll(confirmed=false){
    if(!isAdmin() || allRun)return;
    if(ksefRun || ksefConfigRun || bankBusy || window.CFAccountingMail?.isBusy?.() || window.CFAccountingReconcile?.isBusy?.()){allStatus('Poczekaj na zakończenie bieżącej operacji.');return;}
    if(!window.CFAccountingPackage || !window.CFAccountingMail || !window.CFAccountingReconcile){allStatus('Odśwież aplikację — brakuje modułu paczki.');return;}
    const month=document.getElementById('cfAccountingMonth').value,organizer=[...selectedFiles.organizer],organizerPurchases=[...selectedFiles.organizerPurchases];
    const controller=new AbortController();allRun=controller;allBusy(true);const check=()=>{if(controller.signal.aborted || !isAdmin() || document.getElementById('cfAccountingMonth').value!==month)throw new DOMException('Anulowano','AbortError');};
    try{
      if(bankFiles.length && bankResults.length!==bankFiles.length)throw new Error('mBank: najpierw przekonwertuj wybrane CSV na MT940.');
      const ksef={...ksefResults},bank=[...bankResults];
      if(!confirmed){
        let result=reviewState?.revision===reviewRevision&&reviewState.month===month?reviewState.result:null;
        if(!result){let history={snapshots:[],expected:[]},historyError='';try{allStatus('Odczytywanie historii faktur KSeF…');history=await window.CFAccountingHistory.load(window.cfBackupBridge?.getClient?.(),{month,nip:ksefElement('Nip').value,environment:ksefElement('Environment').value},controller.signal);}catch(error){if(controller.signal.aborted)throw error;historyError=error.message;}check();result=window.CFAccountingReconcile.reconcile({month,bankResults:bank,purchases:ksef.purchases,history,historyError});}
        const decisionContext={month,nip:ksefElement('Nip').value,environment:ksefElement('Environment').value};
        try{allStatus('Odczytywanie zapisanych decyzji…');if(!window.CFAccountingDecisions)throw new Error('Odśwież aplikację — brakuje modułu zapisu decyzji.');const saved=await window.CFAccountingDecisions.load(window.cfBackupBridge?.getClient?.(),decisionContext,result.rows,controller.signal);check();decisionContext.userId=saved.userId;window.CFAccountingDecisions.restore(result,saved.records);}catch(error){if(controller.signal.aborted)throw error;result.warnings=[...(result.warnings||[]),'Nie odtworzono wcześniejszych decyzji: '+error.message];}
        check();reviewState={revision:reviewRevision,month,result};
        const isCurrent=()=>isAdmin()&&reviewState?.result===result&&reviewState.month===month;
        window.CFAccountingReconcile.render(document.getElementById('cfAccountingReview'),result,{attachments:purchaseAttachments,isCurrent,onDecision:async(ids,action,invoice)=>{
          if(!isCurrent())throw new Error('Kontrola zmieniona. Wczytaj dane ponownie.');
          if(!window.CFAccountingDecisions)throw new Error('Odśwież aplikację — brakuje modułu zapisu decyzji.');
          const monthInput=document.getElementById('cfAccountingMonth');allBusy(true);allElement('Cancel').hidden=true;if(monthInput)monthInput.disabled=true;
          try{return await window.CFAccountingDecisions.save(window.cfBackupBridge?.getClient?.(),decisionContext,result,ids,action,invoice);}finally{allBusy(false);if(monthInput)monthInput.disabled=false;}
        }});allElement('Confirm').hidden=false;allStatus('Sprawdź wynik kontroli. Uzupełnij dokumenty lub kliknij Pobierz ZIP z obecnymi dokumentami.');return;
      }
      if(!reviewState || reviewState.revision!==reviewRevision || reviewState.month!==month)throw new Error('Dokumenty zmieniono. Ponownie uruchom kontrolę przed pobraniem ZIP.');
      const purchaseFiles=window.CFAccountingReconcile.attachmentFiles(purchaseAttachments);
      allStatus('Dołączanie zaznaczonych załączników poczty…');
      const mail=await window.CFAccountingMail.exportFiles(controller.signal,allStatus);check();
      if(!organizer.length && !organizerPurchases.length && !purchaseFiles.length && !bank.length && !mail.length && !Object.values(ksef).some(result=>result?.count>0))throw new Error('Przygotuj dokumenty lub zaznacz załączniki, zanim pobierzesz paczkę.');
      const result=await window.CFAccountingPackage.build({month,ksef,organizerFiles:organizer,organizerPurchaseFiles:organizerPurchases,purchaseFiles,bankResults:bank,mailFiles:mail,signal:controller.signal,onProgress:allStatus});check();
      const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download='Dokumenty-'+month+'.zip';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      allElement('Confirm').hidden=true;const c=result.counts;allStatus('ZIP gotowy. KSeF: '+c.purchases+' zakupowych i '+c.sales+' sprzedażowych. Zakupowe spoza KSeF: '+c.externalPurchases+' PDF. mOrganizer — sprzedażowe: '+c.organizer+' PDF. MT940: '+c.bank+'. Poczta: '+c.mail+' załączników. Raport kasowy: pusty folder.');
    }catch(error){allStatus(error.name==='AbortError'?'Anulowano przygotowanie paczki.':'Nie utworzono wspólnego ZIP: '+error.message);}
    finally{if(allRun===controller){allRun=null;allBusy(false);}}
  }
  function saveKsef(kind){
    const result=ksefResults[kind];if(!result?.blob || !isAdmin())return;
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');
    link.href=url;link.download='KSeF-'+result.month+'-'+(kind==='purchases'?'zakupowe':'sprzedazowe')+'.zip';
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }

  function isAdmin() {
    try {
      const bridge = window.cfBackupBridge;
      return Boolean(bridge && typeof bridge.isAdmin === 'function' && bridge.isAdmin());
    }
    catch (_) { return false; }
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#cfAccountingDocsOverlay{position:fixed;inset:0;z-index:500000;background:rgba(20,24,20,.44);display:none;align-items:flex-start;justify-content:center;padding:clamp(10px,3vw,28px);overflow:auto;-webkit-overflow-scrolling:touch}',
      '#cfAccountingDocsOverlay.cf-open{display:flex}',
      '#cfAccountingDocsOverlay *{box-sizing:border-box}',
      '.cf-accounting-docs-sheet{width:min(980px,100%);min-height:min(600px,calc(100dvh - 56px));margin:auto;background:#f8f9f6;border:1px solid #e2e6dc;border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.23);color:#222820;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}',
      '.cf-accounting-docs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px 26px 18px;background:#fff;border-bottom:1px solid #e7e9e3}',
      '.cf-accounting-docs-head h1{margin:0 0 6px;font-size:clamp(20px,3vw,26px);line-height:1.2;font-weight:800}',
      '.cf-accounting-docs-head p{margin:0;color:#687064;font-size:13px;line-height:1.45}',
      '.cf-accounting-docs-close{border:0;background:transparent;color:#637019;font-family:inherit;font-size:13px;line-height:1.2;font-weight:800;padding:9px 2px;cursor:pointer;white-space:nowrap}',
      '.cf-accounting-docs-close:hover{text-decoration:underline}',
      '.cf-accounting-docs-body{padding:22px 26px 26px}',
      '.cf-accounting-period{display:flex;align-items:center;gap:12px;margin:0 0 20px;padding:14px 16px;background:#fff;border:1px solid #e3e7dc;border-radius:12px}',
      '.cf-accounting-period label{font-size:13px;font-weight:750}',
      '.cf-accounting-period input{min-height:40px;padding:7px 10px;border:1px solid #cfd5c4;border-radius:8px;background:#fff;color:#222820;font-family:inherit;font-size:14px;font-weight:600}',
      '.cf-accounting-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
      '.cf-accounting-source{min-width:0;padding:17px;background:#fff;border:1px solid #e2e6dc;border-radius:13px}',
      '.cf-accounting-source h2{margin:0 0 5px;font-size:16px;line-height:1.25}',
      '.cf-accounting-source p{margin:0;color:#687064;font-size:12px;line-height:1.45}',
      '.cf-accounting-source-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}',
      '.cf-accounting-status{flex:0 0 auto;display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border-radius:999px;background:#eef1e7;color:#66731c;font-size:10px;line-height:1.1;font-weight:800;letter-spacing:.02em;text-transform:uppercase}',
      '.cf-accounting-status.is-next{background:#f1f2ef;color:#687064}',
      '.cf-accounting-upload{display:flex;align-items:center;justify-content:center;min-height:42px;margin-top:14px;padding:10px 12px;border:1px solid #a6c61b;border-radius:9px;background:#faffeb;color:#4c5c0d;font-size:12px;font-weight:800;text-align:center;cursor:pointer}',
      '.cf-accounting-upload:hover{background:#f4fbdc}',
      '.cf-accounting-upload input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%)}',
      '.cf-accounting-file{display:none;margin-top:10px;padding:9px 10px;border-radius:8px;background:#f4f6f0;color:#4f5849;font-size:11px;line-height:1.4;overflow-wrap:anywhere}',
      '.cf-accounting-file.is-visible{display:block}',
      '.cf-accounting-note{margin:16px 0 0;padding:12px 14px;border-left:3px solid #a6c61b;border-radius:0 8px 8px 0;background:#f1f4e9;color:#59614b;font-size:11px;line-height:1.5}',
      '.cf-accounting-next{margin:18px 0 0;padding-top:16px;border-top:1px solid #e2e6dc;color:#687064;font-size:12px;line-height:1.55}',
      '.cf-bank-result{margin-top:14px;padding:12px;background:#f4f6f0;border-radius:8px}.cf-bank-result strong{font-size:12px}.cf-bank-result p,.cf-bank-status{margin-top:8px!important}.cf-accounting-file{white-space:pre-line}.cf-ksef-token-row{display:flex;align-items:stretch;gap:8px}.cf-ksef-token-row input{flex:1;min-width:0}.cf-ksef-token-row button{flex:0 0 auto}.cf-ksef-form{display:grid;gap:10px;margin-top:12px}.cf-ksef-form label{display:grid;gap:4px;font-size:12px;font-weight:700}.cf-ksef-form input,.cf-ksef-form select{width:100%;min-height:40px;padding:8px 10px;border:1px solid #cfd5c4;border-radius:8px;font:inherit;background:#fff;color:#222820}.cf-ksef-form button,.cf-ksef-download{min-height:40px;border:1px solid #a6c61b;border-radius:8px;padding:10px;background:#faffeb;color:#4c5c0d;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.cf-ksef-form button:disabled,.cf-ksef-download:disabled{opacity:.6;cursor:default}.cf-ksef-download{width:100%;margin-top:8px}.cf-ksef-download[hidden],#cfKsefCancel[hidden]{display:none}#cfKsefStatus{margin-top:12px;overflow-wrap:anywhere}',
      '@media(max-width:620px){#cfAccountingDocsOverlay{padding:0}.cf-accounting-docs-sheet{min-height:100dvh;border:0;border-radius:0}.cf-accounting-docs-head{padding:18px 16px 14px}.cf-accounting-docs-body{padding:16px}.cf-accounting-source-grid{grid-template-columns:1fr;gap:10px}.cf-accounting-period{align-items:flex-start;flex-direction:column}.cf-accounting-period input{width:100%}.cf-accounting-source{padding:14px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderTile(grid) {
    if (!grid || !isAdmin()) return;
    if (grid.querySelector('#' + TILE_ID)) return;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.id = TILE_ID;
    tile.className = 'cf-company-card cf-company-utility-card';
    tile.innerHTML = '<div><strong>Dokumenty księgowe</strong><span>Przygotowanie dokumentów dla księgowej</span></div>';
    grid.appendChild(tile);
  }

  function fileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function monthLabel(value) {
    if (!value) return 'wybranego miesiąca';
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return value;
    return new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  }

  function updateMonth() {
    const input = document.getElementById('cfAccountingMonth');
    const label = document.getElementById('cfAccountingMonthLabel');
    if (label) label.textContent = monthLabel(input?.value || '');
    const month=input?.value||'';
    let folder='MIESIĄC';try{folder=window.CFAccountingPackage.monthFolder(month);}catch(_){}
    for(const [id,destination] of [['cfAccountingOrganizerPath','faktury sprzedażowe'],['cfAccountingOrganizerPurchasePath','faktury zakupowe']]){const path=document.getElementById(id);if(path)path.textContent='Folder w ZIP: '+folder+' / '+destination+' /';}
    const number=bankElement('Number');if(number && !number.dataset.custom)number.value=String(Number(input?.value?.split('-')[1]) || 1);
  }

  function fileCard(type, files) {
    const target = document.getElementById(type === 'bank' ? 'cfAccountingBankFile' : type === 'organizerPurchases' ? 'cfAccountingOrganizerPurchaseFile' : 'cfAccountingOrganizerFile');
    if (!target) return;
    const list = Array.isArray(files) ? files : files ? [files] : [];
    if (!list.length) {
      target.textContent = '';
      target.classList.remove('is-visible');
      return;
    }
    target.textContent = 'Wybrane pliki PDF: ' + list.length + '\n' + list.map(file => file.name + ' · ' + fileSize(file.size)).join('\n');
    target.classList.add('is-visible');
  }

  function openModule() {
    if (!isAdmin()) return;
    addStyle();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'cfAccountingDocsTitle');
      overlay.innerHTML = [
        '<section class="cf-accounting-docs-sheet">',
          '<header class="cf-accounting-docs-head">',
            '<div><h1 id="cfAccountingDocsTitle">Dokumenty dla księgowej</h1><p>Wybierz miesiąc i zobacz źródła dokumentów przygotowywane w CleanFleet.</p></div>',
            '<button class="cf-accounting-docs-close" type="button" data-cf-accounting-close>Wróć do panelu</button>',
          '</header>',
          '<div class="cf-accounting-docs-body">',
          '<fieldset id="cfAccountingInputs" style="border:0;padding:0;margin:18px 0 0;min-width:0">',
            '<div class="cf-accounting-period"><label for="cfAccountingMonth">Miesiąc rozliczeniowy</label><input id="cfAccountingMonth" type="month"></div>',
            '<div class="cf-accounting-source-grid">',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>KSeF</h2><p>Faktury z wybranego miesiąca oraz odświeżenie historii trzech poprzednich. Uzupełnij historię roku pobiera brakujące miesiące od stycznia (bieżący rok — do dziś).</p></div><span class="cf-accounting-status">Połączenie KSeF</span></div><form id="cfKsefForm" class="cf-ksef-form"><label for="cfKsefNip">NIP firmy<input id="cfKsefNip" type="text" inputmode="numeric" maxlength="15" autocomplete="off" required></label><label for="cfKsefToken">Token KSeF<span class="cf-ksef-token-row"><input id="cfKsefToken" type="password" autocomplete="new-password" spellcheck="false" required data-saved="false"><button id="cfKsefSave" type="button">Zapisz</button></span></label><label for="cfKsefEnvironment">Środowisko<select id="cfKsefEnvironment"><option value="production">Produkcyjne — rzeczywiste faktury</option><option value="test">Testowe — dane testowe</option></select></label><button id="cfKsefStart" type="submit">Pobierz faktury z KSeF</button><button id="cfKsefHistoryYear" type="button">Uzupełnij historię roku</button><button id="cfKsefCancel" type="button" hidden>Anuluj pobieranie</button></form><p id="cfKsefStatus" role="status" aria-live="polite">Token musi mieć uprawnienie do przeglądania faktur. Kliknij Zapisz, aby go zapamiętać.</p><p id="cfKsefHistoryStatus" role="status">Historia zakupów jest zapisywana na koncie po pobraniu KSeF.</p><button id="cfKsefHistoryRetry" type="button" class="cf-ksef-download" hidden>Zapisz historię ponownie</button><button id="cfKsefpurchases" type="button" class="cf-ksef-download" hidden>Pobierz faktury zakupowe</button><button id="cfKsefsales" type="button" class="cf-ksef-download" hidden>Pobierz faktury sprzedażowe</button></article>',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>mBank</h2><p>Pełny eksport CSV historii rachunku za wybrany miesiąc.</p></div><span class="cf-accounting-status">CSV → MT940</span></div><label class="cf-accounting-upload">Wybierz pliki CSV<input id="cfAccountingBankInput" type="file" accept=".csv,text/csv" multiple></label><div class="cf-accounting-file" id="cfAccountingBankFile"></div><div class="cf-ksef-form"><label for="cfAccountingBankNumber">Numer wyciągu<input id="cfAccountingBankNumber" type="number" min="1" max="99999" step="1"></label><label for="cfAccountingBankEncoding">Kodowanie MT940<select id="cfAccountingBankEncoding"><option value="utf-8">UTF-8</option><option value="windows-1250">Windows-1250</option></select></label><button id="cfAccountingBankConvert" type="button">Konwertuj CSV na MT940</button></div><p id="cfAccountingBankStatus" class="cf-bank-status" role="status" aria-live="polite">Jeden pełny CSV na rachunek. Konwersja odbywa się w przeglądarce. Do importu wybierz w programie księgowym format MT940 standard i zgodne kodowanie.</p><div id="cfAccountingBankResults"></div></article>',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>mOrganizer</h2><p>Eksportowane paczki faktur w plikach PDF. Możesz zaznaczyć kilka plików jednocześnie.</p></div><span class="cf-accounting-status">Plik z komputera</span></div><h3>Faktury sprzedażowe</h3><p id="cfAccountingOrganizerPath">Folder w ZIP: MIESIĄC / faktury sprzedażowe /</p><label class="cf-accounting-upload">Wybierz PDF-y sprzedażowe<input id="cfAccountingOrganizerInput" type="file" accept=".pdf,application/pdf" multiple></label><div class="cf-accounting-file" id="cfAccountingOrganizerFile"></div><h3>Faktury zakupowe</h3><p id="cfAccountingOrganizerPurchasePath">Folder w ZIP: MIESIĄC / faktury zakupowe /</p><label class="cf-accounting-upload">Wybierz PDF-y zakupowe<input id="cfAccountingOrganizerPurchaseInput" type="file" accept=".pdf,application/pdf" multiple></label><div class="cf-accounting-file" id="cfAccountingOrganizerPurchaseFile"></div></article>',
              '<article class="cf-accounting-source" id="cfMailMount"></article>',
            '</div>',
            '</fieldset>',
          '<div id="cfAccountingReview" style="margin-top:20px;overflow-wrap:anywhere"></div>',
          '<div class="cf-ksef-form" style="margin-top:24px"><button id="cfAccountingAllStart" type="button">Sprawdź dokumenty i przygotuj ZIP</button><button id="cfAccountingAllConfirm" type="button" hidden>Pobierz ZIP z obecnymi dokumentami</button><button id="cfAccountingAllCancel" type="button" hidden>Anuluj przygotowanie ZIP</button><p id="cfAccountingAllStatus" role="status" aria-live="polite">Najpierw przygotuj dokumenty w wybranych sekcjach. ZIP połączy pobrane faktury KSeF, przekonwertowane MT940, wgrane PDF-y i tylko zaznaczone załączniki poczty. Możesz pominąć źródła, z których niczego nie potrzebujesz. Limit paczki: 300 MB.</p></div>',
            '<div class="cf-accounting-note">KSeF: osobne archiwa ZIP z fakturami PDF zakupowymi i sprzedażowymi. Archiwa pozostają w pamięci przeglądarki do zmiany miesiąca lub wylogowania. CSV z mBanku konwertujemy na MT940 lokalnie w przeglądarce. Eksport PDF z mOrganizera wybierasz samodzielnie. Przed ZIP-em sprawdź dokumenty przyciskiem na dole, następnie zatwierdź pobranie paczki. Limit pobrania KSeF: 200 MB łącznie.</div>',
            '<div class="cf-accounting-next">Paczka zawiera faktury zakupowe/KSEF, faktury sprzedażowe, wyciągi bankowe i pusty raport kasowy. Wybrany miesiąc: <strong id="cfAccountingMonthLabel">wybranego miesiąca</strong>.</div>',
          '</div>',
        '</section>'
      ].join('');
      overlay.addEventListener('focusin', event => { if(event.target.id==='cfKsefToken' && event.target.dataset.saved==='true')event.target.select(); });
      overlay.addEventListener('input', event => { if(event.target.id==='cfKsefToken')event.target.dataset.saved='false'; });
      overlay.addEventListener('submit', event => {invalidateReview();if(event.target.id==='cfKsefForm')startKsef(event); });
      overlay.addEventListener('click', event => {
        if(event.target.id==='cfAccountingAllStart')downloadAll();
        if(event.target.id==='cfAccountingAllConfirm')downloadAll(true);
        if(['cfMailSearch','cfMailLoadFolders'].includes(event.target.id))invalidateReview();
        if(event.target.id==='cfAccountingAllCancel')allRun?.abort();
        if(event.target.id==='cfAccountingBankConvert')convertBank();
        if(event.target.dataset.bankDownload!==undefined)downloadBank(Number(event.target.dataset.bankDownload));
        if(event.target.id==='cfKsefHistoryYear')fillHistoryYear();
        if(event.target.id==='cfKsefSave')saveKsefCredential();if(event.target.id==='cfKsefHistoryRetry')retryHistory();
        if(event.target.id==='cfKsefCancel')ksefRun?.abort();
        if(event.target.id==='cfKsefpurchases')saveKsef('purchases');
        if(event.target.id==='cfKsefsales')saveKsef('sales');
        if (event.target === overlay || event.target.closest('[data-cf-accounting-close]')) closeModule();
      });
      overlay.addEventListener('change', event => {
        if(event.target.closest?.('#cfAccountingReview'))return;
        invalidateReview();
        const input = event.target;
        if (['cfAccountingMonth','cfKsefNip','cfKsefEnvironment'].includes(input?.id)) { resetKsef(); }
        if(input?.id==='cfKsefEnvironment')loadKsefCredential();
        if(input?.id==='cfKsefNip' && ksefElement('Token').dataset.saved==='true' && !savedMatches()){ksefElement('Token').value='';ksefElement('Token').dataset.saved='false';ksefStatus('Wklej token dla tego NIP-u i kliknij Zapisz.');}
        if (input?.id === 'cfAccountingMonth') {purchaseAttachments.clear();updateMonth();window.CFAccountingMail?.monthChanged();resetBank();bankStatus('Miesiąc zmieniony. Ponownie przekonwertuj CSV.');}
        if(input?.id==='cfAccountingBankNumber'){input.dataset.custom='true';resetBank();bankStatus('Numer wyciągu zmieniony. Ponownie przekonwertuj CSV.');}
        if(input?.id==='cfAccountingBankEncoding'){resetBank();bankStatus('Kodowanie zmienione. Ponownie przekonwertuj CSV.');}
        if (input?.id === 'cfAccountingBankInput') {
          resetBank();bankFiles=Array.from(input.files || []);
          if(bankFiles.length>10 || bankFiles.some(file=>!/\.csv$/i.test(file.name))){bankFiles=[];input.value='';bankStatus('Wybierz maksymalnie 10 plików CSV.');}
          else bankStatus('Wybrane pliki: '+bankFiles.length+'. Kliknij Konwertuj CSV na MT940.');
          bankFileLabels();
        }
        if (['cfAccountingOrganizerInput','cfAccountingOrganizerPurchaseInput'].includes(input?.id)) {
          const files = Array.from(input.files || []);
          const kind=input.id==='cfAccountingOrganizerPurchaseInput'?'organizerPurchases':'organizer';
          selectedFiles[kind] = files.filter(file => /\.pdf$/i.test(file.name) || file.type === 'application/pdf');
          fileCard(kind, selectedFiles[kind]);
        }
      });
      document.body.appendChild(overlay);
      window.CFAccountingMail?.mount(overlay);
    }
    const now = new Date();
    const monthInput = document.getElementById('cfAccountingMonth');
    if (monthInput && !monthInput.value) monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    bankFileLabels();
    fileCard('organizer', selectedFiles.organizer);
    fileCard('organizerPurchases', selectedFiles.organizerPurchases);
    updateMonth();
    priorBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.classList.add('cf-open');
    loadKsefCredential();
    window.CFAccountingMail?.open();
    overlay.querySelector('[data-cf-accounting-close]')?.focus({ preventScroll: true });
  }

  function closeModule() {
    allRun?.abort();
    window.CFAccountingMail?.close();
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ksefRun?.abort();
    ksefConfigRun?.abort();ksefConfigRun=null;
    const token=ksefElement('Token');if(token && token.dataset.saved!=='true')token.value='';
    busyKsef(Boolean(ksefRun));
    overlay.classList.remove('cf-open');
    document.body.style.overflow = priorBodyOverflow;
  }

  function syncTile() {
    const grid = document.getElementById('cfCompanyGrid');
    if (!grid) return;
    if (isAdmin()) renderTile(grid);
    else {
      grid.querySelector('#' + TILE_ID)?.remove();
      closeModule();
      forgetKsefView();
      window.CFAccountingMail?.reset();
      resetBank();bankFiles=[];bankFileLabels();
      purchaseAttachments.clear();selectedFiles.organizer=[];selectedFiles.organizerPurchases=[];fileCard('organizer',selectedFiles.organizer);fileCard('organizerPurchases',selectedFiles.organizerPurchases);
    }
  }

  function boot() {
    addStyle();
    syncTile();
    observer = new MutationObserver(() => syncTile());
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      const tile = event.target.closest?.('#' + TILE_ID);
      if (!tile) return;
      event.preventDefault();
      event.stopPropagation();
      openModule();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById(OVERLAY_ID)?.classList.contains('cf-open')) closeModule();
    });
    window.addEventListener('pagehide', () => { allRun?.abort();observer?.disconnect();purchaseAttachments.clear();window.CFAccountingMail?.reset();forgetKsefView();resetBank();bankFiles=[]; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
