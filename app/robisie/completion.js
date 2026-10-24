import * as C from './core.js?v=1.0.78';
import * as I from './invoices.js?v=1.0.68';
import * as B from './purchase-settlement.js?v=1.0.68';
import {eligible} from './purchase-payments.js?v=1.0.68';
const cents=value=>Math.round(C.number(value)*100);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Payments are counted by the same engine as the rest of the investment.
// A sales invoice alone is never money received. Keep material/work balances
// separate: a material advance cannot silently settle labour.
export function summary(project){
 // Mixed settlements use one cash pool. The material-first split is analytical, not a new receipt.
 const t=C.totals(project),items=project.purchases||[];
 const materialCost=items.reduce((sum,item)=>sum+cents(Math.max(0,C.number(item.charge))),0);
 const pooled=project.mixedSettlement,receivedTotal=cents(t.materials.advances+t.paid);
 const materialReceived=pooled?Math.min(materialCost,receivedTotal):cents(t.materials.advances),workCost=cents(Math.max(0,project.works?.length?C.round(t.works.done-t.workCredit):C.finalWorkAmount(project))),workReceived=pooled?receivedTotal-materialReceived:cents(t.paid);
 const materialBalance=materialCost-materialReceived,workBalance=workCost-workReceived;
 const unallocated=pooled?0:items.reduce((sum,item)=>sum+cents(C.purchasePayment(item).remaining),0);
 return {materialCost:materialCost/100,materialReceived:materialReceived/100,materialBalance:materialBalance/100,workCost:workCost/100,workReceived:workReceived/100,workBalance:workBalance/100,unallocated:unallocated/100,
  due:(pooled?Math.max(0,materialBalance+workBalance):Math.max(0,materialBalance)+Math.max(0,workBalance))/100,refund:(pooled?Math.max(0,-materialBalance-workBalance):Math.max(0,-materialBalance)+Math.max(0,-workBalance))/100,
  open:materialBalance!==0||workBalance!==0||unallocated>0,
  unfinished:(project.works||[]).filter(line=>line.included!==false&&!line.done&&C.number(line.qty)>0).length};
}
export function status(project){const s=summary(project);return s.open?'Do rozliczenia':'Rozliczona';}
export function invoiceSummaries(project,documents){
 const sources=B.sources(project,documents),seen=new Set();
 return documents.filter(eligible).filter(d=>{if(seen.has(d.id))return false;seen.add(d.id);return true;}).map(d=>{
  const record=(project.invoiceSettlements||[]).find(r=>r.id===d.id),total=cents(I.amount(d)),received=cents(I.paid(record));
  const work=(record?.allocations||[]).filter(a=>a.kind==='work'||a.kind==='stage').reduce((s,a)=>s+cents(a.paid),0)+(record?.existingReceipts||[]).filter(r=>r.kind==='work').reduce((s,r)=>s+cents(r.amount),0);
  const available=cents(sources.find(s=>s.key==='invoice:'+d.id)?.available),materials=Math.max(0,received-work-available),used=materials+work;
  return {id:d.id,number:d.number,total:total/100,received:received/100,materials:materials/100,work:work/100,available:available/100,remaining:Math.max(0,total-used)/100,unpaid:Math.max(0,total-received)/100};
 });
}

