// Native modal keeps keyboard, pointer and focus interaction away from the invoice list.
export function openKsefProgress(onCancel){
 if(typeof document==='undefined'||!document.createElement)return {update(){},close(){}};
 const dialog=document.createElement('dialog');dialog.className='kf-progress-dialog';dialog.setAttribute('aria-labelledby','kf-progress-title');
 dialog.innerHTML='<div class="kf-progress-content"><span class="kf-progress-spinner" aria-hidden="true"></span><h2 id="kf-progress-title">Pobieranie danych KSeF</h2><p data-progress-message role="status" aria-live="polite">Łączenie z KSeF…</p><p class="muted">Poczekaj na zakończenie. Lista faktur będzie dostępna po pobraniu i sprawdzeniu dokumentów.</p><button type="button" data-progress-cancel>Anuluj pobieranie</button></div>';
 const pageOverflow=document.documentElement.style.overflow,bodyOverflow=document.body.style.overflow;document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';
 const status=dialog.querySelector('[data-progress-message]'),cancel=dialog.querySelector('[data-progress-cancel]');let closed=false;
 cancel.onclick=()=>{if(cancel.disabled)return;cancel.disabled=true;status.textContent='Anulowanie pobierania…';onCancel();};
 dialog.oncancel=event=>event.preventDefault();
 document.body.append(dialog);dialog.showModal();
 return {update(text){if(!closed&&!cancel.disabled)status.textContent=text;},close(){if(closed)return;closed=true;dialog.close();dialog.remove();document.documentElement.style.overflow=pageOverflow;document.body.style.overflow=bodyOverflow;}};
}
