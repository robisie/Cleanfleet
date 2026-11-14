import {esc} from './core.js?v=1.0.37';

const nip=seller=>String(seller?.nip||'').toUpperCase().replace(/^PL[\s-]*/,'').replace(/[^A-Z0-9]/g,'');
const name=seller=>String(seller?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pl');
export const wholeInvoiceFree=rows=>rows.length>0&&rows.every(row=>!row.hidden&&Number(row.capacity)>0&&Number(row.available)===Number(row.capacity)&&!Number(row.assigned)&&!Number(row.returned)&&!row.conflict);
export function similarInvoiceCandidates(rows,sourceNumber){
 const source=rows.find(row=>row.metadata.ksefNumber===sourceNumber)?.metadata;
 if(!source)return {candidates:[],unavailable:0};
 const sourceNip=nip(source.seller),sourceName=name(source.seller),groups=new Map();
 if(!sourceNip&&!sourceName)return {candidates:[],unavailable:0};
 for(const row of rows){
  const m=row.metadata;if(m.ksefNumber===sourceNumber)continue;
  const matches=sourceNip?nip(m.seller)===sourceNip:!nip(m.seller)&&name(m.seller)===sourceName;
  if(!matches)continue;
  if(!groups.has(m.ksefNumber))groups.set(m.ksefNumber,[]);groups.get(m.ksefNumber).push(row);
 }
 const candidates=[];let unavailable=0;
 for(const group of groups.values()){
  const metadata=group[0].metadata;
  if(metadata.currency!=='PLN'||/^kor/i.test(metadata.invoiceType||'')||!wholeInvoiceFree(group)){unavailable++;continue;}
  candidates.push({metadata,indices:group.map(row=>row.item.index),rows:group,amount:group.reduce((sum,row)=>sum+Math.round(Number(row.item.gross)*100),0)/100});
 }
 candidates.sort((a,b)=>String(b.metadata.issueDate||'').localeCompare(String(a.metadata.issueDate||''))||a.metadata.ksefNumber.localeCompare(b.metadata.ksefNumber));
 return {candidates,unavailable};
}
export const suggestedAmount=(candidate,indices=candidate.indices)=>{
 const wanted=new Set(indices.map(Number));
 return Math.round(candidate.rows.filter(row=>wanted.has(Number(row.item.index))).reduce((sum,row)=>sum+Math.round(Number(row.item.gross)*100),0))/100;
};
const money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n);
export function supplierSuggestionMarkup(candidates,label,unavailable=0){
 const seller=candidates[0]?.metadata.seller||{};
 return `<form><header><h2>Przypisać też pozostałe faktury?</h2></header><div class="modal-body"><p>Faktura źródłowa została zapisana. Znaleziono inne zakupy od <strong>${esc(seller.name||seller.nip||'tego wystawcy')}</strong>${seller.nip?' · NIP '+esc(seller.nip):' (dopasowanie po nazwie, brak NIP-u)'}.</p><p>Przeznaczenie: <strong>${esc(label)}</strong>. Rozwiń fakturę, sprawdź produkty i odznacz te, które nie dotyczą tego przeznaczenia.</p>
 <div class="actions"><button type="button" data-select-all>Zaznacz wszystkie</button><button type="button" data-select-none>Odznacz wszystkie</button></div>
 <div class="kf-supplier-invoices">${candidates.map(candidate=>`<section class="kf-supplier-invoice" data-supplier-invoice="${esc(candidate.metadata.ksefNumber)}">
 <div class="kf-supplier-invoice-head"><input type="checkbox" name="invoice" value="${esc(candidate.metadata.ksefNumber)}" checked aria-label="Przypisz fakturę ${esc(candidate.metadata.invoiceNumber)}">
 <span><strong>${esc(candidate.metadata.invoiceNumber)}</strong><small>${esc(candidate.metadata.issueDate||'—')} · ${candidate.indices.length} pozycji</small></span><strong data-invoice-amount>${money(candidate.amount)}</strong>
 <button type="button" data-supplier-toggle aria-expanded="false" aria-label="Pokaż produkty faktury ${esc(candidate.metadata.invoiceNumber)}">⌄</button></div>
 <div class="kf-supplier-details" hidden><div class="kf-supplier-products">
 ${candidate.rows.map(row=>`<label class="kf-supplier-product"><input type="checkbox" name="supplierLine" data-invoice-number="${esc(candidate.metadata.ksefNumber)}" value="${row.item.index}" checked><span><strong>${esc(row.item.name||'Pozycja '+row.item.index)}</strong><small>${esc(row.capacity)} ${esc(row.item.unit||'szt.')} · ${money(Number(row.item.gross)/Math.max(1,Number(row.capacity)))} / jedn.</small></span><strong>${money(Number(row.item.gross))}</strong></label>`).join('')}
 </div><button type="button" data-supplier-pdf data-number="${esc(candidate.metadata.ksefNumber)}">Podgląd PDF faktury</button></div></section>`).join('')}</div>
 <p data-selection-total aria-live="polite"></p>
 ${unavailable?`<p class="muted">Pominięto ${unavailable} faktur: mają wcześniejsze przypisania, zwroty albo nie można przypisać ich w całości.</p>`:''}
 <p class="muted">Możesz przypisać cały dokument albo tylko wybrane pozycje. Pozycje już wykorzystane pozostają zabezpieczone przed ponownym przypisaniem.</p></div>
 <footer><button type="button" data-cancel>Pomiń pozostałe</button><button type="submit" class="primary">Przypisz zaznaczone</button></footer></form>`;
}
export function supplierSuggestionDialog(candidates,label,signal,unavailable=0,onPdf=null){return new Promise(resolve=>{
 if(signal.aborted){resolve(null);return;}
 const dialog=document.createElement('dialog');dialog.className='scroll-modal kf-assignment-modal kf-supplier-modal';
 dialog.innerHTML=supplierSuggestionMarkup(candidates,label,unavailable);
 const invoices=[...dialog.querySelectorAll('input[name="invoice"]')],submit=dialog.querySelector('[type="submit"]');
 const choices=()=>candidates.map(candidate=>{
  const number=candidate.metadata.ksefNumber,box=invoices.find(input=>input.value===number);
  const indices=box?.checked?[...dialog.querySelectorAll('input[name="supplierLine"]')].filter(input=>input.dataset.invoiceNumber===number&&input.checked).map(input=>Number(input.value)):[];
  return {number,indices};
 }).filter(choice=>choice.indices.length);
 const update=()=>{
  for(const candidate of candidates){
   const number=candidate.metadata.ksefNumber,box=invoices.find(input=>input.value===number);
   const lines=[...dialog.querySelectorAll('input[name="supplierLine"]')].filter(input=>input.dataset.invoiceNumber===number);
   const active=lines.filter(input=>input.checked).map(input=>Number(input.value));
   box.checked=active.length>0;box.indeterminate=active.length>0&&active.length<lines.length;
   const root=box.closest('[data-supplier-invoice]');
   root.querySelector('[data-invoice-amount]').textContent=money(suggestedAmount(candidate,active));
  }
  const selected=choices(),amount=selected.reduce((sum,choice)=>sum+Math.round(suggestedAmount(candidates.find(c=>c.metadata.ksefNumber===choice.number),choice.indices)*100),0)/100;
  submit.disabled=!selected.length;
  dialog.querySelector('[data-selection-total]').textContent='Wybrano '+selected.length+' faktur · '+money(amount);
 };
 const finish=value=>{signal.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(value);},cancel=()=>finish(null);
 dialog.querySelector('[data-cancel]').onclick=cancel;
 dialog.oncancel=event=>{event.preventDefault();cancel();};
 for(const input of dialog.querySelectorAll('input[name="supplierLine"]'))input.onchange=update;
 for(const box of invoices)box.onchange=()=>{
  const lines=[...dialog.querySelectorAll('input[name="supplierLine"]')].filter(input=>input.dataset.invoiceNumber===box.value);
  lines.forEach(line=>line.checked=box.checked);update();
 };
 for(const button of dialog.querySelectorAll('[data-supplier-toggle]'))button.onclick=()=>{
  const details=button.closest('[data-supplier-invoice]').querySelector('.kf-supplier-details');
  details.hidden=!details.hidden;button.setAttribute('aria-expanded',String(!details.hidden));button.textContent=details.hidden?'⌄':'⌃';
 };
 for(const button of dialog.querySelectorAll('[data-supplier-pdf]'))button.onclick=async()=>{
  if(!onPdf)return;button.disabled=true;dialog.close();try{await onPdf(button.dataset.number,()=>{if(dialog.isConnected&&!dialog.open)dialog.showModal();});}catch(error){if(dialog.isConnected&&!dialog.open)dialog.showModal();dialog.querySelector('[data-selection-total]').textContent='Podgląd PDF: '+error.message;}finally{if(button.isConnected)button.disabled=false;}
 };
 dialog.querySelector('[data-select-all]').onclick=()=>{dialog.querySelectorAll('input[name="supplierLine"]').forEach(box=>box.checked=true);update();};
 dialog.querySelector('[data-select-none]').onclick=()=>{dialog.querySelectorAll('input[name="supplierLine"]').forEach(box=>box.checked=false);update();};
 dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const selected=choices();if(selected.length)finish(selected);};
 signal.addEventListener('abort',cancel,{once:true});document.body.append(dialog);dialog.showModal();update();
});}
