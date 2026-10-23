import {esc} from './core.js?v=1.0.37';

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const qty=value=>new Intl.NumberFormat('pl-PL',{maximumFractionDigits:6}).format(value);
const currency=row=>/^[A-Z]{3}$/.test(row.metadata.currency||'')?row.metadata.currency:'PLN';
const unit=row=>({szt:'szt.','szt.':'szt.',m2:'m²','m²':'m²',m3:'m³','m³':'m³'}[String(row.item.unit||'szt.').trim().toLowerCase()]||String(row.item.unit||'szt.').trim());
const money=(cents,code)=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:code}).format(cents/100);
const value=(row,quantity)=>number(row.capacity)>0?Math.round(number(row.item.gross)*number(quantity)/number(row.capacity)*100):0;
const quantities=row=>{
 const auto=number(row.classifiedAuto),company=number(row.classifiedCompany),cleanfleet=number(row.cleanfleetAssigned);
 return {purchased:number(row.capacity),assigned:number(row.assigned),available:number(row.available),returned:number(row.returned),auto,company,cleanfleet,robisie:row.projectAssigned==null?Math.max(0,number(row.assigned)-auto-company-cleanfleet):number(row.projectAssigned)};
};
const bucket=()=>({amounts:new Map(),units:new Map(),invoices:new Set(),positions:0});
function add(target,row,quantity){
 if(quantity<=0)return;
 const code=currency(row),u=unit(row);
 target.amounts.set(code,(target.amounts.get(code)||0)+value(row,quantity));
 target.units.set(u,(target.units.get(u)||0)+quantity);
 target.invoices.add(row.metadata.ksefNumber);target.positions++;
}
const amounts=map=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([code,cents])=>`<span>${esc(money(cents,code))}</span>`).join('')||'<span>0,00 zł</span>';
const units=map=>[...map].sort(([a],[b])=>a.localeCompare(b,'pl')).map(([u,n])=>`${qty(n)} ${esc(u)}`).join(' · ')||'—';

export function stockSummaryData(rows){
 const totals=Object.fromEntries(['purchased','assigned','available','returned','auto','company','cleanfleet','robisie'].map(key=>[key,bucket()]));
 const byUnit=new Map(),stores=new Map();
 for(const row of rows){
  const q=quantities(row),u=unit(row);
  if(!byUnit.has(u))byUnit.set(u,{purchased:0,assigned:0,returned:0,available:0,amounts:new Map()});
  const item=byUnit.get(u);
  for(const key of Object.keys(totals))add(totals[key],row,q[key]);
  for(const key of ['purchased','assigned','returned','available'])item[key]+=q[key];
  if(q.available>0)item.amounts.set(currency(row),(item.amounts.get(currency(row))||0)+value(row,q.available));
  const seller=row.metadata.seller||{},key=seller.nip||seller.name||'Nieznany sklep';
  if(!stores.has(key))stores.set(key,{name:seller.name||seller.nip||'Nieznany sklep',nip:seller.nip||'',purchased:bucket(),assigned:bucket(),returned:bucket(),available:bucket()});
  for(const field of ['purchased','assigned','returned','available'])add(stores.get(key)[field],row,q[field]);
 }
 return {totals,byUnit,stores};
}

