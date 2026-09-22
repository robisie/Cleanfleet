/* CleanFleet v1.30.58 — selektywna, niedestrukcyjna warstwa ikon 3D Glass. */
(()=>{
  'use strict';

  const ROOT='/app/assets/icons-glass/';
  const FILES={
    companies:'01-firmy.png',employees:'02-pracownicy.png',purchases:'03-zakupy-koszty.png',earnings:'04-zarobki.png',
    reminders:'05-przypomnienia.png',reports:'06-raporty.png',statistics:'07-statystyki.png',addCompany:'08-dodaj-firme.png',
    payments:'09-rozliczenia.png',financialStats:'10-statystyki-finansowe.png',fleetUpdate:'11-aktualizuj-pojazdy.png',backup:'12-backup.png',
    notifications:'13-powiadomienia.png',changes:'14-zmiany-wnioski.png',vehicleSearch:'15-wyszukiwarka-pojazdow.png',plateCamera:'16-aparat-tablicy.png',
    vehicle:'17-pojazd-ogolny.png',van:'18a-dostawcze.png',truck:'18b-ciezarowe.png',coach:'18c-autokary.png',history:'19-historia-pojazdu.png',
    addVehicle:'20-dodaj-pojazd.png',editVehicle:'21-edytuj-pojazd.png',deleteVehicle:'22-usun-pojazd.png',addWash:'23-dodaj-pranie.png',
    photos:'24-zdjecia-przed-po.png',localPhotos:'25-zdjecia-lokalne-folder.png',entryChat:'26-chat-wpisu.png',calendar:'27-termin-kalendarz.png',
    awaiting:'28-oczekuje-akceptacji.png',scheduled:'29-termin-ustalony.png',expired:'30-termin-uplynal.png',warning:'31-ostrzezenie.png',
    invoices:'32-faktury.png',pdf:'33-pdf.png',reportDocument:'34-raport-dokument.png',attachment:'35-zalacznik.png',xlsx:'36-excel-xlsx.png',
    restore:'37-backup-przywracanie.png',mainChat:'38-chat-glowny.png',vehicleMessage:'39-wiadomosc-pojazdu.png',send:'40-wyslij-wiadomosc.png',
    newEmployee:'41-nowy-pracownik.png',washDone:'42-pranie-zakonczone.png',edit:'43-edytuj.png',remove:'44-usun.png',add:'45-dodaj.png',
    accept:'46-akceptuj.png',reject:'47-odrzuc-anuluj.png',back:'48-wroc.png',close:'49-zamknij.png',menu:'50-menu.png',search:'51-szukaj.png',filter:'52-filtr.png'
  };

  // Wyjątki zaakceptowane przez użytkownika: menu oraz kafle narzędzi administratora.
  // Pozostałe przyciski dostają Glass wyłącznie wtedy, gdy wcześniej miały ikonę.
  const explicit={
    menuBtn:'menu',plateCameraBtn:'plateCamera',financeBtn:'payments',statsBtn:'financialStats',exportPdfBtn:'pdf',fleetUpdateBtn:'fleetUpdate',
    exportExcelBtn:'backup',importBtn:'restore',cfNotificationsBtn:'notifications',cfChangeNotificationsBtn:'changes',cfCompaniesBtn:'companies',cfEmployeesBtn:'employees',
    cfCompanyUsersCard:'employees',
    cfCompanyPurchasesCard:'purchases',cfCompanyEarningsCard:'earnings',cfCompanyRemindersCard:'reminders',cfCompanyReportsCard:'reports',
    cfCompanyStatisticsCard:'statistics',cfCompanyAddCard:'addCompany',cfCompanyTaxesCard:'payments',cfChatFab:'mainChat'
  };

  const selectorRules=[
    ['[data-cf-photos][data-local-has="1"]','localPhotos'],['[data-cf-photos]','photos']
  ];

  const leadingGlyph=/^\s*(?:(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}](?:\uFE0F|\u200D[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}])*)|[←→↻×✕✓✔✎➤☰⠿+])\s*/u;
  let applying=false,queued=false;

  function weather(el){
    if(!el?.closest)return false;
    return !!el.closest('#cfWeatherSlot,#cfWeatherOverlay,#weatherOverlay,[id*="weather" i],[class*="weather" i]');
  }
  function normalize(value){
    return String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('pl-PL');
  }
  function textFor(el){
    return normalize([el?.textContent,el?.getAttribute?.('aria-label'),el?.getAttribute?.('title')].filter(Boolean).join(' '));
  }
  function hadVisualIcon(el){
    if(!el)return false;
    if(el.querySelector?.(':scope > svg,:scope > [aria-hidden="true"],:scope > .cf-bell-icon'))return true;
    return leadingGlyph.test(el.textContent||'');
  }
  function excluded(el){
    return !!el?.matches?.('#cfHeaderChangeNotificationsBtn,[data-record-chat],.history-button[data-history-plate],#cfProfileHistory,#btnMonth,#btnYear,#btnAll,#btnBottomMenu,[data-bottom-action],.attention-card,.cf-company-card[data-company-id],#cfCompanyCalendarCard,#cfCalendarTile,#searchBtn,#cfCompanySearchBtn,.cf-modal-back-btn,.cf-native-back-action,button[id^="cfBack"],button[id$="BackBtn"],.cf-company-card-edit,#cfReminderAddBtn,#cfReports button');
  }
  function stripLeading(host){
    if(!host)return;
    for(const node of [...host.childNodes]){
      if(node.nodeType===Node.TEXT_NODE){
        let value=node.nodeValue||'',next=value;
        do{value=next;next=value.replace(leadingGlyph,'');}while(next!==value);
        if(next!==node.nodeValue)node.nodeValue=next;
        if(next.trim())break;
      }else if(node.nodeType===Node.ELEMENT_NODE && !node.classList.contains('cf-glass-icon')){
        if(node.matches('[aria-hidden="true"],.cf-bell-icon') && leadingGlyph.test(node.textContent||''))node.classList.add('cf-legacy-icon-hidden');
        else break;
      }
    }
  }
  function plainTextAction(el){
    const visible=normalize(el?.textContent);
    return /(?:^|\s)(?:edytuj|usuń)(?:\s|$)/.test(visible)
      || el?.id==='cfReminderAddBtn'
      || !!el?.matches?.('#cfReports [data-action="add-filter"],#cfReports [data-action="add-group"]');
  }
  function clearGlass(el){
    const host=hostFor(el);
    host?.querySelector?.(':scope > .cf-glass-icon')?.remove();
    host?.classList?.remove('cf-glass-icon-host');
    el?.classList?.remove('cf-has-glass-icon');
    if(el?.dataset)delete el.dataset.cfGlassIcon;
  }
  function createIcon(key,size='compact'){
    const file=FILES[key];if(!file)return null;
    const img=document.createElement('img');
    img.className=`cf-glass-icon cf-glass-icon--${size}`;
    img.src=ROOT+file;
    img.alt='';img.setAttribute('aria-hidden','true');img.decoding='async';img.loading='eager';img.dataset.cfGlassKey=key;
    return img;
  }
  function hostFor(el){
    if(el.classList?.contains('menu-item'))return el.querySelector('.menu-item-title')||el;
    return el;
  }
  function decorate(el,key,size='compact'){
    if(!el||!FILES[key]||weather(el))return;
    const host=hostFor(el);if(!host)return;
    const current=host.querySelector(':scope > .cf-glass-icon');
    if(current?.dataset.cfGlassKey===key){stripLeading(host);return;}
    current?.remove();
    const icon=createIcon(key,size);if(!icon)return;
    host.prepend(icon);host.classList.add('cf-glass-icon-host');el.classList.add('cf-has-glass-icon');el.dataset.cfGlassIcon=key;
    stripLeading(host);
  }
  function sizeFor(el,key){
    if(el.matches?.('.cf-company-utility-card'))return'tile';
    if(el.matches?.('h1,h2,h3,.cf-glass-heading'))return'heading';
    if(key==='mainChat')return'fab';
    if(el.matches?.('.menu-item')||['vehicleSearch','vehicle'].includes(key))return'medium';
    return'compact';
  }
  function keyFromText(el){
    const t=textFor(el);
    if(!t)return null;
    if(/lokalne zdjęcia|folder zdjęć|pliki \/ icloud/.test(t))return'localPhotos';
    if(/^zdjęcia$|zdjęcia przed|zdjęcia wpisu|biblioteka zdjęć|(?:dodaj|zapisz) zdjęci/.test(t))return'photos';
    if(/aparat|kamera|zdjęcie tablicy|zrób zdjęcie/.test(t))return'plateCamera';
    if(/dodaj pranie|dodaj do prania/.test(t))return'addWash';
    if(/dodaj (nowy )?(pojazd|samochód)/.test(t))return'addVehicle';
    if(/edytuj pojazd/.test(t))return'editVehicle';
    if(/usuń (pojazd|samochód)/.test(t))return'deleteVehicle';
    if(/historia (pojazdu|samochodu|prań)|całą historię/.test(t))return'history';
    if(/termin upłynął|po terminie/.test(t))return'expired';
    if(/oczekuje na (akceptację|potwierdzenie) terminu/.test(t))return'awaiting';
    if(/termin ustalony|termin potwierdzony/.test(t))return'scheduled';
    if(/kalendarz|inny termin|termin wykonania/.test(t))return'calendar';
    if(/nowy pracownik|rejestracja konta/.test(t))return'newEmployee';
    if(/pranie zakończone|wykonany wpis/.test(t))return'washDone';
    if(/wiadomość dotyczy|wiadomość o pojeździe/.test(t))return'vehicleMessage';
    if(/wyślij|otwórz w mail/.test(t))return'send';
    if(/chat|wiadomości cleanfleet/.test(t))return el.id==='cfChatFab'?'mainChat':'entryChat';
    if(/załącznik|wybierz plik/.test(t))return'attachment';
    if(/xlsx|\bxls\b|excel/.test(t))return'xlsx';
    if(/faktur/.test(t))return'invoices';
    if(/generuj raport|raport dokument/.test(t))return'reportDocument';
    if(/\bpdf\b/.test(t))return'pdf';
    if(/przywróć dane|przywracanie/.test(t))return'restore';
    if(/backup|pełną bazę/.test(t))return'backup';
    if(/powiadom/.test(t))return'notifications';
    if(/zmiany i wnioski/.test(t))return'changes';
    if(/podsumowanie (miesiąca|roku)/.test(t))return'statistics';
    if(/lista wszystkich (samochodów|pojazdów)/.test(t))return'vehicle';
    if(/zakupy i koszty|^zakupy$/.test(t))return'purchases';
    if(/moje zarobki/.test(t))return'earnings';
    if(/^przypomnienia/.test(t))return'reminders';
    if(/^raporty$/.test(t))return'reports';
    if(/^statystyki$/.test(t))return'statistics';
    if(/^dodaj firmę/.test(t))return'addCompany';
    if(/statystyki finansowe/.test(t))return'financialStats';
    if(/rozliczenia|płatności/.test(t))return'payments';
    if(/aktualizuj pojazdy/.test(t))return'fleetUpdate';
    if(/pracownicy floty|otwórz pracowników|^pracownicy$/.test(t))return'employees';
    if(/^firmy$|moduł firmy|zmień aktywną firmę/.test(t))return'companies';
    if(/ostrzeżenie|wymaga uwagi|dawno nie prane/.test(t))return'warning';
    if(/^dostawcze$/.test(t))return'van';
    if(/^ciężarowe$/.test(t))return'truck';
    if(/^(autokary|busy)$/.test(t))return'coach';
    if(/^osobowe$/.test(t))return'vehicle';
    if(/zlecenie odrzucone/.test(t))return'reject';
    if(/odrzuć|anuluj|wyczyść/.test(t))return'reject';
    if(/akceptuj|potwierdź|zatwierdź|oznacz opłacone|wykonane/.test(t))return'accept';
    if(/wróć|wstecz|powrót/.test(t))return'back';
    if(/zamknij/.test(t))return'close';
    if(/usuń/.test(t))return'remove';
    if(/edytuj/.test(t))return'edit';
    if(/dodaj/.test(t))return'add';
    if(/szukaj|wyszukiw/.test(t))return'search';
    if(/filtr/.test(t))return'filter';
    if(/^menu$/.test(t))return'menu';
    return null;
  }
  function dynamicExplicit(el,key){
    if(el.id==='financeBtn')return /faktur/.test(textFor(el))?'invoices':'payments';
    if(el.id==='exportPdfBtn')return /generuj raport/.test(textFor(el))?'reportDocument':'pdf';
    if(el.id==='cfReportPreviewDownload')return /xls/.test(textFor(el))?'xlsx':'pdf';
    return key;
  }
  function decorateButtons(root){
    const nodes=[];
    if(root?.matches?.('button,[role="button"]'))nodes.push(root);
    root?.querySelectorAll?.('button,[role="button"]').forEach(x=>nodes.push(x));
    nodes.forEach(el=>{
      if(plainTextAction(el)){clearGlass(el);el.classList.add('cf-text-only-action');stripLeading(el);return;}
      if(weather(el)||excluded(el)||el.classList.contains('cf-grid-drag-handle'))return;
      let key=explicit[el.id]||null;
      if(!key){for(const [selector,value] of selectorRules){if(el.matches(selector)){key=value;break;}}}
      if(!key&&!hadVisualIcon(el))return;
      key=dynamicExplicit(el,key)||keyFromText(el);
      if(key)decorate(el,key,sizeFor(el,key));
    });
  }
  function decorateSpecial(root){
    const query=(selector)=>{const out=[];if(root?.matches?.(selector))out.push(root);root?.querySelectorAll?.(selector).forEach(x=>out.push(x));return out;};
    query('.main-filters').forEach(el=>decorate(el,'filter','compact'));
    query('.record-meta strong,.history-status-pill').forEach(el=>{const key=keyFromText(el);if(['awaiting','scheduled','expired'].includes(key)){decorate(el,key,'compact');el.classList.add('cf-glass-status');}});
    query('.cf-chat-head>span').forEach(el=>{if(hadVisualIcon(el)){decorate(el,'mainChat','heading');el.classList.add('cf-glass-heading');}});
    query('#cfChatAttachmentText,.cf-chat-vehicle').forEach(el=>decorate(el,'vehicleMessage','compact'));
    query('[data-record-chat]').forEach(el=>stripLeading(el));
  }
  function scan(root=document){
    if(applying)return;applying=true;
    try{decorateButtons(root);decorateSpecial(root);}finally{applying=false;}
  }
  function schedule(root=document){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;scan(root?.isConnected===false?document:root);});
  }
  function boot(){
    scan(document);
    new MutationObserver(mutations=>{
      if(applying)return;
      const relevant=mutations.find(m=>!m.target?.closest?.('.cf-glass-icon'));
      // Jedna paczka MutationObserver może obejmować równocześnie kilka odległych
      // fragmentów interfejsu (np. zmianę etykiety i nowy przycisk). Skan dokumentu
      // gwarantuje, że żaden dynamicznie dodany element nie zostanie pominięty.
      if(relevant)schedule(document);
    }).observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.CFGlassIcons={scan,files:{...FILES}};
})();
