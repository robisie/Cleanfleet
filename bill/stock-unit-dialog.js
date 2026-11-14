import {unitKey,unitReview,unitSuggestion,unitDisplay,UNIT_CHOICES} from './stock-units.js?v=1.0.1';
import {esc} from './core.js?v=1.0.38';

// Only displays warehouse source unit labels, without writing any invoice or receipt content.
export function openStockUnitDialog({rows,aliases={},save,remove,onChange}){
 const dialog=document.createElement('dialog');
 dialog.className='scroll-modal kf-assignment-modal kf-unit-modal';
 let mapping={...aliases},index=0,pending=false;
 const candidates=()=>unitReview(rows,mapping);
 const mappingRows=()=>Object.entries(mapping).sort(([a],[b])=>a.localeCompare(b,'pl'));
 const close=()=>{dialog.close();dialog.remove();};
 const render=()=>{
  const unresolved=candidates(),current=unresolved[Math.min(index,Math.max(0,unresolved.length-1))];
  if(index>=unresolved.length)index=0;
  const choices=UNIT_CHOICES.map(u=>`<option value="${esc(u)}" ${current?.suggested===u?'selected':''}>${esc(u)}</option>`).join('');
  dialog.innerHTML=`<div class="kf-unit-dialog"><header><h2>Uporządkuj jednostki</h2><button type="button" data-unit-close aria-label="Zamknij">×</button></header><div class="modal-body">
   <p class="muted">Zmiany dotyczą wyłącznie nazw i podsumowań w Magazynie ROBISIĘ. Faktury KSeF, wystawione faktury, oryginalne dane paragonów i ich skany pozostają bez zmian. Jednostki różniące się wielkością liter normalizujemy automatycznie.</p>
   <p><strong>${unresolved.length}</strong> nierozpoznanych zapisów jednostek · <strong>${mappingRows().length}</strong> własnych powiązań.</p>
   ${current?`<section class="kf-unit-proposal"><span class="muted">Jednostka z dokumentu · ${current.count} wystąpień</span><h3>${esc(current.raw)}</h3><p class="muted">Przykładowa pozycja: ${esc(current.example||'—')}</p><label class="field">Jaka to jednostka w Magazynie?
    <select data-unit-choice><option value="" ${current.suggested?'':'selected'}>Wybierz odpowiednik…</option>${choices}<option value="__separate">Pozostaw jako osobną jednostkę</option><option value="__custom">Dodaj inną jednostkę do wzorca…</option></select></label>
    <label class="field" data-unit-custom-wrap hidden>Nowa jednostka<input data-unit-custom maxlength="40" placeholder="np. wiadro"></label>
    ${current.suggested?`<p class="muted">Propozycja: <strong>${esc(current.suggested)}</strong>. Dopasowanie zostanie zapamiętane dopiero po Twoim potwierdzeniu.</p>`:''}
   <div class="actions"><button type="button" data-unit-skip>Pomiń teraz</button><button type="button" data-unit-save class="primary">Zatwierdź i zapamiętaj</button></div></section>`:'<p class="notice">Wszystkie znalezione jednostki mają zatwierdzoną interpretację albo należą do podstawowego słownika.</p>'}
   ${mappingRows().length?`<details class="kf-unit-saved"><summary>Zapisane własne powiązania (${mappingRows().length})</summary>${mappingRows().map(([key,canonical])=>`<div class="kf-unit-saved-row"><span><strong>${esc(key)}</strong> → ${esc(canonical)}</span><button type="button" data-unit-remove="${esc(key)}" aria-label="Usuń powiązanie ${esc(key)}">Cofnij</button></div>`).join('')}</details>`:''}
   <p data-unit-error class="error" role="alert"></p></div><footer><button type="button" data-unit-close>Zamknij</button></footer></div>`;
  const selector=dialog.querySelector('[data-unit-choice]'),wrap=dialog.querySelector('[data-unit-custom-wrap]');
  if(selector)selector.onchange=()=>{wrap.hidden=selector.value!=='__custom';};
  dialog.querySelectorAll('[data-unit-close]').forEach(button=>button.onclick=close);
  dialog.querySelector('[data-unit-skip]')?.addEventListener('click',()=>{index++;if(index>=unresolved.length)index=0; // A skipped group remains visible; scroll forwards for this session.
   if(unresolved.length>1){const chosen=unresolved[(unresolved.indexOf(current)+1)%unresolved.length];index=candidates().findIndex(v=>v.key===chosen.key);}render();});
  dialog.querySelector('[data-unit-save]')?.addEventListener('click',async()=>{
   if(pending)return;
   let canonical=selector.value;
   if(canonical==='__separate')canonical=unitDisplay(current.raw,{});
   if(canonical==='__custom')canonical=dialog.querySelector('[data-unit-custom]').value.trim();
   const err=dialog.querySelector('[data-unit-error]');
   if(!canonical||canonical.length>40||/[^\p{L}\p{N}.²³ _/-]/u.test(canonical)){err.textContent='Wybierz prawidłową jednostkę (do 40 znaków).';return;}
   pending=true;try{await save({key:current.key,canonical});mapping[current.key]=canonical;index=0;onChange({...mapping});render();}
   catch(error){err.textContent='Nie zapisano powiązania: '+error.message;}
   finally{pending=false;}
  });
  dialog.querySelectorAll('[data-unit-remove]').forEach(button=>button.onclick=async()=>{
   if(pending)return;pending=true;try{const key=button.dataset.unitRemove;await remove(key);delete mapping[key];index=0;onChange({...mapping});render();}
   catch(error){const err=dialog.querySelector('[data-unit-error]');if(err)err.textContent='Nie udało się cofnąć: '+error.message;}
   finally{pending=false;}
  });
 };
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 document.body.append(dialog);render();dialog.showModal();
}
