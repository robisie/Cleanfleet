/* Read-only Fleet employee tour, with an administrator preview of the same steps. */
(()=>{
  'use strict';
  const preview=()=>document.body?.dataset.cfRole==='admin';
  const allowed=()=>['fleet_employee','admin'].includes(document.body?.dataset.cfRole);
  const $=selector=>document.querySelector(selector);
  const isVisible=el=>!!(el && !el.hidden && getComputedStyle(el).display!=='none' && el.getClientRects().length);
  const main=selector=>({mode:'main',selector});
  const menu=selector=>({mode:'menu',selector});
  const bottom=(action,desktop)=>({mode:'bottom',action,desktop});
  const steps=[
    {...main('#cfCompanyContextBtn'),title:'Twoja firma',text:'Pracujesz w firmie przypisanej do konta. Wpisy, flota, faktury i zdjęcia dotyczą właśnie jej.'},
    {...main('#searchInput'),title:'Wyszukiwanie',text:'Wpisz tablicę lub jej fragment. Możesz znaleźć pojazd, otworzyć jego kartę i historię, także gdy nie ma go na aktywnej liście.'},
    {...main('#mainStatusFilter'),title:'Statusy zleceń',text:'Filtruj wpisy: zlecone, do wykonania, po terminie, wykonane, niezatwierdzone i rozliczone. Filtr wykonującego jest obok.'},
    {...main('#recordsList .record-card'),fallback:'#recordsList',title:'Wpisy prania',text:'Otwórz wpis, aby przejrzeć szczegóły zlecenia. Jeśli lista jest pusta, wyszukaj pojazd lub zajrzyj do listy floty.'},
    {...main('#recordsList .record-card'),fallback:'#recordsList',title:'Dodawanie i edycja prania',text:'Z karty pojazdu dodasz nowe pranie. We wpisie uzupełnisz termin, opis i inne dane; zmiany wymagające akceptacji wyślesz jako wniosek.'},
    {...main('#recordsList .record-card'),fallback:'#recordsList',title:'Terminy i decyzje',text:'Przy zleceniu możesz potwierdzić termin, odrzucić propozycję albo zaproponować nową datę. Odpowiedź pojawi się w zmianach i wnioskach.'},
    {...main('#recordsList [data-cf-photos]'),fallback:'#recordsList',title:'Zdjęcia pojazdu',text:'Zdjęcia przesłane przez administratora możesz oglądać i pobierać jako ZIP. Aparat i wysyłanie zdjęć są dostępne tylko dla administratora.'},
    {...main('#cfHeaderChangeNotificationsBtn'),title:'Zmiany i wnioski',text:'Tutaj sprawdzisz odpowiedzi administratora, propozycje terminów i status zgłoszeń. Wycofanie pojazdu z aktywnej floty wymaga jego decyzji.'},
    {...bottom('month','#btnMonth'),title:'Podsumowanie miesiąca',text:'Otwórz miesięczne zestawienie prania i wybierz interesujący miesiąc. Na telefonie ta opcja jest w dolnym menu.'},
    {...bottom('year','#btnYear'),title:'Podsumowanie roku',text:'Tutaj przejrzysz dane roczne. Na telefonie znajdziesz tę funkcję w dolnym menu.'},
    {...bottom('all','#btnAll'),title:'Lista pojazdów',text:'Lista pokazuje aktywną flotę. Z niej otworzysz kartę, historię lub edycję pojazdu. Usunięcie z aktywnej floty zgłaszasz administratorowi.'},
    {...bottom('all','#btnAll'),title:'Karta i historia pojazdu',text:'Kliknij tablicę na liście, aby zobaczyć historię, dodać pranie lub pobrać kartę PDF. Edycja pojazdu jest dostępna w akcjach.'},
    {...bottom('all','#btnAll'),title:'Wycofanie pojazdu',text:'Pracownik zgłasza wycofanie pojazdu z aktywnej floty. Administrator zdecyduje, czy pojazd zostaje, czy trafia do archiwum; trwałe usunięcie jest tylko dla administratora.'},
    {...menu('#financeBtn'),title:'Faktury',text:'Przejrzyj faktury przypisanej firmy i filtruj je po miesiącu. W tym widoku nie wystawiasz faktur.'},
    {...menu('#exportPdfBtn'),title:'Raporty',text:'Wybierasz zakres dat, typy, statusy, kolumny i format raportu. Najpierw możesz skorzystać z gotowego szablonu.'},
    {...menu('#fleetUpdateBtn'),title:'Aktualizacja floty',text:'Możesz dodać brakujące pojazdy z pliku XLS, XLSX lub CSV. Przed importem aplikacja pokazuje wymagane kolumny i podgląd.'},
    {...menu('#cfChangeNotificationsBtn'),title:'Twoje zgłoszenia',text:'W menu jest również lista zmian i wniosków. Otwórz ją, aby zobaczyć sprawy oczekujące i odpowiedzi.'},
    {...menu('#cfNotificationsBtn'),title:'Powiadomienia urządzenia',text:'Tutaj sprawdzisz stan powiadomień na tym urządzeniu. Ich odbiór zależy także od ustawień telefonu.'},
    {...menu('#cfEmployeeSettingsBtn'),title:'Pomoc zawsze pod ręką',text:'W Ustawieniach i pomocy możesz uruchomić ten samouczek ponownie w dowolnym momencie.'},
    {...menu('#cfLogoutBtn'),title:'Wylogowanie',text:'Po zakończeniu pracy możesz wylogować konto na tym urządzeniu. Samouczek nie naciska tego przycisku.'}
  ];
  let index=-1,root=null,previousFocus=null,previousScroll=null;
  let previewLabels=null;
  function setPreview(on){
    const body=document.body;
    if(!on){
      body.classList.remove('cf-tour-employee-preview');
      if(previewLabels){
        for(const [selector,value] of previewLabels){
          const el=$(selector);if(el)el.textContent=value;
        }
        previewLabels=null;
      }
      return;
    }
    if(!preview())return;
    const labels=[
      ['#financeBtnTitle','🧾 Faktury'],
      ['#financeBtnSub','Lista wszystkich faktur z filtrowaniem po miesiącu'],
      ['#exportPdfBtnTitle','📄 Generuj raport'],
      ['#exportPdfBtnSub','Samodzielnie wybierz dane, zakres i format raportu']
    ];
    previewLabels=labels.map(([selector])=>[selector,$(selector)?.textContent]);
    for(const [selector,value] of labels){const el=$(selector);if(el)el.textContent=value;}
    body.classList.add('cf-tour-employee-preview');
  }
  function closeMenus(){
    $('#menuOverlay')?.classList.remove('open');
    const lower=$('#bottomMobileMenu');
    lower?.classList.remove('open');lower?.setAttribute('aria-hidden','true');
    $('#btnBottomMenu')?.setAttribute('aria-expanded','false');
  }
  function showSettings(){
    if(!allowed())return;
    closeMenus();
    const adminPreview=preview();
    const panel=document.createElement('div');
    panel.id='cfEmployeeSettingsOverlay';
    panel.className='cf-employee-settings-overlay';
    panel.innerHTML='<div class="cf-employee-settings-card" role="dialog" aria-modal="true" aria-labelledby="cfEmployeeSettingsTitle"><h2 id="cfEmployeeSettingsTitle">Ustawienia i pomoc</h2><p></p><div class="cf-employee-settings-actions"><button type="button" data-tour-start></button><button type="button" data-settings-close>Zamknij</button></div></div>';
    panel.querySelector('p').textContent=adminPreview
      ? 'Zobaczysz dokładnie te same kroki i opisy, co pracownik floty. Pod spodem pozostają dane Twojego konta administratora; podgląd nie zmienia uprawnień.'
      : 'Samouczek pokaże funkcje dostępne pracownikowi floty. Możesz go przerwać i wrócić do niego później.';
    panel.querySelector('[data-tour-start]').textContent=adminPreview?'Zobacz samouczek pracownika':'Uruchom samouczek';
    document.body.append(panel);
    const dismiss=()=>{panel.remove();document.removeEventListener('keydown',escape);};
    const escape=e=>{if(e.key==='Escape')dismiss();};
    panel.addEventListener('click',e=>{if(e.target===panel||e.target.closest('[data-settings-close]'))dismiss();});
    panel.querySelector('[data-tour-start]').addEventListener('click',()=>{dismiss();start();});
    document.addEventListener('keydown',escape);
    panel.querySelector('[data-tour-start]').focus();
  }
  function target(step){
    if(step.mode==='bottom'){
      const desktop=$(step.desktop);
      if(isVisible(desktop))return desktop;
      return $(`[data-bottom-action="${step.action}"]`)||$('#btnBottomMenu');
    }
    const el=$(step.selector);
    return isVisible(el)?el:(step.fallback?$(step.fallback):null);
  }
  function prepare(step){
    closeMenus();
    if(step.mode==='menu')$('#menuOverlay')?.classList.add('open');
    else if(step.mode==='bottom'&&!isVisible($(step.desktop))){
      const lower=$('#bottomMobileMenu');
      lower?.classList.add('open');lower?.setAttribute('aria-hidden','false');
      $('#btnBottomMenu')?.setAttribute('aria-expanded','true');
    }
  }
  function place(el){
    if(!root)return;
    const halo=root.querySelector('.cf-tour-halo'),card=root.querySelector('.cf-tour-card');
    const vw=window.innerWidth,vh=window.innerHeight;
    const bounds=el?.getBoundingClientRect();
    if(!bounds||!bounds.width||!bounds.height){
      root.classList.add('cf-tour-no-target');
      halo.hidden=true;card.style.left='50%';card.style.top='50%';card.style.transform='translate(-50%,-50%)';return;
    }
    root.classList.remove('cf-tour-no-target');
    halo.hidden=false;
    const left=Math.max(8,bounds.left-5),top=Math.max(8,bounds.top-5);
    halo.style.left=left+'px';halo.style.top=top+'px';
    halo.style.width=Math.min(vw-left-8,bounds.width+10)+'px';
    halo.style.height=Math.min(vh-top-8,bounds.height+10)+'px';
    card.style.transform='';
    const cardWidth=Math.min(360,vw-24);
    card.style.width=cardWidth+'px';
    card.style.left=Math.max(12,Math.min(vw-cardWidth-12,bounds.left))+'px';
    const cardHeight=card.offsetHeight||220;
    const below=bounds.bottom+16,above=bounds.top-cardHeight-16;
    card.style.top=(below+cardHeight<vh-12?below:above>12?above:Math.max(12,Math.min(vh-cardHeight-12,(vh-cardHeight)/2)))+'px';
  }
  async function show(n){
    if(!root||!allowed()){stop();return;}
    index=Math.max(0,Math.min(steps.length-1,n));
    const current=index,step=steps[current];
    prepare(step);
    const el=target(step);
    if(el)el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    root.querySelector('[data-tour-count]').textContent=`Krok ${index+1} z ${steps.length}`;
    root.querySelector('[data-tour-title]').textContent=step.title;
    root.querySelector('[data-tour-text]').textContent=step.text;
    root.querySelector('[data-tour-prev]').disabled=index===0;
    root.querySelector('[data-tour-next]').textContent=index===steps.length-1?'Zakończ':'Dalej';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(root&&index===current)place(target(step));
  }
  function stop(){
    if(!root)return;
    root.remove();root=null;index=-1;closeMenus();setPreview(false);
    window.removeEventListener('resize',reposition);
    window.removeEventListener('scroll',reposition,true);
    document.removeEventListener('keydown',keys,true);
    if(previousScroll!==null)window.scrollTo({top:previousScroll,behavior:'instant'});
    previousFocus?.focus?.({preventScroll:true});
    previousFocus=null;previousScroll=null;
  }
  function reposition(){if(root&&index>=0)place(target(steps[index]));}
  function keys(e){
    if(!root)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();stop();}
    else if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();if(index===steps.length-1)stop();else show(index+1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();show(index-1);}
    else if(e.key==='Tab'){
      const buttons=[...root.querySelectorAll('.cf-tour-card button:not(:disabled)')];
      const next=buttons.indexOf(document.activeElement)+(e.shiftKey?-1:1);
      if(next<0||next>=buttons.length){e.preventDefault();buttons[e.shiftKey?buttons.length-1:0]?.focus();}
    }
  }
  function start(){
    if(!allowed())return;
    stop();closeMenus();
    previousFocus=document.activeElement;previousScroll=window.scrollY;
    const adminPreview=preview();
    setPreview(adminPreview);
    root=document.createElement('div');root.id='cfFleetEmployeeTour';
    root.innerHTML='<div class="cf-tour-shade"></div><div class="cf-tour-halo" aria-hidden="true"></div><div class="cf-tour-card" role="dialog" aria-modal="true" aria-labelledby="cfTourTitle"><div class="cf-tour-preview" data-tour-preview hidden>Podgląd pracownika floty</div><div class="cf-tour-count" data-tour-count></div><h2 id="cfTourTitle" data-tour-title></h2><p data-tour-text></p><div class="cf-tour-actions"><button type="button" data-tour-stop>Pomiń</button><button type="button" data-tour-prev>Wstecz</button><button type="button" data-tour-next>Dalej</button></div></div>';
    root.querySelector('[data-tour-preview]').hidden=!adminPreview;
    document.body.append(root);
    root.querySelector('[data-tour-stop]').onclick=stop;
    root.querySelector('[data-tour-prev]').onclick=()=>show(index-1);
    root.querySelector('[data-tour-next]').onclick=()=>index===steps.length-1?stop():show(index+1);
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    document.addEventListener('keydown',keys,true);
    show(0);
    root.querySelector('[data-tour-next]').focus();
  }
  const style=document.createElement('style');
  style.textContent=`
    .cf-employee-settings-overlay{position:fixed;inset:0;z-index:410000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(12,17,14,.65)}
    .cf-employee-settings-card{box-sizing:border-box;width:min(430px,100%);padding:22px;border-radius:16px;background:#fff;color:#171a18;box-shadow:0 24px 60px #0004}
    .cf-employee-settings-card h2{margin:0 0 12px;font-size:21px}.cf-employee-settings-card p{font-size:15px;line-height:1.5}.cf-employee-settings-actions{display:flex;gap:10px;flex-wrap:wrap}
    .cf-employee-settings-actions button,.cf-tour-actions button{min-height:44px;border:1px solid #ccd1c7;border-radius:10px;padding:9px 14px;background:#fff;color:#17211b;font:700 14px system-ui;cursor:pointer}
    .cf-employee-settings-actions [data-tour-start],.cf-tour-actions [data-tour-next]{background:#166e46;border-color:#166e46;color:#fff}
    #cfFleetEmployeeTour{position:fixed;inset:0;z-index:500000;pointer-events:none}
    .cf-tour-shade{position:absolute;inset:0;background:transparent;pointer-events:auto}
    .cf-tour-no-target .cf-tour-shade{background:rgba(9,18,14,.66)}
    .cf-tour-halo{position:fixed;border:3px solid #b5dc2c;border-radius:13px;background:transparent;box-shadow:0 0 0 9999px rgba(9,18,14,.66),0 0 0 6px rgba(181,220,44,.32);pointer-events:none}
    .cf-tour-halo[hidden]{display:none}
    .cf-tour-card{box-sizing:border-box;position:fixed;width:min(360px,calc(100vw - 24px));max-height:min(320px,calc(100dvh - 24px));overflow:auto;padding:17px;border-radius:16px;background:#fff;color:#171a18;box-shadow:0 14px 55px #0007;pointer-events:auto}
    .cf-tour-count{font:700 12px system-ui;color:#166e46}.cf-tour-card h2{margin:7px 0 8px;font:800 20px system-ui}.cf-tour-card p{margin:0 0 15px;font:15px/1.45 system-ui}
    .cf-tour-actions{display:flex;gap:7px;flex-wrap:wrap}.cf-tour-actions button:disabled{opacity:.45;cursor:default}
    .cf-tour-preview{margin-bottom:7px;padding:5px 8px;border-radius:6px;background:#e7f2e9;color:#135b38;font:700 12px system-ui}
    .cf-tour-preview[hidden]{display:none}
    body.cf-tour-employee-preview #statsBtn,
    body.cf-tour-employee-preview #exportExcelBtn,
    body.cf-tour-employee-preview #cfUnifiedBackupExport,
    body.cf-tour-employee-preview #cfUnifiedBackupRestore,
    body.cf-tour-employee-preview #importBtn,
    body.cf-tour-employee-preview #cfCompaniesBtn,
    body.cf-tour-employee-preview #cfEmployeesBtn,
    body.cf-tour-employee-preview #plateCameraBtn,
    body.cf-tour-employee-preview #btnQuickWash,
    body.cf-tour-employee-preview #attentionPanel{display:none!important}
  `;
  document.head.append(style);
  document.addEventListener('click',e=>{if(e.target.closest?.('#cfEmployeeSettingsBtn'))showSettings();});
  new MutationObserver(()=>{if(root)stop();if(!allowed())$('#cfEmployeeSettingsOverlay')?.remove();}).observe(document.body,{attributes:true,attributeFilter:['data-cf-role']});
  window.cfFleetEmployeeTour={start,stop};
})();
