import * as C from './core.js?v=1.0.78';
import * as P from './purchase-payments.js?v=1.0.68';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const markup=`<section class="purchase-settlement"><h3>Rozliczenie zakupu z inwestorem</h3><p class="muted">Wybierz status oraz źródło pieniędzy otrzymanych od inwestora. Faktura zakupowa zapisuje koszt materiałów. <a href="/bill/?ksef=1" target="_blank" rel="noopener">Przypisz kolejną fakturę sprzedażową w Bill</a> — potem otwórz ten zakup ponownie.</p><label class="field">Status<select id="purchase-payment-state"><option value="unpaid">Nieopłacone</option><option value="partial">Opłacono częściowo</option><option value="full">Opłacono w całości</option></select></label><div id="purchase-payment-rows"></div><button type="button" id="purchase-payment-add">Dodaj źródło rozliczenia</button><p id="purchase-payment-total" class="notice" aria-live="polite"></p><p id="purchase-payment-error" class="error" role="alert"></p><p class="muted small">Gotówka oznacza nową, faktycznie otrzymaną wpłatę. Kwotę zapisaną wcześniej wybierz jako „Wcześniejsza zaliczka”. Przy fakturze wpisujesz łączny otrzymany wpływ przypisany do tego zakupu. Usunięcie źródła odłącza wpłatę od zakupu i pozostawia ją jako zaliczkę.</p></section>`;
export function mount(root,project,item,invoices,getCharge){
 const $=s=>root.querySelector(s),documents=invoices.filter(P.eligible),available=P.advances(project,item.id);
 let entries=P.rows(project,item),edited=false;
 const state=$('#purchase-payment-state');state.value=C.purchasePayment(item).state;
 const take=()=>entries.map((r,i)=>({...r,source:$('#purchase-source-'+i)?.value??r.source,id:$('#purchase-document-'+i)?.value??r.id,amount:String($('#purchase-value-'+i)?.value??r.amount??'').replace(',','.'),date:$('#purchase-date-'+i)?.value??r.date}));
 const update=()=>{if(state.value!=='unpaid'&&!entries.some(r=>r.source==='legacy')){const actual=take().reduce((s,r)=>s+C.number(r.amount),0);if(actual>0)state.value=actual>=getCharge()?'full':'partial';}const paid=state.value==='unpaid'?0:take().reduce((s,r)=>s+C.number(r.amount),0);$('#purchase-payment-total').textContent=`Rozliczono: ${C.money(paid)} z ${C.money(getCharge())} · Pozostało: ${C.money(Math.max(0,C.round(getCharge()-paid)))}`;$('#purchase-payment-rows').hidden=state.value==='unpaid';$('#purchase-payment-add').hidden=state.value==='unpaid';try{P.apply(project,{...item,charge:getCharge()},{state:state.value,rows:take(),unchanged:!edited},invoices);$('#purchase-payment-error').textContent='';}catch(error){$('#purchase-payment-error').textContent=paid<=0&&state.value!=='unpaid'?'Wybierz źródło i wpisz kwotę rozliczenia albo użyj „Uzupełnij pozostałą kwotę”.':error.message;}};
 const fillRemaining=i=>{
  const entry=entries[i],others=entries.reduce((sum,r,j)=>sum+(j===i?0:C.number(r.amount)),0);
  let limit=Math.max(0,C.round(getCharge()-others));
  if(entry.source==='advance'){
   const receipt=available.find(a=>a.id===entry.id),used=entries.reduce((sum,r,j)=>sum+(j!==i&&r.source==='advance'&&r.id===entry.id?C.number(r.amount):0),0);
   limit=Math.min(limit,Math.max(0,C.round(C.number(receipt?.available)-used)));
  }
  entry.amount=limit;
 };
 const draw=()=>{
  $('#purchase-payment-rows').innerHTML=entries.map((r,i)=>{
   const options=r.source==='invoice'?documents.map(d=>({id:d.id,label:d.number+' · '+(d.externalKsef?'KSeF':'Bill')})):r.source==='advance'?available.map(a=>({id:a.id,label:C.money(a.available)+' · '+(a.date||'')+' · '+(a.note||'Zaliczka')})):[];
   return `<div class="purchase-payment-row"><label class="field">Źródło<select id="purchase-source-${i}">${[['cash','Gotówka — nowa wpłata'],['invoice','Faktura sprzedażowa — Bill / KSeF'],['advance','Wcześniejsza zaliczka'],...(r.source==='legacy'?[['legacy','Rozliczenie historyczne']]:[])].map(([key,label])=>`<option value="${key}" ${r.source===key?'selected':''}>${label}</option>`).join('')}</select></label>${options.length||['invoice','advance'].includes(r.source)?`<label class="field">${r.source==='invoice'?'Faktura sprzedażowa tej inwestycji':'Zapisana zaliczka'}<select id="purchase-document-${i}"><option value="">Wybierz…</option>${options.map(o=>`<option value="${esc(o.id)}" ${r.id===o.id?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`:''}<label class="field">${r.source==='invoice'?'Faktycznie otrzymano na ten zakup (zł)':'Kwota rozliczenia (zł)'}<input id="purchase-value-${i}" type="text" inputmode="decimal" autocomplete="off" min="0" value="${C.number(r.amount)}" ${r.source==='legacy'?'readonly':''}></label><label class="field">Data wpłaty<input id="purchase-date-${i}" type="date" value="${esc(r.date||C.today())}" ${['legacy','advance'].includes(r.source)?'readonly':''}></label><div class="actions"><button type="button" id="purchase-rest-${i}">Uzupełnij pozostałą kwotę</button><button type="button" id="purchase-remove-${i}">Odłącz źródło</button></div></div>`;
  }).join('')||'<p class="muted">Dodaj gotówkę, wcześniejszą zaliczkę lub fakturę sprzedażową.</p>';
  entries.forEach((r,i)=>{
   $('#purchase-source-'+i).value=r.source;$('#purchase-value-'+i).value=r.amount;$('#purchase-date-'+i).value=r.date||C.today();
   if($('#purchase-document-'+i))$('#purchase-document-'+i).value=r.id||'';
   $('#purchase-source-'+i).onchange=()=>{entries=take();entries[i]={source:entries[i].source,amount:0,date:C.today()};if(entries[i].source==='advance'&&available.length===1){entries[i].id=available[0].id;entries[i].date=available[0].date||C.today();fillRemaining(i);}edited=true;draw();};
   const doc=$('#purchase-document-'+i);if(doc)doc.onchange=()=>{entries=take();const entry=entries[i];if(entry.source==='advance'){entry.date=available.find(a=>a.id===entry.id)?.date||C.today();fillRemaining(i);}edited=true;draw();};
   for(const key of ['value','date'])$('#purchase-'+key+'-'+i).oninput=()=>{edited=true;update();};
   $('#purchase-rest-'+i).onclick=()=>{entries=take();fillRemaining(i);edited=true;draw();};
   $('#purchase-remove-'+i).onclick=()=>{entries=take().filter((_,j)=>j!==i);edited=true;draw();};
  });update();
 };
 state.onchange=()=>{edited=true;entries=take();if(state.value!=='unpaid'&&!entries.length)entries.push({source:'cash',amount:0,date:C.today()});if(state.value==='full'&&entries.length===1&&entries[0].source!=='legacy')fillRemaining(0);draw();};
 $('#purchase-payment-add').onclick=()=>{entries=take();entries.push({source:'cash',amount:0,date:C.today()});edited=true;draw();};draw();
 return {read:()=>({state:state.value,rows:take(),unchanged:!edited}),update};
}
