import * as C from './core.js?v=1.0.67';
import * as B from './purchase-settlement.js?v=1.0.67';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function markup(project,documents){
 const sources=B.sources(project,documents),unlinked=(project.receipts||[]).filter(r=>r.kind==='materials'&&!(project.invoiceSettlements||[]).some(i=>(i.existingReceipts||[]).some(x=>x.id===r.id)));
 const row=(s,i)=>`<section class="bulk-source"><label class="inline-check"><input type="checkbox" id="bulk-source-${i}"><strong>${s.type==='invoice'?'Faktura '+esc(s.label):'Zaliczka · '+esc(s.date||'bez daty')}</strong></label>${s.type==='advance'?`<p class="muted">${esc(s.label)}</p>`:''}<p>Dostępne, już otrzymane: <strong>${C.money(s.available)}</strong></p><label class="field">Wykorzystaj z zapisanych pieniędzy (zł)<input id="bulk-existing-${i}" type="text" inputmode="decimal" value="${s.available}" ${s.available?'':'readonly'}></label>${s.type==='invoice'?`<details id="bulk-extra-${i}"><summary>Dopisz nową wpłatę lub powiąż zaliczkę</summary><p class="muted">Jeśli wpływ jest już zapisany jako zaliczka, zaznacz ją poniżej. Kwotę nowej wpłaty wpisuj tylko dla dodatkowo otrzymanych pieniędzy.</p>${unlinked.map((r,j)=>`<label class="inline-check"><input type="checkbox" id="bulk-link-${i}-${j}">Ta faktura dokumentuje zaliczkę ${C.money(r.amount)} · ${esc(r.date||'bez daty')} · ${esc(r.note||'')}</label>`).join('')}<label class="field">Nowa, dodatkowo otrzymana wpłata (zł)<input id="bulk-new-${i}" type="text" inputmode="decimal" value="0"></label><p class="muted">Maksymalnie przed powiązaniem zaliczek: ${C.money(s.capacity)}.</p><button type="button" id="bulk-fill-${i}">Wpisz pozostałą kwotę faktury</button></details>`:''}</section>`;
 return `<p>Pula dostępnych, otrzymanych pieniędzy: <strong>${C.money(sources.reduce((sum,s)=>sum+s.available,0))}</strong>. Wybierz zaliczki i faktury sprzedażowe do rozliczenia. Zakupy zostaną rozliczone od najstarszych. Istniejące rozliczenia pozostaną zachowane.</p><button type="button" id="bulk-select-available">Zaznacz dostępne zaliczki i wpływy</button><p class="muted">Zaliczka powiązana już z fakturą jest pokazana wyłącznie przy tej fakturze.</p><div class="bulk-sources">${sources.map(row).join('')||'<p>Brak dostępnych zaliczek i faktur sprzedażowych. Dodaj zaliczkę lub przypisz fakturę sprzedażową do inwestycji.</p>'}</div><label class="field">Data nowych wpłat z faktur<input id="bulk-date" type="date" value="${C.today()}"></label><h3>Podgląd rozliczenia</h3><div id="bulk-preview" aria-live="polite"></div><p id="bulk-error" class="error" role="alert"></p>`;
}
export function mount(root,project,documents){
 const $=s=>root.querySelector(s),sources=B.sources(project,documents),unlinked=(project.receipts||[]).filter(r=>r.kind==='materials'&&!(project.invoiceSettlements||[]).some(i=>(i.existingReceipts||[]).some(x=>x.id===r.id)));
 const value=id=>String($(id)?.value??0).trim().replace(',','.');
 const read=()=>({choices:sources.flatMap((s,i)=>$('#bulk-source-'+i).checked?[{key:s.key,amount:value('#bulk-existing-'+i),newAmount:s.type==='invoice'?value('#bulk-new-'+i):0,date:$('#bulk-date').value}]:[]),links:sources.flatMap((s,i)=>s.type==='invoice'&&$('#bulk-source-'+i).checked?unlinked.filter((r,j)=>$('#bulk-link-'+i+'-'+j).checked).map(r=>({invoiceId:s.id,receiptId:r.id})):[])});
 let result=null;
 const update=()=>{
  result=null;const selection=read();$('#bulk-error').textContent='';
  if(!selection.choices.length){$('#bulk-preview').innerHTML='<p class="muted">Zaznacz źródła pieniędzy powyżej, aby zobaczyć podział na zakupy.</p>';return;}
  try{
   result=B.plan(project,documents,selection.choices,selection.links);
   $('#bulk-preview').innerHTML=`<p>Wybrano: <strong>${C.money(result.selected)}</strong> · Na zakupy: <strong>${C.money(result.allocated)}</strong> · Pozostanie do wykorzystania: <strong>${C.money(result.unallocated)}</strong></p><p>${result.newMoney?`Zapisana zostanie nowa wpłata: <strong>${C.money(result.newMoney)}</strong>.`:'Rozliczenie korzysta wyłącznie z wcześniej zapisanych wpłat.'}</p><div class="tablewrap"><table><thead><tr><th>Zakup</th><th>Rozliczane teraz</th><th>Pozostanie</th></tr></thead><tbody>${result.purchases.map(p=>`<tr><td><strong>${esc(p.shop||'Zakup')}</strong><br>${esc(p.invoice||'')} · ${esc(p.description||'')}<p class="muted">${result.allocations.filter(a=>a.purchaseId===p.id).map(a=>esc(a.sourceLabel)+': '+C.money(a.amount)).join('<br>')}</p></td><td class="num">${C.money(p.allocated)}</td><td class="num">${C.money(p.remaining)}<br>${p.state==='full'?'Rozliczony w całości':'Rozliczony częściowo'}</td></tr>`).join('')}</tbody></table></div>`;
  }catch(error){$('#bulk-preview').innerHTML='';$('#bulk-error').textContent=error.message;}
 };
 sources.forEach((s,i)=>{
  $('#bulk-source-'+i).onchange=()=>{if(s.type==='invoice'&&$('#bulk-source-'+i).checked&&!s.available)$('#bulk-extra-'+i).open=true;update();};$('#bulk-existing-'+i).oninput=update;
  if(s.type==='invoice'){
   $('#bulk-new-'+i).oninput=()=>{$('#bulk-source-'+i).checked=true;update();};
   $('#bulk-fill-'+i).onclick=()=>{$('#bulk-source-'+i).checked=true;$('#bulk-new-'+i).value=C.round(Math.max(0,s.capacity-unlinked.filter((r,j)=>$('#bulk-link-'+i+'-'+j).checked).reduce((sum,r)=>sum+C.number(r.amount),0)));$('#bulk-extra-'+i).open=true;update();};
   unlinked.forEach((r,j)=>{$('#bulk-link-'+i+'-'+j).onchange=()=>{if($('#bulk-link-'+i+'-'+j).checked){$('#bulk-source-'+i).checked=true;const index=sources.findIndex(x=>x.key==='advance:'+r.id);if(index>=0)$('#bulk-source-'+index).checked=true;}update();};});
  }
 });
 $('#bulk-select-available').onclick=()=>{sources.forEach((s,i)=>{$('#bulk-source-'+i).checked=s.available>0;});update();};$('#bulk-date').onchange=update;update();
 return {read(){const selection=read();return B.plan(project,documents,selection.choices,selection.links);},update};
}
