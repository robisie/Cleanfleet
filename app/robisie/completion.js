import * as C from './core.js?v=1.0.67';
const cents=value=>Math.round(C.number(value)*100);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Payments are counted by the same engine as the rest of the investment.
// A sales invoice alone is never money received. Keep material/work balances
// separate: a material advance cannot silently settle labour.
export function summary(project){
 const t=C.totals(project),items=project.purchases||[];
 const materialCost=items.reduce((sum,item)=>sum+cents(Math.max(0,C.number(item.charge))),0);
 const materialReceived=cents(t.materials.advances),workCost=cents(Math.max(0,project.works?.length?C.round(t.works.done-t.workCredit):C.finalWorkAmount(project))),workReceived=cents(t.paid);
 const materialBalance=materialCost-materialReceived,workBalance=workCost-workReceived;
 const unallocated=items.reduce((sum,item)=>sum+cents(C.purchasePayment(item).remaining),0);
 return {materialCost:materialCost/100,materialReceived:materialReceived/100,materialBalance:materialBalance/100,workCost:workCost/100,workReceived:workReceived/100,workBalance:workBalance/100,unallocated:unallocated/100,
  due:(Math.max(0,materialBalance)+Math.max(0,workBalance))/100,refund:(Math.max(0,-materialBalance)+Math.max(0,-workBalance))/100,
  open:materialBalance!==0||workBalance!==0||unallocated>0,
  unfinished:(project.works||[]).filter(line=>line.included!==false&&!line.done&&C.number(line.qty)>0).length};
}
export function status(project){const s=summary(project);return s.open?'Do rozliczenia':'Rozliczona';}
const action=(action,label,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;
const row=(label,amount,cls='')=>`<div class="completion-line ${cls}"><span>${label}</span><strong>${C.money(amount)}</strong></div>`;
function balance(amount){return row(amount>0?'Do dopłaty':amount<0?'Do zwrotu':'Rozliczono',Math.abs(amount),amount?'completion-balance outstanding':'completion-balance positive');}
export function markup(project,documents=[]){
 const s=summary(project),sales=documents.filter(d=>d.number&&d.status!=='draft'&&d.originKind!=='purchases'&&!d.referenceOnly&&!d.payload?.correction&&d.payload?.currency==='PLN');
 return `<p class="muted">${esc(project.name)} · ${esc(project.investor)}</p><div class="completion-columns">
 <section class="completion-section"><h3>Materiały</h3>${row('Koszt dla inwestora',s.materialCost)}${row('Otrzymane środki na materiały',s.materialReceived)}${balance(s.materialBalance)}
 <p class="muted">Do przypisania do zakupów: <strong>${C.money(s.unallocated)}</strong>. Przypisanie wykorzystuje zapisane pieniądze i nie zwiększa wpłat.</p><div class="actions">${action('completion-purchases','Rozlicz zakupy',s.unallocated<=0?'disabled':'')}${action('completion-receipt','Dodaj wpłatę','data-kind="materials"')}</div></section>
 <section class="completion-section"><h3>Robocizna</h3>${row('Wykonane prace po rabatach i obniżkach',s.workCost)}${row('Otrzymane wpłaty za prace',s.workReceived)}${balance(s.workBalance)}
 ${s.unfinished?`<p class="notice">${s.unfinished} poz. nie oznaczono jako wykonane. Ich wartość nie jest doliczana do rozliczenia zamknięcia ani nowego wpisu w zarobkach.</p>`:''}<div class="actions">${action('completion-receipt','Dodaj wpłatę','data-kind="work"')}${action('completion-work-paid','Otrzymano pozostałą kwotę',s.workBalance<=0?'disabled':'')}</div></section></div>
 <section class="completion-section"><h3>Faktury i wcześniejsze wpłaty</h3><p class="muted">Wybierz fakturę, aby powiązać wcześniejszą wpłatę albo zapisać nowy wpływ. Samo wystawienie lub przypisanie faktury nie oznacza zapłaty.</p>
 ${sales.length?`<label class="field">Faktura sprzedażowa<select id="completion-invoice">${sales.map(d=>`<option value="${esc(d.id)}">${esc(d.number)}</option>`).join('')}</select></label><div class="actions">${action('completion-invoice-link','Powiąż wcześniejszą wpłatę / rozlicz fakturę')}${action('completion-invoice-paid','Zapłacona')}</div>`:'<p class="muted">Brak faktur sprzedażowych do rozliczenia w PLN.</p>'}
 <div class="actions"><a class="button" data-action="stage-invoice" href="/bill/?new=1&amp;brand=robisie&amp;source=${encodeURIComponent(project.id||'')}" target="_blank" rel="noopener">Wystaw fakturę w Bill</a>${action('completion-refresh','Odśwież rozliczenie')}</div></section>
 <section class="completion-total" aria-live="polite"><h3>Podsumowanie zamknięcia</h3>${row('Łącznie do dopłaty',s.due)}${row('Łącznie do zwrotu',s.refund)}<p class="muted">Saldo materiałów i robocizny pozostaje osobne. Nadwyżka w jednej części nie rozlicza automatycznie drugiej.</p>${s.open?'<p class="notice">Możesz zakończyć inwestycję z otwartym rozliczeniem. Zachowa oznaczenie „Do rozliczenia”.</p>':'<p class="positive">Materiały i robocizna są rozliczone.</p>'}<p>Dodanie do Moich zarobków będzie osobnym krokiem po zakończeniu.</p></section>`;
}
