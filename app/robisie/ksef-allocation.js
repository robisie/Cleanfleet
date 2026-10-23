// Quantity reservations are shared by Bill and the investment purchase editor.
const round=n=>Math.sign(Number(n))*Math.round((Math.abs(Number(n))+Number.EPSILON)*100)/100;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=n=>new Intl.NumberFormat('pl-PL',{maximumFractionDigits:6}).format(n);
const money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n);
export const capacity=item=>Number.isFinite(Number(item.quantity))&&Number(item.quantity)>0?Number(item.quantity):1;
export function savedEntries(link,items){
 if(Array.isArray(link?.document?.selectedQuantities))return link.document.selectedQuantities.map(x=>({...x}));
 const indices=link?.document?.selectedIndices??link?.selected_indices;
 return link?items.filter(x=>indices==null||indices.includes(x.index)).map(x=>({index:x.index,quantity:capacity(x),gross:x.gross})):[];
}
export function allocationRows(preview,links=[],project=null,blocked=[]){
 return preview.items.map(item=>{
  const reservations=links.filter(l=>l.kind==='purchases'&&l.project_id!==project).flatMap(l=>savedEntries(l,preview.items).filter(e=>e.index===item.index).map(e=>({...e,name:l.project_name||l.project_id})));
  const used=reservations.reduce((s,e)=>s+Number(e.quantity),0),usedGross=round(reservations.reduce((s,e)=>s+Number(e.gross??(item.gross*e.quantity/capacity(item))),0));
  const available=blocked.includes(item.index)?0:Math.max(0,Math.round((capacity(item)-used)*1e6)/1e6);
  return {...item,capacity:capacity(item),available,usedGross,reservations,blocked:blocked.includes(item.index)};
 });
}
export function quantitySelection(preview,entries,rows=allocationRows(preview)){
 if(!Array.isArray(entries)||!entries.length)throw Error('Zaznacz przynajmniej jedną pozycję.');
 const seen=new Set(),selected=[],normalized=[];
 for(const entry of [...entries].sort((a,b)=>a.index-b.index)){
  const row=rows.find(x=>x.index===Number(entry.index)),n=Number(entry.quantity);
  if(!row||seen.has(row.index)||!Number.isFinite(n)||n<=0||n!==Math.round(n*1e6)/1e6)throw Error('Wybierz poprawne pozycje i ilości (do 6 miejsc po przecinku).');
  if(n>row.available+1e-8)throw Error('Pozycja „'+(row.name||row.index)+'”: dostępne '+qty(row.available)+'. Odśwież przypisania, jeśli zmieniły się w innym oknie.');
  seen.add(row.index);
  const gross=round(n===row.available?Number(row.gross)-row.usedGross:(Number(row.gross)>=0?Math.min:Math.max)(Number(row.gross)-row.usedGross,round(Number(row.gross)*n/row.capacity)));
  normalized.push({index:row.index,quantity:n,gross});selected.push({...preview.items.find(x=>x.index===row.index),quantity:n,gross,invoiceQuantity:row.quantity});
 }
 const full=normalized.length===preview.items.length&&normalized.every(e=>e.quantity===capacity(preview.items.find(x=>x.index===e.index)));
 if(!preview.canSelect&&!full)throw Error('Ta faktura wymaga przypisania w całości.');
 if(!preview.canSelect&&rows.some(r=>r.reservations.length||r.blocked))throw Error('Cała faktura jest już przypisana.');
 const total=preview.canSelect?round(normalized.reduce((s,e)=>s+e.gross,0)):Number(preview.gross);
 if(!Number.isFinite(total)||total<0||total>Number(preview.gross)+.001)throw Error('Nieprawidłowa kwota wybranych pozycji.');
 return {entries:normalized,indices:normalized.map(e=>e.index),items:selected,total,description:selected.map(x=>[x.name,qty(x.quantity),x.unit].filter(Boolean).join(' ')).join('; ')};
}
export function allocationMarkup(preview,links,project,blocked=[],chosen=null){
 const rows=allocationRows(preview,links,project,blocked),own=links.find(l=>l.project_id===project&&l.kind==='purchases');
 const selected=chosen??savedEntries(own,preview.items);
 return `<section class="ksef-allocation"><h3>Pozycje faktury zakupowej</h3><p class="muted">Wybierz pozycje i ilości dla tej inwestycji. Ilości przypisane gdzie indziej są już odjęte od dostępnych.</p>${preview.warning?`<p class="notice">${esc(preview.warning)}</p>`:''}<div class="actions"><button type="button" data-allocation-all>Zaznacz dostępne</button><button type="button" data-allocation-none>Odznacz wszystkie</button></div><div class="allocation-items">${rows.map(row=>{
  const entry=selected.find(e=>e.index===row.index),n=entry?.quantity??row.available,checked=!!entry;
  return `<div class="allocation-item ${row.available===0?'unavailable':''}"><label class="allocation-name"><input type="checkbox" data-allocation-check="${row.index}" ${checked?'checked':''} ${row.available===0||!preview.canSelect?'disabled':''}><span><strong>${esc(row.name||'Pozycja '+row.index)}</strong><small>Na fakturze: ${qty(row.capacity)} ${esc(row.unit||'')} · ${row.gross==null?'—':money(row.gross)} · Dostępne: ${qty(row.available)} ${esc(row.unit||'')}</small>${row.reservations.map(e=>`<small>Przypisano: ${esc(e.name)} · ${qty(e.quantity)} ${esc(row.unit||'')}</small>`).join('')}${row.blocked?'<small>Pozycja jest kosztem w CleanFleet.</small>':''}</span></label><label class="allocation-quantity">Ilość do inwestycji<input type="number" inputmode="decimal" min="0.000001" max="${row.available}" step="any" value="${n}" data-allocation-quantity="${row.index}" ${row.available===0||!preview.canSelect||!checked?'disabled':''}></label><strong data-allocation-value="${row.index}"></strong></div>`;
 }).join('')}</div><p class="notice" data-allocation-total aria-live="polite"></p><p class="error" data-allocation-error role="alert"></p></section>`;
}
export function mountAllocation(root,preview,links,project,blocked=[],onChange=()=>{}){
 const rows=allocationRows(preview,links,project,blocked),section=root.querySelector('.ksef-allocation'),boxes=[...section.querySelectorAll('[data-allocation-check]')];
 const field=box=>section.querySelector(`[data-allocation-quantity="${box.dataset.allocationCheck}"]`);
 const read=()=>quantitySelection(preview,boxes.filter(b=>b.checked).map(b=>({index:Number(b.dataset.allocationCheck),quantity:Number(field(b).value)})),rows);
 const update=(changed=false)=>{
  for(const box of boxes)field(box).disabled=box.disabled||!box.checked;
  try{const selection=read();section.querySelector('[data-allocation-total]').textContent=`Do inwestycji: ${money(selection.total)} · ${selection.indices.length} z ${preview.items.length} pozycji · cała faktura: ${money(preview.gross)}`;section.querySelector('[data-allocation-error]').textContent='';for(const box of boxes)section.querySelector(`[data-allocation-value="${box.dataset.allocationCheck}"]`).textContent=selection.entries.find(e=>e.index===Number(box.dataset.allocationCheck))?money(selection.entries.find(e=>e.index===Number(box.dataset.allocationCheck)).gross):'';onChange(selection,changed,null);}catch(error){section.querySelector('[data-allocation-error]').textContent=error.message;section.querySelector('[data-allocation-total]').textContent='Wybierz dostępne pozycje i ilości.';onChange(null,changed,error);}
 };
 for(const box of boxes){box.onchange=()=>update(true);field(box).oninput=()=>update(true);}
 section.querySelector('[data-allocation-all]').onclick=()=>{for(const box of boxes)if(!box.disabled){box.checked=true;field(box).value=rows.find(r=>r.index===Number(box.dataset.allocationCheck)).available;}update(true);};
 section.querySelector('[data-allocation-none]').onclick=()=>{for(const box of boxes)if(!box.disabled)box.checked=false;update(true);};
 update();return {read};
}