export function stockSummaryMarkup(rows,{incomplete=false}={}){
 const {totals,byUnit,stores}=stockSummaryData(rows),dates=rows.map(r=>r.metadata.issueDate).filter(Boolean).sort();
 const conflicts=rows.filter(r=>r.conflict),warnings=rows.filter(r=>r.warning);
 const available=rows.filter(r=>number(r.available)>0).sort((a,b)=>String(b.metadata.issueDate||'').localeCompare(String(a.metadata.issueDate||''))||String(a.item.name).localeCompare(String(b.item.name),'pl'));
 const card=(label,key,featured=false)=>`<div class="kf-summary-metric ${featured?'kf-summary-featured':''}"><span>${label}</span><strong class="kf-summary-money">${amounts(totals[key].amounts)}</strong><small>${totals[key].positions} pozycji · ${totals[key].invoices.size} faktur</small></div>`;
 return `<section class="kf-stock-summary" aria-label="Podsumowanie magazynu">
  <h2>Podsumowanie magazynu</h2>
  <p class="muted">Wszystkie wczytane zakupy${dates.length?' · '+esc(dates[0])+' – '+esc(dates.at(-1)):''}. Podsumowanie obejmuje cały magazyn, niezależnie od filtrów listy.</p>
  ${incomplete?'<p class="notice">Część dokumentów nie została wczytana. Podsumowanie obejmuje tylko sprawdzone pozycje.</p>':''}
  ${conflicts.length?`<p class="notice error">${conflicts.length} pozycji wymaga sprawdzenia: przypisania i zwroty przekraczają zakupioną ilość. Bilans tych pozycji może się nie zgadzać.</p>`:''}
  ${warnings.length?`<p class="notice">${warnings.length} pozycji ma korekty wymagające ręcznego sprawdzenia. Zobacz komunikaty przy towarach.</p>`:''}
  <div class="kf-stock-summary-grid">${card('Na stanie','available',true)}${card('Przypisane koszty','assigned')}${card('Zwrócono','returned')}${card('Zakupy razem','purchased')}</div>
  <p class="kf-summary-stock-quantity"><strong>Ilości na stanie:</strong> ${units(totals.available.units)}</p>
  <h3>Na co poszły zakupy</h3>
  <div class="kf-stock-summary-grid kf-summary-destinations">${[['Koszty firmowe','company'],['Auto','auto'],['CleanFleet','cleanfleet'],['Robisię · inwestycje','robisie']].map(([label,key])=>`<div class="kf-summary-metric"><span>${label}</span><strong class="kf-summary-money">${amounts(totals[key].amounts)}</strong><small>${totals[key].positions} pozycji · ${totals[key].invoices.size} faktur</small><p>${units(totals[key].units)}</p></div>`).join('')}</div>
  <h3>Stan ilościowy według jednostek</h3>
  <div class="kf-summary-table-wrap"><table class="kf-summary-table"><thead><tr><th>Jednostka</th><th>Zakupiono</th><th>Przypisano</th><th>Zwrócono</th><th>Na stanie</th><th>Wartość na stanie</th></tr></thead><tbody>${[...byUnit].sort(([a],[b])=>a.localeCompare(b,'pl')).map(([u,q])=>`<tr><th>${esc(u)}</th><td>${qty(q.purchased)}</td><td>${qty(q.assigned)}</td><td>${qty(q.returned)}</td><td><strong>${qty(q.available)}</strong></td><td class="kf-summary-money">${amounts(q.amounts)}</td></tr>`).join('')||'<tr><td colspan="6">Brak towarów.</td></tr>'}</tbody></table></div>
  <h3>Zakupy według sklepów i wystawców</h3>
  <div class="kf-summary-table-wrap"><table class="kf-summary-table"><thead><tr><th>Sklep / wystawca</th><th>Faktury</th><th>Zakupy razem</th><th>Przypisane koszty</th><th>Zwrócono</th><th>Na stanie</th></tr></thead><tbody>${[...stores.values()].sort((a,b)=>a.name.localeCompare(b.name,'pl')).map(store=>`<tr><th>${esc(store.name)}${store.nip?`<small>NIP: ${esc(store.nip)}</small>`:''}</th><td>${store.purchased.invoices.size}</td>${['purchased','assigned','returned','available'].map(key=>`<td class="kf-summary-money">${amounts(store[key].amounts)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="6">Brak zakupów.</td></tr>'}</tbody></table></div>
  <details class="kf-summary-details"><summary>Co zostało w magazynie — ${available.length} pozycji</summary><div class="kf-summary-table-wrap"><table class="kf-summary-table"><thead><tr><th>Towar</th><th>Sklep / faktura</th><th>Ilość na stanie</th><th>Cena za jednostkę</th><th>Wartość na stanie</th></tr></thead><tbody>${available.map(row=>`<tr><th>${esc(row.item.name)}</th><td>${esc(row.metadata.seller?.name||row.metadata.seller?.nip||'—')}<small>${esc(row.metadata.invoiceNumber)} · ${esc(row.metadata.issueDate||'')}</small></td><td>${qty(number(row.available))} ${esc(unit(row))}</td><td>${esc(money(value(row,1),currency(row)))}</td><td><strong>${esc(money(value(row,row.available),currency(row)))}</strong></td></tr>`).join('')||'<tr><td colspan="5">Magazyn jest pusty.</td></tr>'}</tbody></table></div></details>
  <p class="muted kf-summary-note">Kwoty brutto według cen zakupu. Częściowe ilości wyceniane proporcjonalnie, z zaokrągleniem do groszy. Zwrot ręczny i potwierdzająca go korekta są liczone raz. Różne waluty pokazujemy osobno. Korekty samej ceny wymagają sprawdzenia dokumentu.</p>
 </section>`;
}
