(function(root){
'use strict';
function norm(value){return String(value||'').replace(/ł/g,'l').replace(/Ł/g,'L').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function cents(value){const s=String(value??'').trim().replace(',','.');if(!/^-?\d+(\.\d{1,2})?$/.test(s))return null;const negative=s.startsWith('-'),[whole,fraction='']=s.replace(/^-/,'').split('.');const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return negative?-amount:amount;}
function account(value){const s=String(value||'').replace(/\s/g,'').toUpperCase().replace(/^PL/,'');return /^\d{26}$/.test(s)?s:'';}
function numberIn(text,number){const n=norm(number).trim();if(n.length<4 || !/\d/.test(n))return false;const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^A-Z0-9/_-])'+escaped+'($|[^A-Z0-9/_-])').test(norm(text));}
function party(value){return norm(value).replace(/[^A-Z0-9]+/g,' ').replace(/\b(SPOLKA|OGRANICZONA|ODPOWIEDZIALNOSCIA|SP|Z|OO|O|SA)\b/g,' ').replace(/\s+/g,' ').trim();}
function sameParty(a,b){const x=party(a),y=party(b);if(x.length<5||y.length<5)return false;if(x===y)return true;const xs=new Set(x.split(' ')),ys=new Set(y.split(' ')),common=[...xs].filter(t=>t.length>2&&ys.has(t));return common.length>=2 && common.length/Math.max(xs.size,ys.size)>=0.75;}
function money(amount){const n=BigInt(amount),v=n<0n?-n:n;return (n<0n?'-':'')+(v/100n).toString()+','+(v%100n).toString().padStart(2,'0');}
function reconcile({month,bankResults=[],purchases}){
 const warnings=[],invoices=Array.isArray(purchases?.invoices)?purchases.invoices:[];
 if(!bankResults.length)warnings.push('Brak przekonwertowanego CSV mBanku — nie można sprawdzić płatności.');
 if(!purchases || purchases.month!==month)warnings.push('Nie pobrano faktur zakupowych KSeF za ten miesiąc.');
 else if(invoices.length!==purchases.count)warnings.push('Pobierz faktury KSeF ponownie — brakuje danych do porównania.');
 const validPurchases=purchases?.month===month && invoices.length===purchases.count;
 const rows=[];
 for(const bank of bankResults){
  const statement=bank.statement;
  if(!statement || bank.month!==month || !Array.isArray(statement.operations)){warnings.push('Brak danych operacji za wybrany miesiąc. Ponownie przekonwertuj CSV.');continue;}
  for(const [index,operation] of statement.operations.entries()){
   if(typeof operation.amount!=='bigint' || operation.amount>=0n)continue;
   const text=[operation.description,operation.title,operation.party].join(' '),agent=/\b(ALLEGRO|PAYU|PRZELEWY24|PAYPAL|STRIPE|TPAY|AUTOPAY|BLUE MEDIA)\b/.test(norm(text));
   const candidates=[];
   if(validPurchases)for(const [invoiceIndex,invoice] of invoices.entries()){
    const amount=cents(invoice.gross),currency=String(invoice.currency||'').toUpperCase();
    const exact=amount!==null && amount>0n && -operation.amount===amount && currency===statement.currency;
    const reference=numberIn(operation.title,invoice.number) || numberIn(operation.title,invoice.nrKSeF);
    const iban=account(operation.counterAccount),bankMatch=Boolean(iban && (invoice.accounts||[]).some(value=>account(value)===iban));
    const name=sameParty(operation.party,invoice.seller);
    if(!exact&&!reference&&!bankMatch&&!name)continue;
    const reasons=[];if(exact)reasons.push('zgodna kwota i waluta');if(reference)reasons.push('numer faktury w tytule');if(bankMatch)reasons.push('zgodny rachunek');if(name)reasons.push('zgodna nazwa sprzedawcy');
    const correction=/^KOR/.test(invoice.type||'');if(correction)reasons.push('faktura korygująca');
    if(!exact)reasons.push(currency!==statement.currency?'inna lub nieznana waluta':'inna kwota — możliwa rata, zaliczka lub płatność zbiorcza');
    const before=Boolean(invoice.date && operation.booked && invoice.date>operation.booked);if(before)reasons.push('płatność przed wystawieniem faktury');
    candidates.push({invoiceIndex,invoice,reasons,strong:exact&&(reference||bankMatch||name)&&!correction&&!before&&!agent,score:(reference?8:0)+(bankMatch?6:0)+(name?4:0)+(exact?3:0)});
   }
   candidates.sort((a,b)=>b.score-a.score);
   const strong=candidates.filter(c=>c.strong);let kind='review',reason='Nie znaleziono pasującej faktury KSeF.';
   if(strong.length===1 && candidates.filter(c=>c.score>=strong[0].score).length===1){kind='matched';reason=strong[0].reasons.join('; ');}
   else if(candidates.length){kind='uncertain';reason=candidates.length>1?'Kilka możliwych faktur — wybór wymaga sprawdzenia.':candidates[0].reasons.join('; ');}
   if(agent){kind='uncertain';reason='Płatność przez platformę lub operatora — sprzedawca na fakturze może być inny.';}
   if(!candidates.length && !agent){const t=norm(text);if(/\b(ZUS|URZAD SKARBOWY|PODATEK|PODATKU|WYNAGRODZENIE|WYNAGRODZENIA|PROWIZJA)\b/.test(t)||/OPLATA.*(RACHUNK|KONT|PRZELEW|KART)/.test(t)){kind='other';reason='Opis wskazuje np. podatek, ZUS, wynagrodzenie lub opłatę bankową. Sprawdź rodzaj wydatku.';}}
   rows.push({id:statement.account+':'+index,account:statement.account,currency:statement.currency,operation,kind,reason,candidates,matchedInvoice:kind==='matched'?strong[0].invoiceIndex:null});
  }
 }
 const assignments=new Map();for(const row of rows)if(row.kind==='matched'){const list=assignments.get(row.matchedInvoice)||[];list.push(row);assignments.set(row.matchedInvoice,list);}
 for(const list of assignments.values())if(list.length>1)for(const row of list){row.kind='uncertain';row.reason='Ta sama faktura pasuje do kilku płatności — sprawdź raty lub powtórzoną płatność.';row.matchedInvoice=null;}
 const matched=new Set(rows.filter(row=>row.kind==='matched').map(row=>row.matchedInvoice));
 const unmatchedInvoices=validPurchases?invoices.filter((invoice,index)=>!matched.has(index)):[];
 const counts={matched:0,uncertain:0,review:0,other:0};rows.forEach(row=>counts[row.kind]++);
 return {month,warnings:[...new Set(warnings)],rows,counts,unmatchedInvoices};
}
function render(container,result){
 container.replaceChildren();const add=(parent,tag,text)=>{const node=document.createElement(tag);node.textContent=text;parent.appendChild(node);return node;};
 add(container,'h2','Kontrola płatności i faktur');add(container,'p','Porównanie wydatków z CSV mBanku z fakturami zakupowymi KSeF za '+result.month+'. Uwzględniamy tylko przygotowane dane tego miesiąca. Faktury spoza KSeF, PDF-y i załączniki poczty nie są analizowane.');
 add(container,'p','Wynik wymaga Twojej oceny. Płatność może dotyczyć innego miesiąca, zaliczki lub wydatku bez faktury. Faktura bez płatności nie oznacza brakującego dokumentu.');
 result.warnings.forEach(text=>add(container,'p',text));
 const labels={review:'Płatności do sprawdzenia',uncertain:'Niepewne dopasowania',matched:'Dopasowane płatności',other:'Pozostałe operacje'};
 for(const kind of ['review','uncertain','matched','other']){
  const details=add(container,'details','');details.open=(kind==='review'||kind==='uncertain')&&result.counts[kind]>0;add(details,'summary',labels[kind]+': '+result.counts[kind]);
  for(const row of result.rows.filter(row=>row.kind===kind)){
   const box=add(details,'div','');box.style.cssText='padding:12px 0;border-bottom:1px solid #ddd;overflow-wrap:anywhere';
   add(box,'strong',row.operation.booked+' · '+money(-row.operation.amount)+' '+row.currency+' · '+(row.operation.party||'Odbiorca niewskazany'));
   add(box,'p',[row.operation.description,row.operation.title].filter(Boolean).join(' — '));add(box,'p','Rachunek płatnika: …'+String(row.account).slice(-8));add(box,'p',row.reason);
   for(const candidate of row.candidates.slice(0,5)){const i=candidate.invoice;add(box,'p','Faktura '+(i.number||i.nrKSeF||'bez numeru')+' · '+(i.seller||'')+' · '+(i.gross??'brak kwoty')+' '+(i.currency||'')+' · '+(i.date||'')+' — '+candidate.reasons.join('; '));}
   if(row.candidates.length>5)add(box,'p','Możliwych faktur: '+row.candidates.length+'. Pokazano pierwsze 5.');
  }
 }
 const details=add(container,'details','');add(details,'summary','Faktury bez jednoznacznie dopasowanej płatności: '+result.unmatchedInvoices.length);
 for(const i of result.unmatchedInvoices)add(details,'p',(i.number||i.nrKSeF||'bez numeru')+' · '+(i.seller||'')+' · '+(i.gross??'brak kwoty')+' '+(i.currency||'')+' · '+(i.date||''));
}
const api={reconcile,render,cents,money,numberIn};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFAccountingReconcile=api;
})(typeof window==='object'?window:globalThis);
