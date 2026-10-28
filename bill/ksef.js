import {openKsefProgress} from './ksef-progress.js?v=1.0.44';
import {costCorrectionDialog} from './cost-correction.js?v=1.0.38';
import {relatedGroups,historyRanges,isCorrection,decodeXml} from './ksef-relations.js?v=1.0.38';
import {stockMarkup,stockStores,stockSummaryMarkup,returnDialog,useDialog,invoiceDestinationDialog} from './stock.js?v=1.0.43';
import {selectedAmount,duplicatePurchases,allocationMarkup,mountAllocation,savedEntries} from './purchase-import.js?v=1.0.38';
import {esc,today} from './core.js?v=1.0.38';
import {openReceiptImport} from './receipt-import.js?v=1.0.42';
import {monthDates,counterparty,visibleInvoices,mergeInvoices,bytesFromBase64,digest,verifyInvoice} from './ksef-data.js?v=1.0.38';
import {hint,remember} from './cost-suggestions.js?v=1.0.38';
import {wholeInvoiceFree,similarInvoiceCandidates,supplierSuggestionDialog} from './stock-suggestions.js?v=1.0.38';
const e=esc;
let integration={},assignments=[],cfLinks=[],documents=[],stockRows=[],historySyncedAt=0;
const invoice=number=>state.rows.find(r=>r.ksefNumber===number)||documents.find(d=>d.metadata.ksefNumber===number)?.metadata;
function initial(){const month=today().slice(0,7);return {month,...monthDates(month),kind:'purchases',dateType:'Issue',sort:'Desc',q:'',stockSearch:'',stockStore:'',stockStatus:'available',stockSummary:false,rows:[],selected:new Set(),loaded:false,hasMore:false,isTruncated:false,page:0,ticket:'',ticketAt:0,query:null,listError:false,partial:false,partialWarning:''};}
let state=initial(),root=null,api=null,controller=null,message='',ready=null,cache=null;
const scripts=new Map(),singles=new Map();let singleSize=0;
function script(src,test){if(test())return Promise.resolve();if(!scripts.has(src))scripts.set(src,new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=()=>test()?resolve():reject(Error('Brak generatora pliku.'));tag.onerror=()=>reject(Error('Nie udało się załadować generatora. Odśwież stronę.'));document.head.append(tag);}).catch(error=>{scripts.delete(src);throw error;}));return scripts.get(src);}
async function zipLib(){await script('/app/vendor/jszip-3.10.1.min.js',()=>!!window.JSZip);return window.JSZip;}
const check=signal=>{if(signal.aborted)throw new DOMException('Anulowano','AbortError');};
let progressPopup=null;
function progress(text){message=text;progressPopup?.update(text);const node=root?.querySelector('#kf-status');if(node)node.textContent=text;}
function clearReady(){if(ready)URL.revokeObjectURL(ready.url);ready=null;}
export function view(){return '<div id="ksef-panel"></div>';}
export function unmount(){controller?.abort();controller=null;progressPopup?.close();progressPopup=null;root=null;}
export function reset(){unmount();clearReady();cache=null;singles.clear();singleSize=0;state=initial();message='';assignments=[];cfLinks=[];integration={};documents=[];stockRows=[];historySyncedAt=0;}
export function mount(node,call,options={}){root=node;api=call;integration=options;state.stock=false;draw();if(!controller)void run(load);}
export function mountStock(node,call,options={}){root=node;api=call;integration={...options,stockOnly:true};state.stock=true;state.kind='purchases';draw();if(!controller)void run(loadStock);}
function stockOptions(){return {blocked:state.stockCorrectionsIncomplete,incomplete:state.stockComplete===false||!!state.stockErrors?.length,store:state.stockStore,status:state.stockStatus};}
function updateStockResults(){const node=root?.querySelector('#kf-stock-results');if(node)node.innerHTML=stockMarkup(stockRows,state.stockSearch,stockOptions());}
function buttons(){return `<button type="button" data-kf="zip" class="primary" ${!state.selected.size?'disabled':''}>PDF zaznaczonych (${state.selected.size}) · ZIP</button><button type="button" data-kf="clear" ${!state.selected.size?'disabled':''}>Odznacz</button>`;}
function rowsHtml(){const settlement=state.kind==='purchases'&&state.purchaseTarget?`<p class="notice">Zakup jest przypisany do inwestycji. <a class="button primary" href="/app/robisie/?project=${encodeURIComponent(state.purchaseTarget.project)}&amp;purchaseKsef=${encodeURIComponent(state.purchaseTarget.number)}" target="_blank" rel="noopener">Rozlicz zakup w Robisię</a></p>`:'';const rows=visibleInvoices(state.rows,state),groups=state.kind==='purchases'?relatedGroups(state.rows,documents,state):rows.map(anchor=>({anchor,children:[]})),display=groups.flatMap(g=>[g.anchor,...g.children.map(row=>({...row,related:true}))]),selected=rows.length&&rows.every(r=>state.selected.has(r.ksefNumber));return `${settlement}<div class="kf-selection"><label><input type="checkbox" id="kf-all" ${selected?'checked':''} ${!rows.length?'disabled':''}> Zaznacz widoczne (${rows.length})</label><span>${state.selected.size} zaznaczonych</span></div><div class="kf-list">${display.map(row=>{const p=counterparty(row,state.kind);return `<article class="kf-invoice ${row.related?'kf-related':''}"><label class="kf-check"><input type="checkbox" data-kf-number="${e(row.ksefNumber)}" ${state.selected.has(row.ksefNumber)?'checked':''} aria-label="Zaznacz fakturę ${e(row.invoiceNumber)}"></label><button type="button" class="kf-open" data-kf="preview" data-number="${e(row.ksefNumber)}"><strong>${e(row.invoiceNumber)}</strong><span>${e(p.name)}</span><small>${e(p.id)} · wystawiono ${e(row.issueDate)}${isCorrection(row)?' · Korekta':''}${row.outsidePeriod?' · Poza wybranym okresem':''}</small><small class="status-number">${e(row.ksefNumber)}</small>${(documents.find(d=>d.metadata.ksefNumber===row.ksefNumber)?.references||[]).map(ref=>`<small>Dotyczy: ${e(ref.number||ref.ksefNumber)} · ${e(ref.issueDate)}</small>`).join('')}${row.billId?'<small>Źródło: Bill · przyjęta w KSeF</small>':''}</button><div class="kf-value"><strong>${e(new Intl.NumberFormat('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}).format(row.grossAmount))} ${e(row.currency)}</strong><button type="button" data-kf="preview" data-number="${e(row.ksefNumber)}">Podgląd PDF</button>${state.kind==='sales'?`<button type="button" data-kf="demand" data-number="${e(row.ksefNumber)}">Wezwanie do zapłaty</button>`:''}${state.kind==='purchases'&&integration.cfSave?`<details class="kf-cost-menu"><summary>Dodaj do kosztów ▾</summary><button type="button" data-kf="assign-cf" data-number="${e(row.ksefNumber)}">CleanFleet${cfLinks.some(x=>x.source_ksef_number===row.ksefNumber)?' · Edytuj przypisanie':''}</button><button type="button" data-kf="assign" data-number="${e(row.ksefNumber)}">Robisię · Podziel / edytuj</button></details>`:integration.assign?`<button type="button" data-kf="assign" data-number="${e(row.ksefNumber)}">${assignments.some(x=>x.ksef_number===row.ksefNumber)?(state.kind==='purchases'?'Edytuj przypisanie':'Przypisana do inwestycji'):'Przypisz do inwestycji'}</button>`:''}</div></article>`;}).join('')||`<div class="empty">${state.loaded?'Brak faktur pasujących do wybranego zakresu i wyszukiwania.':'Wybierz okres i pobierz listę z KSeF.'}</div>`}</div>${state.hasMore?'<button type="button" data-kf="more">Wczytaj kolejne 250 faktur</button>':''}${state.isTruncated?'<p class="notice">KSeF osiągnął limit wyników. Zawęź zakres dat, aby otrzymać pełną listę.</p>':''}`;}
function draw(){if(!root)return;const busy=!!controller;root.innerHTML=`${integration.stockOnly?'':`<div class="kf-tabs"><button type="button" data-kf="kind" data-kind="sales" class="${state.kind==='sales'?'primary':''}" aria-pressed="${state.kind==='sales'}">Wystawione / sprzedażowe</button><button type="button" data-kf="kind" data-kind="purchases" class="${state.kind==='purchases'&&!state.stock?'primary':''}" aria-pressed="${state.kind==='purchases'&&!state.stock}">Zakupowe</button></div>`}${state.stock?`<div class="card"><div class="actions"><button type="button" data-kf="stock-refresh">Odśwież Magazyn</button><button type="button" data-kf="receipt-import" class="primary">+ Dodaj paragon z NIP-em</button><button type="button" data-kf="stock-summary" aria-expanded="${!!state.stockSummary}">Podsumowanie</button><button type="button" data-kf="cancel" ${!busy?'hidden':''}>Anuluj</button></div>${state.stockSummary?stockSummaryMarkup(stockRows,{incomplete:stockOptions().incomplete}):''}<div class="kf-stock-filters"><label class="field">Szukaj towaru lub faktury<input id="kf-stock-search" type="search" value="${e(state.stockSearch)}"></label><label class="field">Sklep<select id="kf-stock-store"><option value="">Wszystkie sklepy</option>${stockStores(stockRows).map(([key,name])=>`<option value="${e(key)}" ${state.stockStore===key?'selected':''}>${e(name)} · ${e(key)}</option>`).join('')}</select></label><label class="field">Status<select id="kf-stock-status"><option value="available" ${state.stockStatus==='available'?'selected':''}>Na stanie</option><option value="returned" ${state.stockStatus==='returned'?'selected':''}>Oddano</option></select></label></div><p id="kf-status" role="status" aria-live="polite">${e(message)}</p>${state.relationsWarning?`<p class="notice">${e(state.relationsWarning)}</p>`:''}${state.stockCorrectionsIncomplete?'<p class="notice">Nie odczytano wszystkich korekt. Przypisania i zwroty będą dostępne po sprawdzeniu pełnego stanu.</p>':''}${state.stockErrors?.length?`<details class="notice"><summary>Problemy z dokumentami (${state.stockErrors.length})</summary>${state.stockErrors.map(x=>`<p><strong>${e(x.number)}</strong>: ${e(x.message)}</p>`).join('')}</details>`:''}<div id="kf-stock-results">${stockMarkup(stockRows,state.stockSearch,stockOptions())}</div></div>`:`<div class="card"><form id="kf-form" class="grid"><label class="field">Miesiąc<input id="kf-month" type="month" value="${e(state.month)}"></label><label class="field">Według daty<select id="kf-date-type">${[['Issue','Wystawienia'],['Invoicing','Przyjęcia w KSeF'],['PermanentStorage','Zapisu w KSeF']].map(([v,t])=>`<option value="${v}" ${v===state.dateType?'selected':''}>${t}</option>`).join('')}</select></label><label class="field">Od<input id="kf-from" type="date" required value="${e(state.from)}"></label><label class="field">Do<input id="kf-to" type="date" required value="${e(state.to)}"></label><div class="wide"><button class="primary">${state.loaded?'Odśwież z KSeF':'Pobierz z KSeF'}</button></div></form><p class="muted">Zakres własny: do 99 dni. Miesiąc ustawia obie daty. Dokumenty pochodzą z produkcyjnego KSeF spółki Robisię-Fer.</p>${state.kind==='sales'?'<p class="muted">Przy filtrowaniu według daty wystawienia pokazujemy też dokumenty z Bill z potwierdzonym przyjęciem w KSeF. Są oznaczone osobną etykietą źródła.</p>':''}</div><div class="card"><div class="grid"><label class="field">Szukaj we wczytanych fakturach<input id="kf-search" type="search" placeholder="Kontrahent, NIP, numer faktury lub KSeF" value="${e(state.q)}"></label><label class="field">Sortowanie<select id="kf-sort">${[['Desc','Najnowsze'],['Asc','Najstarsze'],['party','Kontrahent A–Z'],['amount','Kwota malejąco, osobno waluty']].map(([v,t])=>`<option value="${v}" ${state.sort===v?'selected':''}>${t}</option>`).join('')}</select></label></div><p class="muted">${state.loaded?`Wczytano ${state.rows.length} faktur${state.hasMore?' · dostępne są kolejne strony':''}. Kwoty brutto.`:'Lista nie została jeszcze pobrana.'}</p><div class="actions kf-downloads">${buttons()}<button type="button" data-kf="cancel" ${!busy?'hidden':''}>Anuluj</button></div><p id="kf-status" role="status" aria-live="polite">${e(message)}</p>${state.relationsWarning?`<p class="notice">${e(state.relationsWarning)} <button type="button" data-kf="relations-retry">Ponów sprawdzanie powiązań</button></p>`:''}${ready?`<a class="button primary" download="${e(ready.name)}" href="${e(ready.url)}">Zapisz paczkę ZIP (${ready.count} PDF)</a>`:''}${state.partial?`<p class="notice">${e(state.partialWarning)}</p><button type="button" data-kf="retry">Odśwież pełną listę z KSeF</button>`:''}${state.listError&&!busy?'<p class="notice">Nie udało się odświeżyć listy. To nie oznacza braku faktur w KSeF. Wcześniej wczytane wyniki, jeśli są widoczne, mogą być nieaktualne.</p><button type="button" data-kf="retry">Ponów pobieranie listy</button>':''}<div id="kf-results">${rowsHtml()}</div></div>`}`;
 root.onclick=event=>{const b=event.target.closest('[data-kf]');if(!b)return;event.stopPropagation();const action=b.dataset.kf;if(action==='cancel'){controller?.abort();return;}if(controller)return;if(action==='receipt-import')void run(async signal=>{const number=await openReceiptImport({scan:integration.scanReceipt,save:integration.saveReceipt,signal});if(number){stockRows=await integration.stock();progress('Paragon został dodany do magazynu. Sprawdź pozycje i przypisania.');}});if(action==='receipt-assign')void run(signal=>assignReceiptProject(b.dataset.number,Number(b.dataset.index),signal));if(action==='receipt-invoice-assign')void run(signal=>assignReceiptInvoice(b.dataset.number,signal));if(action==='stock-summary'){state.stockSummary=!state.stockSummary;draw();return;}if(action==='kind'){if(b.dataset.kind===state.kind&&!state.stock)return;state.stock=false;state.kind=b.dataset.kind;invalidate();draw();void run(load);}if(action==='stock'||action==='stock-refresh'){if(action==='stock-refresh')historySyncedAt=0;state.stock=true;state.kind='purchases';void run(loadStock);}if(action==='relations-retry'){historySyncedAt=0;void run(syncHistory);}if(action==='stock-return'||action==='stock-undo')void run(signal=>returnStock(b.dataset.number,Number(b.dataset.index),action==='stock-undo',signal));if(action==='stock-assign'){state.stockIndex=Number(b.dataset.index);void run(signal=>assignInvestment(b.dataset.number,signal).then(async()=>{stockRows=await integration.stock();}));}if(action==='stock-cleanfleet'){state.stockIndex=Number(b.dataset.index);void run(signal=>assignCleanfleet(b.dataset.number,signal).then(async()=>{stockRows=await integration.stock();}));}if(action==='stock-invoice-assign')void run(signal=>assignWholeInvoice(b.dataset.number,signal));if(action==='stock-use'||action==='receipt-cleanfleet')void run(signal=>classifyStock(b.dataset.number,Number(b.dataset.index),action==='receipt-cleanfleet'?'cleanfleet':b.dataset.category,signal));if(action==='retry')void run(load);if(action==='more')void run(signal=>load(signal,true),true);if(action==='clear'){state.selected.clear();draw();}if(action==='zip')void run(downloadSelected);if(action==='assign-cf')void run(signal=>assignCleanfleet(b.dataset.number,signal));if(action==='assign')void run(signal=>assignInvestment(b.dataset.number,signal));if(action==='preview')void run(signal=>preview(b.dataset.number,signal));if(action==='demand')void run(signal=>paymentDemand(b.dataset.number,signal));};
 root.onsubmit=event=>{event.preventDefault();event.stopPropagation();if(controller)return;state.month=root.querySelector('#kf-month').value;state.from=root.querySelector('#kf-from').value;state.to=root.querySelector('#kf-to').value;state.dateType=root.querySelector('#kf-date-type').value;if(!state.query||['kind','from','to','dateType'].some(key=>state.query[key]!==state[key]))invalidate();void run(load);};
 root.oninput=event=>{if(event.target.id==='kf-stock-search'){state.stockSearch=event.target.value;updateStockResults();}if(event.target.id==='kf-search'){state.q=event.target.value;root.querySelector('#kf-results').innerHTML=rowsHtml();}};
 root.onchange=event=>{const t=event.target;if(t.id==='kf-month'&&t.value){state.month=t.value;Object.assign(state,monthDates(t.value));invalidate();draw();}if(['kf-from','kf-to','kf-date-type'].includes(t.id)){state[{'kf-from':'from','kf-to':'to','kf-date-type':'dateType'}[t.id]]=t.value;if(t.id!=='kf-date-type')state.month='';invalidate();draw();}if(t.id==='kf-stock-store'||t.id==='kf-stock-status'){state[t.id==='kf-stock-store'?'stockStore':'stockStatus']=t.value;updateStockResults();}if(t.id==='kf-sort'){state.sort=t.value;draw();}if(t.id==='kf-all'){const rows=visibleInvoices(state.rows,state);if(t.checked&&new Set([...state.selected,...rows.map(r=>r.ksefNumber)]).size>250){progress('W jednej paczce można pobrać do 250 PDF-ów. Zawęź wyszukiwanie.');t.checked=false;return;}for(const r of rows)t.checked?state.selected.add(r.ksefNumber):state.selected.delete(r.ksefNumber);draw();}if(t.dataset.kfNumber){if(t.checked&&state.selected.size>=250){t.checked=false;progress('W jednej paczce można pobrać do 250 PDF-ów.');return;}t.checked?state.selected.add(t.dataset.kfNumber):state.selected.delete(t.dataset.kfNumber);draw();}};
 if(busy)for(const node of root.querySelectorAll('button,input,select'))if(node.dataset.kf!=='cancel')node.disabled=true;
}
function invalidate(){state.rows=[];state.selected.clear();state.loaded=false;state.hasMore=false;state.isTruncated=false;state.page=0;state.query=null;state.listError=false;state.partial=false;state.partialWarning='';cache=null;clearReady();}
async function run(fn,popup=false){if(controller)return;const own=new AbortController();controller=own;draw();const overlay=!integration.stockOnly&&(popup||[load,syncHistory,downloadSelected].includes(fn))?openKsefProgress(()=>own.abort()):null;if(overlay)progressPopup=overlay;try{await fn(own.signal);}catch(error){if(controller!==own)return;if(own.signal.aborted)progress('Anulowano. Możesz ponowić operację.');else progress(error.message||'Nie udało się pobrać faktur.');}finally{overlay?.close();if(progressPopup===overlay)progressPopup=null;if(controller===own){controller=null;draw();}}}
function ticket(){return state.ticket&&Date.now()-state.ticketAt<9*60000?{ticket:state.ticket}:{};}
async function historyPage(from,to,signal,dateType='PermanentStorage'){
 for(let page=0;page<40;page++){
  const result=await api({action:'ksef-list',kind:'purchases',from,to,dateType,sort:'Asc',page,...ticket()},{signal});check(signal);
  if(result.partial||result.isTruncated)throw Error('KSeF zwrócił niepełną historię. Spróbuj ponownie lub zawęź okres.');
  state.ticket=result.ticket;state.ticketAt=Date.now();await integration.storeMetadata(result.invoices);
  if(!result.hasMore)return;
 }
 throw Error('Historia faktur przekracza limit stron. Nie potwierdzono wszystkich korekt.');
}
async function syncHistory(signal){
 if(!integration.index)return;
 state.relationsWarning='';documents=await integration.index();check(signal);
 if(Date.now()-historySyncedAt<5*60000)return;
 // Scan receipt dates across the history, independent of the currently selected issue month.
 const end=today(),start=state.from<'2026-01-01'?state.from:'2026-01-01';
 for(const range of historyRanges(start,end)){progress('Sprawdzanie korekt ze wszystkich miesięcy: '+range.from+' – '+range.to+'…');await historyPage(range.from,range.to,signal);}
 documents=await integration.index();
 const pending=documents.filter(d=>isCorrection(d.metadata)&&!d.hasPreview);
 for(const [i,d]of pending.entries()){
  progress('Odczytywanie powiązań korekt: '+(i+1)+' z '+pending.length+'…');
  const bytes=await singleBytes(d.metadata,signal);await integration.storeXml(d.metadata.ksefNumber,decodeXml(bytes));check(signal);
 }
 documents=await integration.index();
 const queried=new Set();
 for(const d of documents.filter(d=>isCorrection(d.metadata)))for(const ref of d.references||[]){
  const found=documents.some(x=>ref.ksefNumber?x.metadata.ksefNumber.toUpperCase()===ref.ksefNumber.toUpperCase():x.metadata.invoiceNumber===ref.number&&x.metadata.issueDate===ref.issueDate&&x.metadata.seller?.nip===d.metadata.seller?.nip);
  if(!found&&/^20\d{2}-\d{2}-\d{2}$/.test(ref.issueDate||'')&&!queried.has(ref.issueDate)){queried.add(ref.issueDate);progress('Szukanie faktury źródłowej z '+ref.issueDate+'…');await historyPage(ref.issueDate,ref.issueDate,signal,'Issue');documents=await integration.index();}
 }
 historySyncedAt=Date.now();progress('Sprawdzono powiązania korekt ze wszystkich miesięcy.');
}
async function loadStock(signal){
 if(!integration.stock)throw Error('Odśwież aplikację, aby załadować moduł Magazyn.');
 state.stockErrors=[];state.stockComplete=false;state.stockCorrectionsIncomplete=true;
 // Render saved goods before any network synchronization; an unavailable invoice
 // must never hide rows that have already been verified and stored.
 stockRows=await integration.stock();check(signal);draw();
 let historyComplete=false;try{await syncHistory(signal);historyComplete=true;}catch(error){if(signal.aborted)throw error;state.stockErrors.push({number:'Historia KSeF',message:error.message});}
 documents=await integration.index();check(signal);
 state.stockCorrectionsIncomplete=!historyComplete||documents.some(d=>isCorrection(d.metadata)&&!d.hasPreview);
 const pending=documents.filter(d=>!isCorrection(d.metadata)&&!d.hasPreview);
 for(const [i,d]of pending.entries()){
  progress('Wczytywanie pozycji towarów: '+(i+1)+' z '+pending.length+'…');
  try{const bytes=await singleBytes(d.metadata,signal);await integration.storeXml(d.metadata.ksefNumber,decodeXml(bytes));check(signal);}
  catch(error){if(signal.aborted)throw error;state.stockErrors.push({number:d.metadata.invoiceNumber||d.metadata.ksefNumber,message:error.message});}
 }
 documents=await integration.index();stockRows=await integration.stock();state.stockComplete=state.stockErrors.length===0;progress('Magazyn: '+stockRows.length+' pozycji z faktur i paragonów.'+(state.stockErrors.length?' Nie wczytano części dokumentów — szczegóły poniżej.':''));
}
async function assignWholeInvoice(number,signal){
 const initial=stockRows.filter(r=>r.metadata.ksefNumber===number);
 if(!initial.length)throw Error('Odśwież Magazyn.');
 const destination=await invoiceDestinationDialog(initial,signal);if(!destination)return;
 stockRows=await integration.stock();check(signal);
 const rows=stockRows.filter(r=>r.metadata.ksefNumber===number);
 if(rows.length!==initial.length||rows.some(r=>!initial.some(x=>x.item.index===r.item.index)))throw Error('Lista pozycji faktury zmieniła się. Odśwież Magazyn.');
 if(!wholeInvoiceFree(rows))throw Error('Część faktury jest już przypisana albo zwrócona. Edytuj pojedyncze pozycje lub cofnij wcześniejsze przypisanie.');
 let target=null;
 if(destination==='auto'||destination==='firmowe'){
  await integration.setInvoiceUse({number,category:destination,indices:rows.map(r=>r.item.index)});
  progress('Przypisano całą fakturę: '+(destination==='auto'?'Auto':'Koszty firmowe')+'.');
  target={kind:destination,label:destination==='auto'?'Auto':'Koszty firmowe'};
 }else{
  state.stockIndex=null;state.stockWholeInvoice=destination==='investment';
  try{target=destination==='investment'?await assignInvestment(number,signal):await assignCleanfleet(number,signal);}
  finally{state.stockWholeInvoice=false;}
 }
 stockRows=await integration.stock();
 check(signal);
 const field={auto:'classifiedAuto',firmowe:'classifiedCompany',cleanfleet:'cleanfleetAssigned',investment:'projectAssigned'}[target?.kind];
 const saved=stockRows.filter(r=>r.metadata.ksefNumber===number);
 if(field&&saved.length===rows.length&&saved.every(r=>Number(r[field])===Number(r.capacity)&&!Number(r.returned)))await suggestSupplierInvoices(number,target,signal);
}
function chooseSupplierInvoices(candidates,label,signal,unavailable){return supplierSuggestionDialog(candidates,label,signal,unavailable);}
async function suggestSupplierInvoices(sourceNumber,target,signal){
 const {candidates,unavailable}=similarInvoiceCandidates(stockRows,sourceNumber);
 if(!candidates.length)return;
 const selected=await chooseSupplierInvoices(candidates,target.label,signal,unavailable);if(!selected?.length)return;check(signal);
 stockRows=await integration.stock();check(signal);
 const chosen=candidates.filter(c=>selected.includes(c.metadata.ksefNumber)),failures=[];let saved=0,cancelled=false;
 try{
  for(const [index,candidate] of chosen.entries()){
   if(signal.aborted){cancelled=true;break;}progress('Przypisywanie faktur od tego wystawcy: '+(index+1)+' z '+chosen.length+'…');
   try{
    const current=stockRows.filter(r=>r.metadata.ksefNumber===candidate.metadata.ksefNumber);
    if(!wholeInvoiceFree(current)||current.length!==candidate.indices.length||current.some(r=>!candidate.indices.includes(r.item.index)))throw Error('Stan zmienił się. Sprawdź fakturę i przypisz ją ponownie.');
    await assignSupplierInvoice({...candidate,rows:current},target,signal);saved++;
   }catch(error){if(signal.aborted){cancelled=true;break;}failures.push(candidate.metadata.invoiceNumber+': '+(error.message||'Nie potwierdzono zapisu.'));}
  }
 }finally{stockRows=await integration.stock();}
 progress('Faktura źródłowa została przypisana. Dodatkowo zapisano '+saved+' z '+chosen.length+' zaznaczonych faktur → '+target.label+'.'+(cancelled?' Przerwano dalsze przypisania. Zapisane faktury pozostają przypisane.':'')+(failures.length?'\nWymagają sprawdzenia:\n'+failures.join('\n'):''));
}
async function assignSupplierInvoice(candidate,target,signal){
 const number=candidate.metadata.ksefNumber;
 if(target.kind==='auto'||target.kind==='firmowe')return integration.setInvoiceUse({number,category:target.kind,indices:candidate.indices});
 const bytes=await singleBytes(candidate.metadata,signal);check(signal);const xml=decodeXml(bytes);
 if(target.kind==='cleanfleet'){
  const context=await integration.cfContext(number);check(signal);
  if(context.link||context.purchases?.length||context.blocked?.length)throw Error('Faktura ma już powiązania. Sprawdź ją osobno.');
  return integration.cfSave({number,xml,revision:null,entries:candidate.indices.map(index=>({index,category:target.category,company_id:target.company_id,note:''}))});
 }
 const context=await integration.allocationContext(number);check(signal);
 if(context.links?.length||context.blocked?.length)throw Error('Faktura ma już powiązania. Sprawdź ją osobno.');
 const current=await integration.findPurchases(target.project);check(signal);
 if(duplicatePurchases((current.payload.purchases||[]).filter(p=>!p.sourceKsefNumber),candidate.amount).length)throw Error('W inwestycji istnieje ręczny zakup o tej kwocie. Sprawdź duplikat i przypisz fakturę osobno.');
 const result=await integration.assign({project:target.project,number,kind:'purchases',xml,entries:candidate.rows.map(r=>({index:r.item.index,quantity:Number(r.capacity)})),previous:null,projectRevision:current.revision,replacement:null});
 return result;
}
async function receiptProjectDialog(rows,signal){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='scroll-modal kf-assignment-modal';dialog.innerHTML='<form><header><h2>Przypisz paragon do inwestycji</h2></header><div class="modal-body"><label class="field">Inwestycja<select name="project" required><option value="">Wybierz…</option>'+integration.projects.map(p=>'<option value="'+e(p.id)+'">'+e(p.name)+' · '+e(p.number)+'</option>').join('')+'</select></label>'+rows.map(r=>'<label class="field">'+e(r.item.name)+' · dostępne '+e(r.available)+' '+e(r.item.unit)+'<input name="qty-'+r.item.index+'" type="number" inputmode="decimal" min="0" max="'+r.available+'" step="0.000001" value="'+r.available+'" required></label>').join('')+'<p>Wpisz 0, aby pominąć pozycję. Wybór zapisze koszt inwestycji, bez oznaczania zwrotu pieniędzy od inwestora.</p></div><footer><button type="button" data-cancel>Anuluj</button><button class="primary">Przypisz</button></footer></form>';
 const finish=value=>{signal.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(value);},cancel=()=>finish(null);dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=ev=>{ev.preventDefault();cancel();};dialog.querySelector('form').onsubmit=ev=>{ev.preventDefault();const fd=new FormData(ev.target),entries=rows.map(r=>({index:r.item.index,quantity:Number(fd.get('qty-'+r.item.index))})).filter(x=>x.quantity>0);if(!entries.length||entries.some(x=>!Number.isFinite(x.quantity)))return;finish({project:fd.get('project'),entries});};signal.addEventListener('abort',cancel,{once:true});document.body.append(dialog);dialog.showModal();
 });}
 async function assignReceiptProject(number,index,signal){
  stockRows=await integration.stock();check(signal);const rows=stockRows.filter(r=>r.metadata.ksefNumber===number&&r.available>0&&(index===0||r.item.index===index));if(!rows.length)throw Error('Pozycja paragonu jest już przypisana. Odśwież magazyn.');
  const choice=await receiptProjectDialog(rows,signal);if(!choice)return;check(signal);const project=await integration.findPurchases(choice.project);check(signal);await integration.assignReceipt({number,project:choice.project,entries:choice.entries,revision:project.revision});stockRows=await integration.stock();progress('Zapisano '+choice.entries.length+' pozycji paragonu jako koszt inwestycji.');
 }
 async function assignReceiptInvoice(number,signal){
  stockRows=await integration.stock();check(signal);const rows=stockRows.filter(r=>r.metadata.ksefNumber===number);if(!wholeInvoiceFree(rows))throw Error('Część paragonu jest już przypisana lub zwrócona. Wybierz pojedyncze pozycje.');const destination=await invoiceDestinationDialog(rows,signal);if(!destination)return;
  if(destination==='investment')return assignReceiptProject(number,0,signal);
  if(destination==='cleanfleet')await integration.assignReceiptCleanfleet({number,indices:rows.map(r=>r.item.index)});
  else await integration.setInvoiceUse({number,category:destination,indices:rows.map(r=>r.item.index)});
  stockRows=await integration.stock();progress('Przypisano cały paragon: '+({auto:'Auto',firmowe:'Koszty firmowe',cleanfleet:'CleanFleet'}[destination])+'.');
 }
 async function classifyStock(number,index,category,signal){
 const row=stockRows.find(r=>r.metadata.ksefNumber===number&&r.item.index===index);if(!row||!['auto','firmowe','cleanfleet'].includes(category))throw Error('Odśwież Magazyn.');
 const quantity=await useDialog(row,category,signal);if(quantity===null)return;check(signal);
 await integration.setUse({number,index,category,quantity,revision:Number(row.uses?.[category]?.revision||0)});stockRows=await integration.stock();progress('Zapisano przypisanie w magazynie.');
}
async function returnStock(number,index,undo,signal){
 const row=stockRows.find(r=>r.metadata.ksefNumber===number&&r.item.index===index);if(!row)throw Error('Odśwież Magazyn.');
 if(undo&&!confirm('Cofnąć ręczne oznaczenie zwrotu tej pozycji? Ilości potwierdzone korektami pozostaną odjęte.'))return;
 const amount=undo?0:await returnDialog(row,signal);if(amount===null)return;check(signal);
 const quantity=undo?0:Math.max(row.manualReturned,row.correctedReturned)+amount;
 await integration.setReturn({number,index,quantity,revision:row.revision});stockRows=await integration.stock();progress(undo?'Cofnięto ręczny zwrot.':'Zapisano zwrot. Stan został zaktualizowany.');
}
async function load(signal,more=false){state.listError=false;progress('Pobieranie listy faktur z KSeF… Przy chwilowej niedostępności odczyt zostanie ponowiony.');const query=more?state.query:{kind:state.kind,from:state.from,to:state.to,dateType:state.dateType,sort:state.sort==='Asc'?'Asc':'Desc'};if(!query||!query.from||!query.to)throw Error('Uzupełnij zakres dat.');let result;try{result=await api({action:'ksef-list',...query,page:more?state.page+1:0,...ticket()},{signal});}catch(error){if(!signal.aborted)state.listError=true;if(!error.retryable){state.ticket='';state.ticketAt=0;}throw error;}check(signal);const merged=mergeInvoices(more?state.rows:[],result.invoices);if(!more){historySyncedAt=0;cache=null;clearReady();state.selected=new Set([...state.selected].filter(number=>merged.some(row=>row.ksefNumber===number)));}state.rows=merged;if(integration.loadLinks)assignments=await integration.loadLinks();if(integration.cfLinks)cfLinks=await integration.cfLinks();state.ticket=result.ticket;state.ticketAt=Date.now();state.page=result.page;state.hasMore=result.hasMore;state.isTruncated=result.isTruncated;state.loaded=true;state.query=query;state.partial=result.partial===true;state.partialWarning=result.warning||'';progress(state.partial?'Wyświetlono '+state.rows.length+' dokumentów z Bill przyjętych w KSeF. Pełna lista KSeF jest chwilowo niedostępna.':'Lista z KSeF i dokumenty z Bill przyjęte w KSeF: '+state.rows.length+' faktur'+(state.hasMore?' — wczytaj kolejne strony, aby przeszukać cały zakres.':'.'));if(state.kind==='purchases'&&integration.index){try{await integration.storeMetadata(result.invoices);await syncHistory(signal);}catch(error){if(signal.aborted)throw error;state.relationsWarning='Nie udało się sprawdzić wszystkich korekt: '+error.message;progress(state.relationsWarning);}}}
async function singleBytes(row,signal){const cached=cache?.files?.get(row.ksefNumber)||singles.get(row.ksefNumber);if(cached)return cached;progress('Pobieranie faktury z KSeF…');let result;try{if(row.billId){const doc=await api({action:'document',id:row.billId},{signal});if(doc.status!=='accepted'||doc.ksef_number!==row.ksefNumber||!doc.xml)throw Error('Brak potwierdzonego XML dokumentu w Bill. Odśwież listę.');const bytes=await verifyInvoice(new TextEncoder().encode(doc.xml),row);check(signal);return bytes;}result=await api({action:'ksef-document',number:row.ksefNumber,...ticket()},{signal});}catch(error){state.ticket='';state.ticketAt=0;throw error;}check(signal);const bytes=await verifyInvoice(bytesFromBase64(result.content),row);check(signal);while(singles.size&&(singleSize+bytes.length>20*1024*1024||singles.size>=32)){const first=singles.keys().next().value;singleSize-=singles.get(first).length;singles.delete(first);}singles.set(row.ksefNumber,bytes);singleSize+=bytes.length;return bytes;}
async function pdf(bytes,row,signal){check(signal);await verifyInvoice(bytes,row);const xml=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',{fatal:true}).decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Nieprawidłowy XML faktury.');const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.doctype||doc.getElementsByTagName('parsererror').length||!['Faktura','Invoice','CreditNote'].includes(doc.documentElement?.localName))throw Error('Nieprawidłowy XML faktury.');
 await script('/app/vendor/ksef-renderer-1.1.40.js',()=>!!window.CFKsefRenderer?.generateInvoice);check(signal);const hash=(await digest(bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const qrCode='https://qr.ksef.mf.gov.pl/invoice/'+row.seller.nip+'/'+row.issueDate.split('-').reverse().join('-')+'/'+hash;
 const blob=await window.CFKsefRenderer.generateInvoice(new File([bytes],row.ksefNumber+'.xml',{type:'application/xml'}),{nrKSeF:row.ksefNumber,qrCode},'blob');check(signal);if(!(blob instanceof Blob)||await blob.slice(0,5).text()!=='%PDF-')throw Error('Nie udało się utworzyć PDF.');return blob;
}
async function preview(number,signal){const row=invoice(number);if(!row)throw Error('Odśwież listę faktur.');const bytes=await singleBytes(row,signal);progress('Tworzenie podglądu PDF…');const blob=await pdf(bytes,row,signal);check(signal);openPdf(blob,row);progress('Podgląd PDF jest gotowy.');}
function openPdf(blob,row){const url=URL.createObjectURL(blob),overlay=document.createElement('section');overlay.className='kf-pdf-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Podgląd PDF faktury');overlay.innerHTML=`<div class="kf-pdf-bar"><button type="button" data-close>× Zamknij</button><strong>${e(row.invoiceNumber)}</strong><a class="button primary" href="${e(url)}" download="${e(row.ksefNumber)}.pdf">Pobierz PDF</a><a class="button" href="${e(url)}" target="_blank" rel="noopener">Otwórz PDF ↗</a></div><iframe title="PDF faktury" src="${e(url)}"></iframe>`;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';const close=()=>{overlay.remove();document.body.style.overflow=overflow;URL.revokeObjectURL(url);document.removeEventListener('keydown',key);};const key=event=>{if(event.key==='Escape'){event.preventDefault();close();}};overlay.querySelector('[data-close]').onclick=close;document.addEventListener('keydown',key);document.body.append(overlay);overlay.querySelector('button').focus();}
const wait=(ms,signal)=>new Promise((resolve,reject)=>{check(signal);const abort=()=>{clearTimeout(timer);reject(new DOMException('Anulowano','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
async function exportFiles(signal){const key=JSON.stringify(state.query);if(cache?.key===key)return cache.files;const Zip=await zipLib();progress('Zlecanie bezpiecznego eksportu z KSeF…');const job=await api({action:'ksef-export-start',...state.query},{signal});check(signal);let result;const deadline=Date.now()+12*60000;
 do{if(Date.now()>deadline)throw Error('KSeF nadal przygotowuje eksport. Spróbuj ponownie później.');result=await api({action:'ksef-export-status',ticket:job.ticket},{signal});check(signal);if(result.status==='pending'){progress('KSeF przygotowuje eksport. Możesz anulować oczekiwanie.');await wait((result.retryAfter||4)*1000,signal);}}while(result.status==='pending');
 if(result.status!=='ready')throw Error('Eksport KSeF nie jest gotowy.');const aes=await crypto.subtle.importKey('raw',bytesFromBase64(job.key),'AES-CBC',false,['decrypt']),parts=[];let size=0;
 for(const [i,part]of result.parts.entries()){progress('Pobieranie archiwum: część '+(i+1)+' z '+result.parts.length+'…');const encrypted=await api({action:'ksef-export-part',ticket:part.ticket},{signal,binary:true});check(signal);const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:bytesFromBase64(job.iv)},aes,encrypted));if(plain.length!==part.partSize||await digest(plain)!==part.partHash)throw Error('Weryfikacja archiwum nie powiodła się.');parts.push(plain);size+=plain.length;}
 if(size!==result.size||size>100*1024*1024)throw Error('Niezgodny rozmiar archiwum.');const combined=new Uint8Array(size);let offset=0;for(const p of parts){combined.set(p,offset);offset+=p.length;}const archive=await Zip.loadAsync(combined),entries=Object.values(archive.files).filter(f=>!f.dir&&/\.xml$/i.test(f.name));if(entries.length!==result.invoiceCount)throw Error('Niezgodna liczba faktur w eksporcie.');const files=new Map();let total=0;
 for(const file of entries){check(signal);if(file._data?.uncompressedSize>10*1024*1024)throw Error('Jedna z faktur przekracza 10 MB.');const number=file.name.split(/[\\/]/).at(-1).replace(/\.xml$/i,'');if(!/^\d{10}-\d{8}-[a-f\d]{12}-[a-f\d]{2}$/i.test(number)||files.has(number))throw Error('Nieprawidłowa nazwa lub duplikat faktury w eksporcie.');const bytes=await file.async('uint8array');total+=bytes.length;if(bytes.length>10*1024*1024||total>150*1024*1024)throw Error('Eksport jest za duży. Zawęź daty.');files.set(number,bytes);}
 check(signal);cache={key,files};return files;
}
async function downloadSelected(signal){const rows=[...state.selected].map(invoice).filter(Boolean);if(!rows.length||rows.length>250)throw Error('Zaznacz od 1 do 250 faktur.');clearReady();const files=rows.some(row=>!row.billId&&state.rows.some(r=>r.ksefNumber===row.ksefNumber))?await exportFiles(signal):new Map(),Zip=await zipLib(),output=new Zip();let total=0;
 for(const [i,row]of rows.entries()){check(signal);const bytes=row.billId||!state.rows.some(r=>r.ksefNumber===row.ksefNumber)?await singleBytes(row,signal):files.get(row.ksefNumber);if(!bytes)throw Error('Faktury '+row.invoiceNumber+' nie ma jeszcze w eksporcie. Odśwież listę i spróbuj ponownie.');progress('Tworzenie PDF: '+(i+1)+' z '+rows.length+'…');const blob=await pdf(bytes,row,signal);total+=blob.size;if(total>150*1024*1024)throw Error('PDF-y przekraczają 150 MB. Zaznacz mniej faktur.');output.file(row.ksefNumber+'.pdf',await blob.arrayBuffer());await wait(0,signal);}
 progress('Przygotowanie paczki ZIP…');const blob=await output.generateAsync({type:'blob',compression:'STORE'},()=>check(signal));check(signal);ready={url:URL.createObjectURL(blob),name:'KSeF-'+state.kind+'-'+state.query.from+'_'+state.query.to+'.zip',count:rows.length};progress('Gotowe: '+rows.length+' PDF. Kliknij „Zapisz paczkę ZIP”.');
}

export function focusInvoice(number,month,kind='sales'){state=initial();state.q=number==='1'?'':number;if(/^20\d{2}-\d{2}$/.test(month||'')){state.month=month;Object.assign(state,monthDates(month));}state.kind=kind==='purchases'?'purchases':'sales';}
async function assignInvestment(number,signal){
 const row=invoice(number);if(!row)throw Error('Odśwież listę faktur.');
 if(!integration.projects?.length)throw Error('Najpierw utwórz inwestycję w Robisię.');
 if(integration.loadLinks)assignments=await integration.loadLinks();check(signal);
 let existing=assignments.find(x=>x.ksef_number===number);
 if(existing&&state.kind!=='purchases'){const project=integration.projects.find(x=>x.id===existing.project_id);progress('Faktura jest już przypisana: '+(project?.name||'inwestycja Robisię')+'.');return;}
 const bytes=await singleBytes(row,signal);check(signal);
 const xml=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',{fatal:true}).decode(bytes);
 const details=state.kind==='purchases'&&integration.preview?await integration.preview({xml}):null;check(signal);
 if(state.kind==='purchases'&&row.currency==='PLN'&&Number(details?.gross)<0&&isCorrection(row)&&integration.correctCostContext&&integration.applyCostCorrection){
  await integration.storeMetadata([row]);await integration.storeXml(number,xml);check(signal);
  const context=await integration.correctCostContext(number);check(signal);
  const choice=await costCorrectionDialog(row,context,signal);if(!choice)return;check(signal);
  const result=await integration.applyCostCorrection({number,...choice});assignments=await integration.loadLinks();
  state.purchaseTarget={project:choice.project,number};
  progress('Odliczono korektę od kosztów zakupu: '+new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(choice.amount)+'. Odśwież inwestycję w Robisię.');
  return result;
 }
 if(details&&integration.cfLinks){cfLinks=await integration.cfLinks();details.blocked=cfLinks.filter(x=>x.source_ksef_number===number).map(x=>x.source_ksef_index);}
 const referenceOnly=state.kind==='purchases'&&(row.currency!=='PLN'||row.grossAmount<0||/^Kor/i.test(row.invoiceType||''));
 const context=state.kind==='purchases'&&!referenceOnly&&integration.allocationContext?await integration.allocationContext(number):null;
 if(context){details.links=context.links;details.blocked=context.blocked;}
 const choice=await chooseInvestment(row,signal,details,existing);if(!choice)return;
 const project=typeof choice==='string'?choice:choice.project,indices=typeof choice==='string'?null:choice.indices,entries=choice.entries;
 if(context)existing=context.links.find(x=>x.project_id===project)||null;
 if(choice.detach){const current=await integration.findPurchases(project);await integration.unassign({project,number,revision:current.revision});assignments=await integration.loadLinks();progress('Odłączono zakup od inwestycji. Pozycje i ilości są ponownie dostępne.');return;}

 let replacement=null,projectRevision=null;
 if(state.kind==='purchases'&&integration.findPurchases){
  const current=await integration.findPurchases(project);check(signal);projectRevision=current.revision;
  const matches=!existing&&details?.currency==='PLN'?duplicatePurchases(current.payload.purchases||[],entries?choice.total:selectedAmount(details,indices)):[];
  if(matches.length){const decision=await chooseDuplicate(matches,signal);if(decision===null)return;replacement=decision||null;}
 }
 let billId=row.billId||null;
 if(billId){const original=await api({action:'document',id:billId},{signal});if(original.payload.source?.app==='robisie'&&original.payload.source.id!==project)throw Error('Faktura w Bill jest już powiązana z inną inwestycją.');}
 progress('Przypisywanie faktury do inwestycji…');
 const result=await integration.assign({project,number,kind:state.kind,xml,billId,indices,entries,referenceOnly,previous:existing,replacement,projectRevision});
 if(state.kind==='purchases')remember(globalThis.localStorage,integration.userId,counterparty(row,'purchases').id,{project});
 assignments=await integration.loadLinks();
 if(state.kind==='purchases'&&!result.document?.referenceOnly)state.purchaseTarget={project,number};
 progress(result.document?.referenceOnly?'Powiązano dokument. Korekta lub waluta obca wymaga osobnego rozliczenia — nie zmieniono kwot w PLN.':state.kind==='purchases'?(existing?'Zaktualizowano przypisanie i pozycje zakupu. Odśwież inwestycję w Robisię.':replacement?'Uzupełniono istniejący zakup fakturą. Zachowano jego rozliczenia. Odśwież inwestycję w Robisię.':'Dodano '+(indices?.length??details?.items?.length??0)+' pozycji z faktury do inwestycji · '+new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(entries?choice.total:details?selectedAmount(details,indices):row.grossAmount)+'. Wpłaty inwestora pozostały bez zmian.'):'Faktura jest dostępna w Etapach i płatnościach inwestycji. Wystawienie nie zapisuje wpłaty.');
 if(!result.document?.referenceOnly)return {kind:'investment',project,label:'Robisię · '+(integration.projects.find(p=>p.id===project)?.name||'inwestycja')};
}
function chooseInvestment(row,signal,details=null,existing=null){if(details?.links)return chooseQuantityInvestment(row,signal,details);return new Promise(resolve=>{
 const money=value=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:row.currency}).format(value),items=details?.items||[];
 const preferred=hint(globalThis.localStorage,integration.userId,counterparty(row,'purchases').id)?.project;
 const suggested=!existing&&integration.projects.some(p=>p.id===preferred)?preferred:null;
 const selection=details?`<section class="kf-purchase-selection"><h3>Pozycje faktury zakupowej</h3><p class="muted">Zaznacz pozycje, które wliczasz do tej inwestycji. Do inwestycji trafią wybrane pozycje i ich suma brutto.</p>${details.warning?`<p class="notice">${e(details.warning)}</p>`:''}${details.canSelect?'<div class="actions"><button type="button" data-lines="all">Zaznacz wszystkie</button><button type="button" data-lines="none">Odznacz wszystkie</button></div>':''}<div class="kf-purchase-items">${items.map(item=>`<label class="kf-purchase-item"><input type="checkbox" name="purchaseLine" value="${item.index}" ${!details.blocked?.includes(item.index)&&(!existing?.selected_indices||existing.selected_indices.includes(item.index))?'checked':''} ${!details.canSelect||details.blocked?.includes(item.index)?'disabled':''}><span><strong>${e(item.name||'Pozycja '+item.index)}${details.blocked?.includes(item.index)?' · Koszt w CleanFleet':''}</strong><small>${e(item.quantity??'—')} ${e(item.unit||'')} · VAT ${e(item.vat||'—')}${item.net!=null?' · netto '+e(money(item.net)):''}</small></span><strong>${item.gross==null?'Brak kwoty pozycji':e(money(item.gross))}</strong></label>`).join('')||'<p class="muted">Dokument nie zawiera szczegółowych pozycji.</p>'}</div><p class="kf-purchase-total" aria-live="polite"></p><p class="error" data-selection-error role="alert"></p></section>`:'';
 const dialog=document.createElement('dialog');dialog.className='scroll-modal kf-assignment-modal';dialog.innerHTML=`<form><header><h2>${existing?'Edytuj przypisanie faktury':'Przypisz fakturę do inwestycji'}</h2></header><div class="modal-body"><p><strong>${e(row.invoiceNumber)}</strong> · ${e(money(row.grossAmount))}</p><label class="field">Inwestycja<select name="project" required><option value="">Wybierz…</option>${integration.projects.map(p=>`<option value="${e(p.id)}" ${existing?.project_id===p.id||suggested===p.id?'selected':''}>${e(p.name)} · ${e(p.number)}</option>`).join('')}</select></label>${suggested?'<p class="muted">Podpowiedź: tę firmę przypisałeś wcześniej do tej inwestycji. Sprawdź wybór przed zapisem.</p>':''}${selection}${existing?'<p class="notice">Zmiana pozycji aktualizuje istniejący zakup, jego opis i kwotę. Zapisane wpłaty zostają zachowane. Zakup z rozliczeniami wymaga ich odłączenia przed przeniesieniem do innej inwestycji.</p>':''}<p class="muted">${state.kind==='purchases'?'Sam import nie oznacza otrzymania zwrotu od inwestora.':'Faktura będzie dostępna do powiązania z należnościami i wpływami w inwestycji.'} Korekty i waluty obce są zapisywane jako dokumenty do osobnego rozliczenia.</p></div><footer><button type="button" data-cancel>Anuluj</button><button type="submit" class="primary">${existing?'Zapisz zmiany':'Przypisz'}</button></footer></form>`;
 const boxes=[...dialog.querySelectorAll('input[name="purchaseLine"]')],selected=()=>boxes.filter(x=>x.checked).map(x=>Number(x.value));
 const update=()=>{if(!details)return;const ids=selected(),sum=ids.length===items.length||!details.canSelect?details.gross:items.filter(x=>ids.includes(x.index)).reduce((n,x)=>n+Math.round(Number(x.gross)*100),0)/100,invalid=details.canSelect&&(!ids.length||sum<0||sum>details.gross+.001);dialog.querySelector('.kf-purchase-total').textContent=`Do inwestycji: ${money(sum)} · ${ids.length} z ${items.length} pozycji`;dialog.querySelector('[type="submit"]').disabled=invalid;dialog.querySelector('[data-selection-error]').textContent=invalid?(!ids.length?'Zaznacz przynajmniej jedną pozycję.':'Suma pozycji musi mieścić się w kwocie faktury. Uwzględnij pozycje korygujące.') : '';};
 for(const box of boxes)box.onchange=update;
 for(const button of dialog.querySelectorAll('[data-lines]'))button.onclick=()=>{for(const box of boxes)if(!box.disabled)box.checked=button.dataset.lines==='all';update();};
 const finish=value=>{signal.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(value);},cancel=()=>finish(null);
 dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=event=>{event.preventDefault();cancel();};dialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(dialog.querySelector('[type="submit"]').disabled)return;finish({project:new FormData(event.target).get('project'),indices:details?.canSelect?selected():null});};signal.addEventListener('abort',cancel,{once:true});document.body.append(dialog);dialog.showModal();update();
});}

function chooseQuantityInvestment(row,signal,details){return new Promise(resolve=>{
 const preferred=hint(globalThis.localStorage,integration.userId,counterparty(row,'purchases').id)?.project;
 const dialog=document.createElement('dialog');dialog.className='scroll-modal kf-assignment-modal';
 dialog.innerHTML=`<form><header><h2>Podziel fakturę między inwestycje</h2></header><div class="modal-body"><p><strong>${e(row.invoiceNumber)}</strong> · ${e(row.currency)}</p><label class="field">Inwestycja<select name="project" required><option value="">Wybierz…</option>${integration.projects.map(p=>`<option value="${e(p.id)}" ${p.id===preferred?'selected':''}>${e(p.name)} · ${e(p.number)}${details.links.some(l=>l.project_id===p.id)?' · ma przypisane pozycje':''}</option>`).join('')}</select></label><div data-allocation-host></div></div><footer><button type="button" data-detach hidden>Odłącz zakup od inwestycji</button><button type="button" data-cancel>Anuluj</button><button type="submit" class="primary">Zapisz przypisanie</button></footer></form>`;
 const select=dialog.querySelector('[name="project"]'),host=dialog.querySelector('[data-allocation-host]'),submit=dialog.querySelector('[type="submit"]'),detach=dialog.querySelector('[data-detach]');let form=null;
 const render=()=>{const project=select.value,own=details.links.find(l=>l.project_id===project);host.innerHTML=project?allocationMarkup(details,details.links,project,details.blocked,own?savedEntries(own,details.items):details.canSelect?(state.stockWholeInvoice?details.items.filter(i=>Number(i.quantity)>0).map(i=>({index:i.index,quantity:Number(i.quantity)})):state.stock&&state.stockIndex?[{index:state.stockIndex,quantity:Number(stockRows.find(r=>r.metadata.ksefNumber===row.ksefNumber&&r.item.index===state.stockIndex)?.available||0)}]:[]):details.items.map(i=>({index:i.index,quantity:Number(i.quantity)>0?Number(i.quantity):1}))):'<p class="muted">Wybierz inwestycję, aby zobaczyć dostępne ilości.</p>';submit.disabled=!project;detach.hidden=!own;form=project?mountAllocation(host,details,details.links,project,details.blocked,(selection)=>{submit.disabled=!selection;}):null;};
 const finish=value=>{signal.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(value);},cancel=()=>finish(null);
 dialog.querySelector('[data-cancel]').onclick=cancel;select.onchange=render;dialog.oncancel=event=>{event.preventDefault();cancel();};detach.onclick=()=>{if(confirm('Odłączyć zakup od tej inwestycji i zwolnić jego pozycje? Zakup z zapisanymi rozliczeniami wymaga wcześniejszego odłączenia wpłat.'))finish({project:select.value,detach:true});};dialog.querySelector('form').onsubmit=event=>{event.preventDefault();try{const selection=form.read();finish({project:select.value,...selection});}catch{}};signal.addEventListener('abort',cancel,{once:true});document.body.append(dialog);dialog.showModal();render();
});}

function chooseDuplicate(matches,signal){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='scroll-modal';
 dialog.innerHTML=`<form><header><h2>Czy to ten sam zakup?</h2></header><div class="modal-body"><p>W inwestycji są już zakupy o takiej samej kwocie jak wybrane pozycje faktury. Wskaż wpis do zastąpienia albo dodaj fakturę jako osobny zakup.</p><label class="field">Zastąp wpis<select name="replacement" required><option value="">Wybierz…</option><option value="separate">To inny zakup — dodaj osobno</option>${matches.map(x=>`<option value="${e(x.id)}" ${x.sourceKsefNumber?'disabled':''}>${e(x.date)} · ${e(x.shop)} · ${e(x.description)}${x.sourceKsefNumber?' (ma już fakturę KSeF)':''}</option>`).join('')}</select></label><p class="muted">Zastąpienie aktualizuje dokument i pozycje. Zapisany koszt inwestora, wpłaty i rozliczenia pozostaną zachowane. Koszt nie zostanie dodany drugi raz.</p></div><footer><button type="button" data-cancel>Anuluj</button><button class="primary" type="submit">Zatwierdź</button></footer></form>`;
 const finish=value=>{signal.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(value);},cancel=()=>finish(null);
 dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=event=>{event.preventDefault();cancel();};dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const id=new FormData(event.target).get('replacement');if(id)finish(id==='separate'?'':id);};
 signal.addEventListener('abort',cancel,{once:true});document.body.append(dialog);dialog.showModal();
});}

