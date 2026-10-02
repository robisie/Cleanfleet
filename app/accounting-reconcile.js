(function(root){
'use strict';
function norm(value){return String(value||'').replace(/ł/g,'l').replace(/Ł/g,'L').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function cents(value){const s=String(value??'').trim().replace(',','.');if(!/^-?\d+(\.\d{1,2})?$/.test(s))return null;const negative=s.startsWith('-'),[whole,fraction='']=s.replace(/^-/,'').split('.');const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return negative?-amount:amount;}
function account(value){const s=String(value||'').replace(/\s/g,'').toUpperCase().replace(/^PL/,'');return /^\d{26}$/.test(s)?s:'';}
function numberIn(text,number){const n=norm(number).trim();if(n.length<4 || !/\d/.test(n))return false;const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^A-Z0-9/_-])'+escaped+'($|[^A-Z0-9/_-])').test(norm(text));}
function party(value){return norm(value).replace(/[^A-Z0-9]+/g,' ').replace(/\b(SPOLKA|OGRANICZONA|ODPOWIEDZIALNOSCIA|SP|Z|OO|O|SA)\b/g,' ').replace(/\s+/g,' ').trim();}
function sameParty(a,b){const x=party(a),y=party(b);if(x.length<5||y.length<5)return false;if(x===y)return true;const xs=new Set(x.split(' ')),ys=new Set(y.split(' ')),common=[...xs].filter(t=>t.length>2&&ys.has(t));return common.length>=2 && common.length/Math.max(xs.size,ys.size)>=0.75;}
function money(amount){const n=BigInt(amount),v=n<0n?-n:n;return (n<0n?'-':'')+(v/100n).toString()+','+(v%100n).toString().padStart(2,'0');}
function reconcile({month,bankResults=[],purchases,history={snapshots:[],expected:[]},historyError=''}){
 const warnings=[],invoices=Array.isArray(purchases?.invoices)?purchases.invoices:[];
 if(!bankResults.length)warnings.push('Brak przekonwertowanego CSV mBanku — nie można sprawdzić płatności.');
 if(!purchases || purchases.month!==month)warnings.push('Nie pobrano faktur zakupowych KSeF za ten miesiąc.');
 else if(invoices.length!==purchases.count)warnings.push('Pobierz faktury KSeF ponownie — brakuje danych do porównania.');
 const validPurchases=purchases?.month===month && invoices.length===purchases.count;
 const snapshots=history.snapshots||[],coverage=snapshots.map(s=>s.month).sort(),missing=(history.expected||[]).filter(m=>m!==month&&!coverage.includes(m));
 if(historyError)warnings.push('Historia niedostępna: '+historyError+' Kontrola korzysta tylko z przygotowanego miesiąca.');
 if(missing.length)warnings.push('Brak zapisanej historii za: '+missing.join(', ')+'. Wybierz te miesiące i pobierz zakupy z KSeF, aby uzupełnić kontrolę.');
 const sources=[],seen=new Set();const addInvoices=(items,sourceMonth)=>{for(const invoice of items){const key=invoice.nrKSeF||JSON.stringify([invoice.nip,invoice.number,invoice.date,invoice.gross,invoice.currency]);if(!seen.has(key)){seen.add(key);sources.push({...invoice,sourceMonth});}}};
 if(validPurchases)addInvoices(invoices,month);
 for(const snapshot of snapshots)if((history.expected||[]).includes(snapshot.month)&&snapshot.month<=month&&!(validPurchases&&snapshot.month===month))addInvoices(snapshot.invoices,snapshot.month);
 const rows=[],paymentKeys=new Map();
 for(const bank of bankResults){
  const statement=bank.statement;
  if(!statement || bank.month!==month || !Array.isArray(statement.operations)){warnings.push('Brak danych operacji za wybrany miesiąc. Ponownie przekonwertuj CSV.');continue;}
  for(const [index,operation] of statement.operations.entries()){
   if(typeof operation.amount!=='bigint' || operation.amount>=0n)continue;
   const text=[operation.description,operation.title,operation.party].join(' '),agent=/\b(ALLEGRO|PAYU|PRZELEWY24|PAYPAL|STRIPE|TPAY|AUTOPAY|BLUE MEDIA)\b/.test(norm(text));
   const candidates=[];
   for(const [invoiceIndex,invoice] of sources.entries()){
    const amount=cents(invoice.gross),currency=String(invoice.currency||'').toUpperCase();
    const exact=amount!==null && amount>0n && -operation.amount===amount && currency===statement.currency;
    const reference=numberIn(operation.title,invoice.number) || numberIn(operation.title,invoice.nrKSeF);
    const iban=account(operation.counterAccount),bankMatch=Boolean(iban && (invoice.accounts||[]).some(value=>account(value)===iban));
    const name=sameParty(operation.party,invoice.seller);
    if(!exact&&!reference&&!bankMatch&&!name)continue;
    const reasons=[];if(invoice.sourceMonth!==month)reasons.push('faktura z '+invoice.sourceMonth+' — płatność w '+month);if(exact)reasons.push('zgodna kwota i waluta');if(reference)reasons.push('numer faktury w tytule');if(bankMatch)reasons.push('zgodny rachunek');if(name)reasons.push('zgodna nazwa sprzedawcy');
    const correction=/^KOR/.test(invoice.type||'');if(correction)reasons.push('faktura korygująca');
    if(!exact)reasons.push(currency!==statement.currency?'inna lub nieznana waluta':'inna kwota — możliwa rata, zaliczka lub płatność zbiorcza');
    const before=Boolean(invoice.date && operation.booked && invoice.date>operation.booked);if(before)reasons.push('płatność przed wystawieniem faktury');
    candidates.push({invoiceIndex,invoice,reasons,strong:exact&&(reference||bankMatch||name)&&!correction&&!before&&!agent,score:(reference?8:0)+(bankMatch?6:0)+(name?4:0)+(exact?3:0)});
   }
   candidates.sort((a,b)=>b.score-a.score);
   const strong=candidates.filter(c=>c.strong);let kind='review',reason='Nie znaleziono pasującej faktury KSeF.';
   if(strong.length===1 && candidates.filter(c=>c.score>=strong[0].score).length===1){kind='matched';reason=strong[0].reasons.join('; ');}
   else if(candidates.length){kind='uncertain';reason=candidates.length>1?'Kilka możliwych faktur — wybór wymaga sprawdzenia.':candidates[0].reasons.join('; ');}
   if(agent){kind='uncertain';reason='Płatność przez platformę lub operatora — sprzedawca na fakturze może być inny.';}
   if(!candidates.length && !agent){const t=norm(text);if(/PRZELEW WLASNY/.test(norm(operation.description))){kind='other';reason='Opis wskazuje przelew własny. Możesz oznaczyć go jako niewymagający faktury.';}else if(/\b(ZUS|URZAD SKARBOWY|PODATEK|PODATKU|WYNAGRODZENIE|WYNAGRODZENIA|PROWIZJA)\b/.test(t)||/OPLATA.*(RACHUNK|KONT|PRZELEW|KART)/.test(t)){kind='other';reason='Opis wskazuje np. podatek, ZUS, wynagrodzenie lub opłatę bankową. Sprawdź rodzaj wydatku.';}}
   const key=JSON.stringify([statement.account,statement.currency,operation.booked,operation.operated,operation.amount.toString(),operation.party,operation.title,operation.description,operation.counterAccount]),occurrence=(paymentKeys.get(key)||0)+1;paymentKeys.set(key,occurrence);
   rows.push({attachmentKey:key+'#'+occurrence,id:statement.account+':'+index,account:statement.account,currency:statement.currency,operation,kind,reason,candidates,matchedInvoice:kind==='matched'?strong[0].invoiceIndex:null});
  }
 }
 const assignments=new Map();for(const row of rows)if(row.kind==='matched'){const list=assignments.get(row.matchedInvoice)||[];list.push(row);assignments.set(row.matchedInvoice,list);}
 for(const list of assignments.values())if(list.length>1)for(const row of list){row.kind='uncertain';row.reason='Ta sama faktura pasuje do kilku płatności — sprawdź raty lub powtórzoną płatność.';row.matchedInvoice=null;}
 const matched=new Set(rows.filter(row=>row.kind==='matched').map(row=>row.matchedInvoice));
 const unmatchedInvoices=sources.filter((invoice,index)=>invoice.sourceMonth===month&&!matched.has(index));
 const counts={matched:0,uncertain:0,review:0,other:0};rows.forEach(row=>counts[row.kind]++);
 return {month,warnings:[...new Set(warnings)],rows,counts,unmatchedInvoices,coverage};
}
let pendingAttachments=0,pendingDecisions=0;
function attachmentKey(row){return row.attachmentKey || row.id;}
function attachmentFiles(store){const files=new Map();for(const entries of store.values())for(const item of entries)if(!files.has(item.hash))files.set(item.hash,item.file);return [...files.values()];}
async function attachFiles(store,row,files,isCurrent=()=>true){
 const added=[];if(files.length>20)throw new Error('Wybierz maksymalnie 20 PDF-ów jednocześnie.');
 for(const file of files){
  if((!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')||file.size<5||file.size>20*1024*1024)throw new Error(file.name+': wybierz PDF do 20 MB.');
  if(await file.slice(0,5).text()!=='%PDF-')throw new Error(file.name+': plik nie ma poprawnego nagłówka PDF.');
  const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');added.push({file,hash});
 }
 if(!isCurrent())throw new Error('Kontrola zmieniona. Dołącz PDF ponownie.');
 const next=new Map(store),key=attachmentKey(row),entries=[...(store.get(key)||[])];for(const item of added)if(!entries.some(old=>old.hash===item.hash))entries.push(item);next.set(key,entries);
 if(attachmentFiles(next).reduce((sum,file)=>sum+file.size,0)>100*1024*1024)throw new Error('Załączone faktury przekraczają łącznie 100 MB.');
 store.set(key,entries);if(entries.length)row.reviewStatus='outside_ksef';return entries.length;
}
function removeAttachment(store,row,hash){const key=attachmentKey(row),entries=(store.get(key)||[]).filter(item=>item.hash!==hash);if(entries.length)store.set(key,entries);else{store.delete(key);if(row.reviewStatus==='outside_ksef')row.reviewStatus='needs_document';}}
const ACTIONS={needs_document:'Do uzupełnienia',outside_ksef:'Dokument poza KSeF',no_invoice:'Nie wymaga faktury',checked:'Sprawdzone'};
function applyAction(result,ids,action){if(action!=='reset'&&!ACTIONS[action])throw new Error('Nieznana akcja.');const selected=new Set(ids);let count=0;for(const row of result.rows)if(selected.has(row.id)){delete row.manualInvoiceIndex;delete row.savedDecisionIssue;if(action==='reset')delete row.reviewStatus;else row.reviewStatus=action;count++;}return count;}
function attention(row){return row.reviewStatus==='needs_document'||(!row.reviewStatus&&['review','uncertain'].includes(row.kind));}
function recipient(row){const value=row.operation.party||row.operation.title||'Odbiorca niewskazany';return String(value).split(/\b(?:UL\.|ULICA|AL\.|RONDO|DATA TRANSAKCJI:)\s*/i)[0].replace(/SP[ÓO]ŁKA Z OGRANICZON[AĄ] ODPOWIEDZIALNO[ŚS]CI[AĄ]/gi,'sp. z o.o.').trim()||'Odbiorca niewskazany';}
function render(container,result,{attachments=new Map(),isCurrent=()=>true,onDecision=null}={}){
 container.replaceChildren();container.classList?.add('cf-accounting-review');
 const add=(parent,tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;parent.appendChild(node);return node;};
 const style=add(container,'style',`#cfAccountingReview{font-size:14px;font-weight:400;line-height:1.5;text-transform:none;letter-spacing:normal;color:#202a37}#cfAccountingReview *{box-sizing:border-box;text-transform:none!important;letter-spacing:normal}#cfAccountingReview h2{font-size:22px;line-height:1.25;margin:0 0 8px;font-weight:700}#cfAccountingReview p{margin:5px 0 10px;font-weight:400}#cfAccountingReview button,#cfAccountingReview select,#cfAccountingReview input[type=search]{min-height:42px;border:1px solid #d4dbe4;border-radius:9px;padding:9px 12px;background:#fff;color:#202a37;font-size:14px;max-width:100%}#cfAccountingReview button{cursor:pointer}#cfAccountingReview button:disabled{opacity:.45;cursor:default}#cfAccountingReview button.cr-primary{background:#123e59;color:white;border-color:#123e59}#cfAccountingReview .cr-tiles{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}#cfAccountingReview .cr-tile{background:#f1f5f9;border-radius:10px;padding:10px 14px;flex:1;min-width:130px}#cfAccountingReview .cr-tile strong{display:block;font-size:22px}#cfAccountingReview .cr-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:12px 0}#cfAccountingReview .cr-field{display:grid;gap:4px;flex:1;min-width:150px}#cfAccountingReview .cr-selection{background:#edf4f8;padding:12px;border-radius:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}#cfAccountingReview .cr-list{display:grid;gap:10px}#cfAccountingReview .cr-row{border:1px solid #dce2e9;border-radius:12px;background:#fff;padding:10px 12px}#cfAccountingReview .cr-row-head{display:grid;grid-template-columns:32px 88px minmax(0,1fr) 115px 145px;gap:10px;align-items:center}#cfAccountingReview .cr-check{display:flex;align-items:center;justify-content:center;min-height:42px;cursor:pointer}#cfAccountingReview input[type=checkbox]{width:20px;height:20px;margin:0;accent-color:#123e59}#cfAccountingReview .cr-date{font-size:13px;color:#526070}#cfAccountingReview .cr-name{font-weight:600;overflow-wrap:anywhere;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}#cfAccountingReview .cr-amount{text-align:right;white-space:nowrap;font-weight:700;font-variant-numeric:tabular-nums}#cfAccountingReview .cr-badge{font-size:12px;font-weight:600;border-radius:7px;padding:5px 8px;background:#eef1f5;overflow-wrap:anywhere}#cfAccountingReview .cr-badge.cr-ok{background:#e8f5ed;color:#21633d}#cfAccountingReview .cr-badge.cr-warn{background:#fff2dc;color:#885500}#cfAccountingReview .cr-details{margin:6px 0 0 42px;font-size:13px}#cfAccountingReview summary{cursor:pointer;padding:7px 0;font-weight:500}#cfAccountingReview .cr-details p{overflow-wrap:anywhere;margin:5px 0}#cfAccountingReview .cr-note{font-size:12px;color:#526070}#cfAccountingReview .cr-warning{padding:10px;background:#fff2dc;border-radius:8px}#cfAccountingReview .cr-empty{padding:22px;text-align:center;background:#f5f7fa;border-radius:10px}@media(max-width:700px){#cfAccountingReview .cr-row-head{grid-template-columns:32px minmax(0,1fr) auto;gap:5px 8px}#cfAccountingReview .cr-check{grid-column:1;grid-row:1/span 3}#cfAccountingReview .cr-date{grid-column:2;grid-row:1}#cfAccountingReview .cr-name{grid-column:2;grid-row:2}#cfAccountingReview .cr-amount{grid-column:3;grid-row:2;font-size:14px}#cfAccountingReview .cr-badge{grid-column:2/span 2;grid-row:3;justify-self:start}#cfAccountingReview .cr-details{margin-left:40px}#cfAccountingReview .cr-selection>select{flex:1;min-width:180px}#cfAccountingReview .cr-selection>button{flex:1}#cfAccountingReview .cr-tile{min-width:100px;padding:9px}}`);
 add(container,'h2','Kontrola płatności i faktur');add(container,'p','Miesiąc '+result.month+' · wydatki mBanku i faktury zakupowe KSeF. Zaznacz pozycje i wybierz, co chcesz z nimi zrobić.');
 const help=add(container,'details',undefined,'cr-note');add(help,'summary','Jak działa kontrola?');add(help,'p','Porównujemy płatności miesiąca z zakupami KSeF z tego miesiąca i zapisaną historią trzech poprzednich. Starsze faktury służą tylko do kontroli i nie są ponownie dodawane do ZIP. PDF-y i załączniki poczty nie są analizowane. Brak dopasowania nie przesądza o braku faktury.');add(help,'p','Oznaczenia dotyczą kontroli. Dołączone PDF-y trafią do faktur zakupowych. Pliki pozostają w pamięci do zmiany miesiąca, wylogowania lub odświeżenia strony. Limit: 20 MB na PDF i 100 MB łącznie. Paczka zachowuje wszystkie przygotowane dokumenty.');
 add(container,'p','Zapisana historia w tym porównaniu: '+((result.coverage||[]).join(', ')||'brak')+'.','cr-note');result.warnings.forEach(text=>add(container,'p',text,'cr-warning'));
 const tiles=add(container,'div',undefined,'cr-tiles'),counts=[];for(const label of ['Operacje','Wymagające uwagi','Twoje oznaczenia']){const tile=add(tiles,'div',undefined,'cr-tile');counts.push(add(tile,'strong','0'));add(tile,'span',label);}
 const toolbar=add(container,'div',undefined,'cr-toolbar');const field=(label)=>{const box=add(toolbar,'label',label,'cr-field');return box;};
 const filter=add(field('Pokaż'),'select');filter.setAttribute('aria-label','Filtr operacji');for(const [value,label] of [['attention','Wymagające uwagi'],['all','Wszystkie operacje'],['review','Bez dopasowania'],['uncertain','Niepewne dopasowania'],['matched','Dopasowane'],['other','Pozostałe operacje'],['marked','Oznaczone przeze mnie'],['attachments','Z dołączonym PDF']]){const option=add(filter,'option',label);option.value=value;}filter.value='attention';
 const search=add(field('Szukaj odbiorcy, opisu lub kwoty'),'input');search.type='search';search.placeholder='np. Lidl, PZU, 29,99';
 const bulk=add(container,'div',undefined,'cr-selection');const selectVisible=add(bulk,'button','Zaznacz widoczne');selectVisible.type='button';const clear=add(bulk,'button','Odznacz');clear.type='button';const selectedCount=add(bulk,'span','Zaznaczono: 0');selectedCount.setAttribute('aria-live','polite');
 const action=add(bulk,'select');action.setAttribute('aria-label','Akcja dla zaznaczonych operacji');const prompt=add(action,'option','Wybierz akcję…');prompt.value='';for(const [value,label] of Object.entries({...ACTIONS,reset:'Cofnij oznaczenie'})){const option=add(action,'option',label);option.value=value;}action.value='';
 const apply=add(bulk,'button','Wykonaj','cr-primary');apply.type='button';const notice=add(container,'p','','cr-note');notice.setAttribute('role','status');
 const uploaded=add(container,'details',undefined,'cr-note'),uploadedSummary=add(uploaded,'summary','Załączone faktury zakupowe: 0'),uploadedList=add(uploaded,'div');
 const list=add(container,'div',undefined,'cr-list');const selected=new Set();let visible=[],saving=false;
 const labels={review:'Do sprawdzenia',uncertain:'Niepewne',matched:'Dopasowane',other:'Pozostała operacja'};
 function updateSelection(){selectedCount.textContent='Zaznaczono: '+selected.size;apply.disabled=saving||!selected.size||!action.value;clear.disabled=saving||!selected.size;selectVisible.disabled=saving||!visible.length;action.disabled=saving;}
 function decide(ids,chosenAction,candidate=null,clearSelection=false){
  if(saving||!isCurrent())return;
  if(pendingAttachments){notice.textContent='Poczekaj na zakończenie dołączania PDF, następnie wykonaj akcję.';return;}
  const commit=()=>{
   if(!isCurrent())return;
   const applied=applyAction(result,ids,chosenAction);
   if(candidate){const row=result.rows.find(row=>row.id===ids[0]);row.manualInvoiceIndex=candidate.invoiceIndex;}
   notice.textContent=(onDecision?'Zapisano na koncie: ':'Zmieniono: ')+applied+' '+(applied===1?'pozycję':'pozycji')+' · '+(candidate?'powiązanie z fakturą '+candidate.invoice.number:chosenAction==='reset'?'cofnięto oznaczenie':ACTIONS[chosenAction])+'.';
   if(clearSelection){selected.clear();action.value='';}refresh();
  };
  if(!onDecision){commit();return;}
  saving=true;pendingDecisions++;list.inert=true;notice.textContent='Zapisywanie decyzji na koncie…';updateSelection();
  return Promise.resolve().then(()=>onDecision(ids,chosenAction,candidate?.invoice||null)).then(commit).catch(error=>{if(isCurrent())notice.textContent='Nie zapisano zmian. '+error.message+' Poprzednie oznaczenia zostały zachowane.';}).finally(()=>{saving=false;pendingDecisions--;list.inert=false;if(isCurrent())updateSelection();});
 }
 function refresh(){invoices.replaceChildren();const unpaid=result.unmatchedInvoices.filter(i=>!result.rows.some(row=>row.manualInvoiceIndex!==undefined&&row.candidates.some(c=>c.invoiceIndex===row.manualInvoiceIndex&&c.invoice===i)));add(invoices,'summary','Faktury bieżącego miesiąca bez dopasowanej płatności: '+unpaid.length+' — mogą być opłacone później');for(const i of unpaid)add(invoices,'p',(i.number||i.nrKSeF||'bez numeru')+' · '+(i.seller||'')+' · '+(i.gross??'brak kwoty')+' '+(i.currency||'')+' · '+(i.date||''));
  for(const row of result.rows)if((attachments.get(attachmentKey(row))||[]).length&&!row.reviewStatus)row.reviewStatus='outside_ksef';
  const attached=attachmentFiles(attachments);uploadedSummary.textContent='Załączone faktury zakupowe: '+attached.length;uploadedList.replaceChildren();
  for(const file of attached){const box=add(uploadedList,'div');box.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0;overflow-wrap:anywhere';add(box,'span',file.name);const remove=add(box,'button','Usuń plik z paczki');remove.type='button';remove.addEventListener('click',()=>{const hash=[...attachments.values()].flat().find(item=>item.file===file)?.hash,affected=new Set();for(const [key,items] of [...attachments]){const remaining=items.filter(item=>item.hash!==hash);if(remaining.length!==items.length)affected.add(key);if(remaining.length)attachments.set(key,remaining);else attachments.delete(key);}for(const row of result.rows)if(affected.has(attachmentKey(row))&&!(attachments.get(attachmentKey(row))||[]).length&&row.reviewStatus==='outside_ksef')row.reviewStatus='needs_document';refresh();});}
  counts[0].textContent=String(result.rows.length);counts[1].textContent=String(result.rows.filter(attention).length);counts[2].textContent=String(result.rows.filter(row=>row.reviewStatus).length);
  const query=norm(search.value).trim();visible=result.rows.filter(row=>{const kind=filter.value;const include=kind==='all'||kind==='attention'&&attention(row)||kind==='marked'&&Boolean(row.reviewStatus)||kind==='attachments'&&Boolean(attachments.get(attachmentKey(row))?.length)||row.kind===kind;const haystack=norm([row.operation.party,row.operation.title,row.operation.description,row.operation.booked,money(-row.operation.amount),row.reason,ACTIONS[row.reviewStatus]].join(' '));return include&&(!query||haystack.includes(query));});
  list.replaceChildren();if(!visible.length)add(list,'p','Brak pozycji w tym widoku. Zmień filtr, aby zobaczyć pozostałe operacje.','cr-empty');
  for(const row of visible){
   const card=add(list,'article',undefined,'cr-row'),head=add(card,'div',undefined,'cr-row-head'),label=add(head,'label',undefined,'cr-check'),check=add(label,'input');check.type='checkbox';check.checked=selected.has(row.id);check.dataset.reviewId=row.id;check.setAttribute('aria-label','Zaznacz '+row.operation.booked+' '+recipient(row)+' '+money(-row.operation.amount));
   check.addEventListener('change',()=>{if(check.checked)selected.add(row.id);else selected.delete(row.id);updateSelection();});
   add(head,'span',row.operation.booked,'cr-date');add(head,'span',recipient(row),'cr-name');add(head,'span',money(-row.operation.amount)+' '+row.currency,'cr-amount');
   const rowFiles=attachments.get(attachmentKey(row))||[];const chosen=row.candidates.find(c=>c.invoiceIndex===row.manualInvoiceIndex),automatic=row.kind==='matched'?row.candidates.find(c=>c.invoiceIndex===row.matchedInvoice):null;const status=rowFiles.length?'PDF dołączony':chosen?'Wybrana faktura '+chosen.invoice.sourceMonth:row.reviewStatus?ACTIONS[row.reviewStatus]:automatic&&automatic.invoice.sourceMonth!==result.month?'Faktura '+automatic.invoice.sourceMonth:labels[row.kind];const color=row.reviewStatus==='needs_document'||!row.reviewStatus&&row.kind==='uncertain'?'cr-warn':row.reviewStatus||row.kind==='matched'?'cr-ok':'';add(head,'span',status,'cr-badge '+color);
   const fileBox=add(card,'div');fileBox.style.cssText='margin:8px 0 0 42px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;overflow-wrap:anywhere';
   const upload=add(fileBox,'button','Załącz fakturę PDF');upload.type='button';const input=add(fileBox,'input');input.type='file';input.accept='.pdf,application/pdf';input.multiple=true;input.hidden=true;input.setAttribute('aria-label','Załącz PDF do płatności '+recipient(row));upload.addEventListener('click',()=>input.click());
   input.addEventListener('change',async()=>{const files=Array.from(input.files||[]);if(!files.length)return;pendingAttachments++;upload.disabled=true;try{await attachFiles(attachments,row,files,isCurrent);notice.textContent='Dołączono PDF do płatności. Plik trafi do folderu faktury zakupowe. Znajdziesz go w widoku Z dołączonym PDF.';refresh();}catch(error){notice.textContent=error.message;}finally{pendingAttachments--;upload.disabled=false;input.value='';}});
   for(const item of rowFiles){const line=add(fileBox,'span',item.file.name+' · '+Math.ceil(item.file.size/1024)+' KB');const remove=add(fileBox,'button','Usuń PDF');remove.type='button';remove.setAttribute('aria-label','Usuń '+item.file.name+' z tej płatności');remove.addEventListener('click',()=>{removeAttachment(attachments,row,item.hash);refresh();});}
   const details=add(card,'details',undefined,'cr-details');add(details,'summary','Szczegóły płatności i dopasowania');add(details,'p','Odbiorca: '+(row.operation.party||'niewskazany'));add(details,'p',[row.operation.description,row.operation.title].filter(Boolean).join(' — '));add(details,'p','Rachunek płatnika: …'+String(row.account).slice(-8));add(details,'p','Wynik automatyczny: '+labels[row.kind]+'. '+row.reason);
   if(row.reviewStatus)add(details,'p','Twoja decyzja: '+ACTIONS[row.reviewStatus]);if(row.savedDecisionIssue)add(details,'p',row.savedDecisionIssue,'cr-warning');
   for(const candidate of row.candidates.slice(0,5)){const i=candidate.invoice;add(details,'p','Faktura '+(i.number||i.nrKSeF||'bez numeru')+' · '+(i.seller||'')+' · '+(i.gross??'brak kwoty')+' '+(i.currency||'')+' · '+(i.date||'')+' · miesiąc '+(i.sourceMonth||i.date?.slice(0,7)||result.month)+' — '+candidate.reasons.join('; '));const choose=add(details,'button','Powiąż tę fakturę');choose.type='button';choose.addEventListener('click',()=>decide([row.id],'checked',candidate));}
   if(row.candidates.length>5)add(details,'p','Możliwych faktur: '+row.candidates.length+'. Pokazano pierwsze 5.');
  }
  updateSelection();
 }
 filter.addEventListener('change',()=>{selected.clear();refresh();});search.addEventListener('input',()=>{selected.clear();refresh();});action.addEventListener('change',updateSelection);
 selectVisible.addEventListener('click',()=>{visible.forEach(row=>selected.add(row.id));refresh();});clear.addEventListener('click',()=>{selected.clear();refresh();});
 apply.addEventListener('click',()=>decide([...selected],action.value,null,true));
 const invoices=add(container,'details',undefined,'cr-note');
 refresh();
}

const api={reconcile,render,applyAction,attachFiles,attachmentFiles,removeAttachment,isBusy:()=>pendingAttachments>0||pendingDecisions>0,cents,money,numberIn};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFAccountingReconcile=api;
})(typeof window==='object'?window:globalThis);