// Prepare a single atomic project save. Reuse recorded money first, then record
// only the shortfall explicitly confirmed by the user. New money fills unpaid
// sales invoices before it becomes a separate receipt. Existing dates, receipt
// links and allocations survive; labour and material purposes remain separate.
export function settleAll(project,documents,date=C.today()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Podaj prawidłową datę wpłaty.');
 let next=structuredClone(project);const additions=[],before=summary(project);
 const allocate=()=>{
  if(!B.purchases(next).length)return;
  const choices=B.sources(next,documents).filter(s=>s.available>0).map(s=>({key:s.key,amount:s.available,newAmount:0}));
  if(choices.length)next=B.plan(next,documents,choices).project;
 };
 allocate();
 const invoices=documents.filter(eligible).slice().sort((a,b)=>String(a.payload.issueDate||'').localeCompare(String(b.payload.issueDate||''))||String(a.id).localeCompare(String(b.id)));
 for(const kind of ['materials','work']){
  const state=summary(next);let remaining=Math.max(0,cents(kind==='materials'?state.materialBalance:state.workBalance));
  for(const invoice of [...invoices,null]){
   if(!remaining)break;
   const record=invoice?(next.invoiceSettlements||[]).find(r=>r.id===invoice.id):null,room=invoice?Math.max(0,cents(I.amount(invoice))-cents(I.paid(record))):remaining,take=Math.min(remaining,room);
   if(!take)continue;
   const receipt={id:C.uid(),kind,amount:take/100,date,stageId:'',note:'Uregulowano całość — '+(kind==='materials'?'materiały':'wykonane prace')+(invoice?' · faktura '+invoice.number:'')};
   next.receipts||=[];next.receipts.push(receipt);
   if(invoice)next=I.markPaid(next,invoice,{amount:0,date,kind,receiptIds:[receipt.id]});
   additions.push({kind,amount:take/100,invoiceId:invoice?.id||null,number:invoice?.number||'Wpłata bez faktury'});remaining-=take;
  }
 }
 allocate();I.refreshReceiptLinks(next);
 const after=summary(next),newMoney=additions.reduce((s,r)=>s+cents(r.amount),0)/100;
 if(after.due>0||after.unallocated>0)throw Error('Nie można automatycznie rozliczyć tych zakupów. Sprawdź przypisane koszty i wcześniejsze wpłaty.');
 return {project:next,before,after,additions,newMoney,allocated:C.round(before.unallocated-after.unallocated),invoices:invoiceSummaries(next,documents)};
}

export function invoicesMarkup(project,documents){
 const rows=invoiceSummaries(project,documents);
 return rows.length?`<div class="completion-invoices">${rows.map(r=>`<section class="completion-invoice"><h4>Faktura ${esc(r.number)}</h4><span class="tag ${r.remaining?'odbior':'prace'}">${r.remaining?(r.materials+r.work>0?'Częściowo rozliczona':'Do rozliczenia'):'Rozliczona'}</span>${row('Kwota faktury',r.total)}${row('Otrzymano',r.received)}${row('Rozliczono na zakupy materiałów',r.materials)}${row('Rozliczono na robociznę',r.work)}${row('Pozostało do rozliczenia',r.remaining,'completion-balance')}${row('Otrzymane, jeszcze niewykorzystane',r.available)}${row('Pozostało do zapłaty z faktury',r.unpaid)}</section>`).join('')}</div>`:'';
}
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
 <section class="completion-section"><h3>Faktury i wcześniejsze wpłaty</h3>${invoicesMarkup(project,documents)}<p class="muted">„Pozostało do rozliczenia” obejmuje niewykorzystane wpłaty oraz niezapłaconą część faktury. Wybierz fakturę, aby powiązać wcześniejszą wpłatę albo zapisać nowy wpływ. Samo wystawienie lub przypisanie faktury nie oznacza zapłaty.</p>
 ${sales.length?`<label class="field">Faktura sprzedażowa<select id="completion-invoice">${sales.map(d=>`<option value="${esc(d.id)}">${esc(d.number)}</option>`).join('')}</select></label><div class="actions">${action('completion-invoice-link','Powiąż wcześniejszą wpłatę / rozlicz fakturę')}${action('completion-invoice-paid','Zapłacona')}</div>`:'<p class="muted">Brak faktur sprzedażowych do rozliczenia w PLN.</p>'}
 <div class="actions"><a class="button" data-action="stage-invoice" href="/bill/?new=1&amp;brand=robisie&amp;source=${encodeURIComponent(project.id||'')}" target="_blank" rel="noopener">Wystaw fakturę w Bill</a>${action('completion-refresh','Odśwież rozliczenie')}</div></section>
 <section class="completion-total" aria-live="polite"><h3>Podsumowanie zamknięcia</h3>${row('Łącznie do dopłaty',s.due)}${row('Łącznie do zwrotu',s.refund)}<div class="actions">${action('completion-settle-all','Uregulowano całość',s.due<=0&&s.unallocated<=0?'disabled class="primary"':'class="primary"')}</div><p class="muted">Rozlicz zakupy i wykonaną robociznę jednym zapisem. Najpierw wykorzystamy dostępne wpłaty, a brakującą kwotę pokażemy do potwierdzenia jako nowy wpływ. Saldo materiałów i robocizny pozostaje osobne. Nadwyżka w jednej części nie rozlicza automatycznie drugiej.</p>${s.open?'<p class="notice">Możesz zakończyć inwestycję z otwartym rozliczeniem. Zachowa oznaczenie „Do rozliczenia”.</p>':'<p class="positive">Materiały i robocizna są rozliczone.</p>'}<p>Dodanie do Moich zarobków będzie osobnym krokiem po zakończeniu.</p></section>`;
}