async function assignCleanfleet(number,signal){
 const row=invoice(number);if(!row)throw Error('Odśwież listę faktur.');
 const context=await integration.cfContext(number);check(signal);
 let xml=null,details=context.link?.preview;
 if(!context.link){const bytes=await singleBytes(row,signal);xml=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',{fatal:true}).decode(bytes);details=await integration.preview({xml});}
 const companies=await integration.cfCompanies();check(signal);
 const {editCosts}=await import('/app/ksef-costs.js?v=1.56.17');check(signal);
 const seller=counterparty(row,'purchases').id,suggestion=hint(globalThis.localStorage,integration.userId,seller)?.cleanfleet;
 let savedEntries=[];const saved=await editCosts({number,xml,preview:details,context,companies,save:integration.cfSave,signal,suggestion,focusIndex:state.stock?state.stockIndex:null,onSaved:entries=>{savedEntries=entries;if(entries.length)remember(globalThis.localStorage,integration.userId,seller,{cleanfleet:{category:entries[0].category,company_id:entries[0].company_id}});}});
 if(saved){cfLinks=await integration.cfLinks();progress('Zapisano '+savedEntries.length+' pozycji w kosztach CleanFleet · '+new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(savedEntries.reduce((sum,entry)=>sum+Number(details?.items?.find(item=>item.index===entry.index)?.gross||0),0))+'. Faktura pozostała w Bill.');}
 if(saved&&savedEntries.length&&savedEntries.every(entry=>entry.category===savedEntries[0].category&&(entry.company_id||null)===(savedEntries[0].company_id||null)))return {kind:'cleanfleet',category:savedEntries[0].category,company_id:savedEntries[0].company_id||null,label:'CleanFleet · '+savedEntries[0].category+(savedEntries[0].company_id?' · '+(companies.find(c=>c.id===savedEntries[0].company_id)?.short_name||companies.find(c=>c.id===savedEntries[0].company_id)?.name||'wybrana firma'):' · koszt ogólny')};
}

async function paymentDemand(number,signal){
 if(state.kind!=='sales')throw Error('Wybierz fakturę sprzedażową.');
 const row=invoice(number);if(!row)throw Error('Odśwież listę faktur.');
 const bytes=await singleBytes(row,signal);check(signal);
 const xml=new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',{fatal:true}).decode(bytes);
 const original=row.billId?await api({action:'document',id:row.billId},{signal}):null;
 const links=integration.loadLinks?await integration.loadLinks():[],link=links.find(x=>x.ksef_number===number&&x.kind==='sales');
 const projectId=link?.project_id||(original?.payload?.source?.app==='robisie'?original.payload.source.id:null);
 if(projectId&&!integration.findPurchases)throw Error('Nie można sprawdzić zapisanych wpłat inwestora.');
 const loadProject=projectId?async()=>(await integration.findPurchases(projectId)).payload:null;
 const {showKsefDemand}=await import('./ksef-demand.js?v=1.0.38');check(signal);
 const saved=await showKsefDemand({xml,metadata:row,original,link,loadProject,defaultBank:integration.bank||'',signal});if(saved)progress('Wezwanie do zapłaty jest gotowe.');
}
