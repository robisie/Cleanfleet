import {esc} from './core.js?v=1.0.37';

const nip=seller=>String(seller?.nip||'').toUpperCase().replace(/^PL[\s-]*/,'').replace(/[^A-Z0-9]/g,'');
const name=seller=>String(seller?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pl');
export const wholeInvoiceFree=rows=>rows.length>0&&rows.every(row=>Number(row.capacity)>0&&Number(row.available)===Number(row.capacity)&&!Number(row.assigned)&&!Number(row.returned)&&!row.conflict);
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
const money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n);
export function supplierSuggestionMarkup(candidates,label,unavailable=0){
 const seller=candidates[0]?.metadata.seller||{};
 return `<form><header><h2>Przypisać też pozostałe faktury?</h2></header><div class="modal-body"><p>Faktura źródłowa została zapisana. Znaleziono inne zakupy od <strong>${esc(seller.name||seller.nip||'tego wystawcy')}</strong>${seller.nip?' · NIP '+esc(seller.nip):' (dopasowanie po nazwie, brak NIP-u)'}.</p><p>Przeznaczenie: <strong>${esc(label)}</strong>. Odznacz faktury, których nie chcesz przypisywać.</p><div class="actions"><button type="button" data-select-all>Zaznacz wszystkie</button><button type="button" data-select-none>Odznacz wszystkie</button></div><div class="kf-supplier-invoices">${candidates.map(candidate=>`<label class="kf-supplier-invoice"><input type="checkbox" name="invoice" value="${esc(candidate.metadata.ksefNumber)}" checked><span><strong>${esc(candidate.metadata.invoiceNumber)}</strong><small>${esc(candidate.metadata.issueDate||'—')} · ${candidate.indices.length} pozycji</small></span><strong>${money(candidate.amount)}</strong></label>`).join('')}</div><p data-selection-total aria-live="polite"></p>${unavailable?`<p class="muted">Pominięto ${unavailable} faktur: mają wcześniejsze przypisania, zwroty albo nie można przypisać ich w całości.</p>`:''}<p class="muted">Propozycje obejmują wszystkie wczytane miesiące. Każda faktura zostanie zapisana w całości.</p></div><footer><button type="button" data-cancel>Pomiń pozostałe</button><button type="submit" class="primary">Przypisz zaznaczone</button></footer></form>`;
}
export function supplierSuggestionDialog(candidates,label,signal,unavailable=0){return new Promise(resolve=>{
 if(signal.aborted){resolve(null);return;}
 const dialog=document.createElement('dialog');dialog.className='scroll-modal kf-assignment-modal kf-supplier-modal';
 dialog.innerHTML=supplierSuggestionMarkup(candidates,label,unavailable);
 const boxes=[...dialog.querySelectorAll('[name="invoice"]')],submit=dialog.querySelector('[type="submit"]');
 const selected=()=>boxes.filter(box=>box.checked).map(box=>box.value);
 const update=()=>{const numbers=new Set(selected()),amount=candidates.filter(c=>numbers.has(c.metadata.ksefNumber)).reduce((sum,c)=>sum+Math.round(c.amount*100),0)/100;submit.disabled=!numbers.size;dialog.querySelector('[data-selection-total]').textContent='Wybrano '+numbers.size+' faktur · '+money(amount);};
 const finish=value=>{signal.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(value);},cancel=()=>finish(null);
 dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=event=>{event.preventDefault();cancel();};
 for(const box of boxes)box.onchange=update;
 dialog.querySelector('[data-select-all]').onclick=()=>{boxes.forEach(box=>box.checked=true);update();};
 dialog.querySelector('[data-select-none]').onclick=()=>{boxes.forEach(box=>box.checked=false);update();};
 dialog.querySelector('form').onsubmit=event=>{event.preventDefault();if(selected().length)finish(selected());};
 signal.addEventListener('abort',cancel,{once:true});document.body.append(dialog);dialog.showModal();update();
});}
