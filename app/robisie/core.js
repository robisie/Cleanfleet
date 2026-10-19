export const VERSION='1.0.49';
export const MODULES=[['overview','Panel inwestycji'],['data','Dane inwestycji'],['rooms','Pomieszczenia i pomiary'],['offer','Oferta wstępna'],['contract','Umowa'],['works','Kalkulacja końcowa'],['summary','Zestawienie prac'],['payments','Etapy i płatności'],['purchases','Zakupy i materiały'],['journal','Dziennik prac'],['handover','Odbiór inwestycji']];
export const uid=()=>crypto.randomUUID();
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());
export function number(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0;}
export const money=v=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(number(v));
export const quantity=v=>new Intl.NumberFormat('pl-PL',{maximumFractionDigits:3}).format(number(v));
export const round=v=>Math.round((number(v)+Number.EPSILON)*100)/100;
export const roundUp=v=>{const scaled=number(v)*100;return Math.ceil(scaled-Number.EPSILON*Math.max(1,Math.abs(scaled))*4)/100;};
export const measurement=v=>new Intl.NumberFormat('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}).format(roundUp(v));
export const finalWorkAmount=p=>(p.works?.length?round(totals(p).works.after-number(p.workCredit)):totals(p).agreed);
export function sortSummary(rows,key='category',direction=1){return [...rows].sort((a,b)=>{const comparison=['qty','value'].includes(key)?number(a[key])-number(b[key]):String(a[key]??'').localeCompare(String(b[key]??''),'pl',{numeric:true});return direction*comparison||String(a.name??'').localeCompare(String(b.name??''),'pl');});}
export const COPY_SECTIONS=[['data','Dane inwestora i adresy'],['rooms','Pomieszczenia i pomiary'],['offer','Oferta wstępna'],['works','Zakres prac do realizacji'],['contract','Warunki umowy'],['stages','Etapy płatności (bez wpłat)'],['purchases','Lista materiałów i zakupów (nieopłacona)'],['journal','Treść dziennika (bez dat i potwierdzeń)'],['handover','Uwagi do odbioru (bez akceptacji)']];
export function copyProject(source,sections,name,investor,date=today()){
 const chosen=new Set(sections),result=newProject(name,investor,date),roomIds=new Map();
 if(chosen.has('data'))for(const key of ['address','investorAddress','phone','email','pesel'])result[key]=structuredClone(source[key]??'');
 if(['rooms','offer','works','journal'].some(key=>chosen.has(key)))result.rooms=(source.rooms||[]).map(room=>{const id=uid();roomIds.set(room.id,id);return {...structuredClone(room),id};});
 const lines=items=>(items||[]).map(line=>{const item={...structuredClone(line),id:uid(),roomId:roomIds.get(line.roomId)||'',done:false};if(item.quantityBasis)item.quantityBasis.roomId=item.roomId;return item;});
 if(chosen.has('offer')){result.offer=lines(source.offer);result.discount=number(source.discount);result.materialEstimate=number(source.materialEstimate);}
 if(chosen.has('works')){result.works=lines(source.works);result.workDiscount=number(source.workDiscount??source.discount);}
 if(source.calculationPrecision==='source'&&(chosen.has('offer')||chosen.has('works')))result.calculationPrecision='source';
 if(chosen.has('contract'))for(const key of ['paymentDays','materialAdvance','terminationPercent','contractPlace'])result[key]=structuredClone(source[key]??result[key]);
 if(chosen.has('stages'))result.stages=(source.stages||[]).map(stage=>({...structuredClone(stage),id:uid(),due:'',invoice:''}));
 if(chosen.has('purchases'))result.purchases=(source.purchases||[]).map(item=>({id:uid(),date:'',shop:item.shop||'',description:item.description||'',invoice:'',amount:number(item.amount),charge:number(item.charge),paid:false}));
 if(chosen.has('journal'))result.journal=(source.journal||[]).map(item=>({id:uid(),date:'',roomId:roomIds.get(item.roomId)||'',description:item.description||'',investorConfirmed:false,contractorConfirmed:false}));
 result.handover={date:'',receiver:chosen.has('handover')?source.handover?.receiver||'':'',notes:chosen.has('handover')?source.handover?.notes||'':'',accepted:false};
 return result;
}
export function attachment(project,prefix,version){return `${prefix}-${project.contract_number.replace('UUR-','')}${version?'/V'+version:''}`;}
const geometrySignature=(parts,shared,openings,height)=>JSON.stringify([parts.map(p=>[number(p.length),number(p.width),number(p.height??height)]),number(shared),number(openings)]);
export function roomArea(room){
 const parts=room.parts?.length?room.parts:[room];
 const floor=parts.reduce((s,p)=>s+number(p.length)*number(p.width),0);
 const wall=parts.reduce((s,p)=>s+2*(number(p.length)+number(p.width))*number(p.height??room.height),0);
 const snapshot=room.sourceAreas;let reference;try{reference=snapshot&&JSON.parse(snapshot.geometry);}catch{}if(reference&&geometrySignature(reference[0],reference[1],reference[2],room.height)===geometrySignature(parts,room.sharedWalls,room.openings,room.height))return {...snapshot.values,perimeter:parts.reduce((s,p)=>s+2*(number(p.length)+number(p.width)),0)};
 return {floor,ceiling:floor,walls:Math.max(0,wall-number(room.sharedWalls)-number(room.openings)),perimeter:parts.reduce((s,p)=>s+2*(number(p.length)+number(p.width)),0)};
}
export const lineValue=line=>line.included===false?0:round(number(line.qty)*number(line.price));
const calculationValue=line=>line.calculationPrecision==='source'?(line.included===false?0:number(line.qty)*number(line.price)):lineValue(line);
export const calculationBasis=(lines,discount)=>JSON.stringify([number(discount),lines.map(l=>[l.id,number(l.qty),number(l.price),l.included!==false]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
export function workTotals(lines,discount=0,settlement){const raw=lines.reduce((s,l)=>s+calculationValue(l),0),factor=1-number(discount)/100,doneRaw=lines.filter(l=>l.done).reduce((s,l)=>s+calculationValue(l),0),sourceAmountApplied=settlement&&Number.isFinite(settlement.amount)&&settlement.amount>=0&&settlement.basis===calculationBasis(lines,discount);return {before:round(raw),after:round(sourceAmountApplied?settlement.amount:(lines.some(l=>l.calculationPrecision==='source')?raw:round(raw))*factor),done:round(sourceAmountApplied?(raw?settlement.amount*doneRaw/raw:0):doneRaw*factor),hours:lines.reduce((s,l)=>s+number(l.hours),0),days:lines.reduce((s,l)=>s+number(l.days),0),...(sourceAmountApplied?{sourceAmountApplied:true}:{})};}

// Legacy imports already have material receipts; explicit paidAmount uses investor settlement semantics.
export function purchasePayment(item){
 const explicit=item.paidAmount!=null,amount=Math.max(0,number(item.amount)),charge=Math.max(0,number(item.charge)),limit=explicit?charge:amount;
 const paid=item.paid?(explicit?Math.min(limit,Math.max(0,number(item.paidAmount))):amount):0;
 const ratio=limit?paid/limit:(item.paid&&!explicit?1:0);
 return {paid,charged:explicit?charge:charge*ratio,remaining:round(limit-paid),state:ratio>=1?'full':paid>0?'partial':'unpaid'};
}
export function purchasePaymentLabel(item){
 const payment=purchasePayment(item);
 return `${payment.state==='full'?'Opłacono w całości':payment.state==='partial'?'Częściowo opłacony':'Nieopłacony'}: ${money(payment.paid)} · Pozostało: ${money(payment.remaining)}`;
}
export function effectiveReceipts(p){
 return [...(p.receipts||[]),...(p.purchases||[]).filter(item=>item.paidAmount!=null&&purchasePayment(item).paid>0).map(item=>({id:'purchase-payment:'+item.id,purchaseId:item.id,date:item.date,kind:'materials',stageId:'',amount:purchasePayment(item).paid,note:`Rozliczenie zakupu: ${item.shop||''} — ${item.description||''}`}))];
}
export function purchaseTotals(p){
 const items=p.purchases||[],payments=items.map(purchasePayment);
 const spent=round(items.reduce((s,x)=>s+(x.paidAmount!=null?number(x.amount):purchasePayment(x).paid),0));
 const charged=round(payments.reduce((s,x)=>s+x.charged,0));
 const outstanding=round(payments.reduce((s,x)=>s+x.remaining,0));
 const advances=round(effectiveReceipts(p).filter(x=>x.kind==='materials').reduce((s,x)=>s+number(x.amount),0));
 return {spent,charged,outstanding,advances,actualBalance:round(advances-spent),balance:round(advances-charged),difference:round(charged-spent)};
}
export const acceptedAmount=offer=>offer.agreedAmount!=null?round(offer.agreedAmount):workTotals(offer.lines,offer.discount).after;
export const activeOffer=p=>(p.acceptedOffers||[]).find(offer=>offer.version===p.activeOfferVersion)||p.acceptedOffers?.at(-1);
export function selectOfferVersion(project,version){
 const offer=(project.acceptedOffers||[]).find(item=>item.version===Number(version));
 if(!offer)throw new Error('Nie znaleziono tej wersji oferty.');
 const next=structuredClone(project);
 if(next.activeOfferVersion===offer.version)return next;
 next.offerCalculations=next.offerCalculations||{};
 if(next.works?.length||next.activeOfferVersion!=null)next.offerCalculations[next.activeOfferVersion??next.acceptedOffers[0]?.version??'legacy']={works:structuredClone(next.works||[]),discount:next.workDiscount,changes:structuredClone(next.changes||[])};
 const saved=next.offerCalculations[offer.version];
 const previous=new Map((next.works||[]).filter(line=>line.id).map(line=>[line.id,line]));
 const sameScope=(a,b)=>a&&['name','roomId','unit','qty','included'].every(key=>(a[key]??(key==='included'?true:''))===(b[key]??(key==='included'?true:'')));
 next.works=saved?structuredClone(saved.works):offer.lines.map(line=>({...structuredClone(line),done:!!(sameScope(previous.get(line.id),line)&&previous.get(line.id).done)}));
 next.workDiscount=saved?saved.discount:number(offer.discount);
 next.changes=saved?structuredClone(saved.changes||[]):[];
 next.activeOfferVersion=offer.version;
 return next;
}
export function acceptOfferVersion(project,date=today()){
 if(!(project.offer||[]).some(line=>line.included!==false&&number(line.qty)>0))throw new Error('Dodaj przynajmniej jedną pracę z ilością.');
 const next=structuredClone(project),version=Math.max(0,...(next.acceptedOffers||[]).map(item=>number(item.version)))+1;
 next.acceptedOffers=next.acceptedOffers||[];
 next.acceptedOffers.push({version,date,lines:structuredClone(next.offer),discount:next.discount,materialEstimate:next.materialEstimate});
 next.status='oferta';
 return selectOfferVersion(next,version);
}
export function totals(p){
 const offer=workTotals(p.offer||[],p.discount,p.sourceCalculation?.offer),works=workTotals(p.works||[],p.workDiscount??p.discount,p.sourceCalculation?.works),materials=purchaseTotals(p);
 const accepted=activeOffer(p);
 const agreed=accepted?acceptedAmount(accepted):offer.after,workCredit=round(p.workCredit);
 const paid=round((p.receipts||[]).filter(x=>x.kind!=='materials').reduce((s,x)=>s+number(x.amount),0));
 return {offer,works,materials,agreed,paid,workCredit,remaining:round(p.calculationPrecision==='source'?((works.sourceAmountApplied?works.done:(p.works||[]).filter(l=>l.done).reduce((s,l)=>s+calculationValue(l),0)*(1-number(p.workDiscount??p.discount)/100))+(p.purchases||[]).reduce((s,x)=>s+purchasePayment(x).charged,0)-effectiveReceipts(p).reduce((s,x)=>s+number(x.amount),0)-workCredit):works.done+materials.charged-paid-materials.advances-workCredit),workRemaining:round(works.done-paid-workCredit),change:round(works.after-agreed)};
}
export function aggregate(lines){const map=new Map();for(const l of lines){if(l.included===false)continue;const key=l.serviceId+'|'+l.name+'|'+l.unit;const row=map.get(key)||{name:l.name,category:l.category,unit:l.unit,qty:0,value:0};row.qty+=number(l.qty);row.value=round(row.value+lineValue(l));map.set(key,row);}return [...map.values()].sort((a,b)=>a.category.localeCompare(b.category,'pl')||a.name.localeCompare(b.name,'pl'));}
export function newProject(name,investor,date=today()){
 return {name,investor,address:'',investorAddress:'',phone:'',email:'',pesel:'',status:'przygotowanie',contractDate:date,contractPlace:'',startDate:'',endDate:'',discount:0,workDiscount:0,materialEstimate:0,rooms:[],offer:[],works:[],acceptedOffers:[],changes:[],purchases:[],receipts:[],journal:[],trips:[],stages:[{id:uid(),name:'Etap I',percent:40,description:'Prace demontażowe i przygotowawcze, pomiary i kalkulacja materiału',due:'',invoice:''},{id:uid(),name:'Etap II',percent:30,description:'Organizacja materiału, zabudowy i instalacje',due:'',invoice:''},{id:uid(),name:'Etap III',percent:30,description:'Prace wykończeniowe i końcowe rozliczenie',due:'',invoice:''}],paymentDays:7,materialAdvance:0,terminationPercent:0,contractText:'',handover:{date:'',receiver:'',notes:'',accepted:true}};
}
export function changeRecord(before,after){
 const a=new Map(before.map(x=>[x.id,x])),b=new Map(after.map(x=>[x.id,x]));const list=[];
 for(const [id,l] of b){const old=a.get(id);if(!old||JSON.stringify(old)!==JSON.stringify(l))list.push({id:uid(),date:today(),name:l.name,roomId:l.roomId,before:old||null,after:l,accepted:false});}
 for(const [id,l] of a)if(!b.has(id))list.push({id:uid(),date:today(),name:l.name,roomId:l.roomId,before:l,after:null,accepted:false});
 return list;
}
export function contractTemplate(project,settings){
 const p=project.payload,t=totals(p),company=settings.company||{};
 const stages=p.stages.map(s=>`${s.name}: ${quantity(s.percent)}% (${money(t.agreed*number(s.percent)/100)}), ${s.description}.`).join('\n');
 return `UMOWA O WYKONANIE PRAC REMONTOWYCH\nNumer: ${project.contract_number}\nZawarta dnia ${p.contractDate} w ${p.contractPlace||'……………………'}.\n\nZLECENIODAWCA\n${p.investor||'……………………'}, adres: ${p.investorAddress||'……………………'}, PESEL: ${p.pesel||'……………………'}.\n\nWYKONAWCA\n${company.name||'ROBISIĘ-FER sp. z o.o.'}, ${company.address||'……………………'}, NIP: ${company.nip||'6351861297'}, KRS: ${company.krs||'……………………'}, reprezentowany przez ${company.representative||'Michał Sobota – prezes zarządu'}.\n\n§1. Przedmiot umowy\nWykonawca zobowiązuje się wykonać prace remontowe w nieruchomości przy ${p.address||'……………………'}. Zakres i wynagrodzenie określa oferta ${attachment(project,'OFE',activeOffer(p)?.version||1)}. Wymiary pomieszczeń określa załącznik ${attachment(project,'WYM')}.\n\n§2. Termin\nRozpoczęcie: ${p.startDate||'do ustalenia'}. Zakończenie: ${p.endDate||'do ustalenia'}.\n\n§3. Przygotowanie lokalu\nZleceniodawca przygotuje lokal do prac, w szczególności opróżni remontowane pomieszczenia z mebli i dekoracji. Nieprzygotowanie lokalu, które bezpośrednio uniemożliwi lub wstrzyma prace, skutkuje karą umowną 600 zł brutto za każdy dzień roboczy przestoju.\n\n§4. Wynagrodzenie i materiały\nUzgodnione wynagrodzenie za prace wynosi ${money(t.agreed)}. Cena nie obejmuje materiałów. Zleceniodawca dostarcza je na bieżąco lub powierza Wykonawcy ich zakup w swoim imieniu. Uzgodniona zaliczka materiałowa wynosi ${money(p.materialAdvance)} i jest płatna przed rozpoczęciem prac. Zakupy zostaną szczegółowo rozliczone.\n\n§5. Dokumentacja\nZleceniodawca udzieli informacji i udostępni dokumenty potrzebne do prawidłowego wykonania prac. Prace wymagające zezwolenia nie zostaną wykonane bez odpowiedniej dokumentacji.\n\n§6. Rozliczenia\n${stages}\nZapłata nastąpi w ciągu ${p.paymentDays} dni od otrzymania faktury. Rachunek: ${company.account||'……………………'}. Zmiany zakresu i zakupy zostaną rozliczone końcowo zgodnie z kalkulacją ${attachment(project,'KAL-K')} i zestawieniem ${attachment(project,'ROZ')}.\n\n§7. Wykonanie i odbiór\nPrace będą wykonywane zgodnie ze sztuką budowlaną. Odbiór nastąpi zgodnie z ustaleniami stron oraz wymaganiami dotyczącymi wykonywanych prac.\n\n§8. Dostęp do lokalu\nZleceniodawca udostępni klucze na okres realizacji. Wprowadzanie dodatkowych ekip i wykonywanie prac mogących utrudnić realizację wymaga uzgodnienia z Wykonawcą.\n\n§9. Osoby trzecie\nZleceniodawca nie udostępni terenu prac osobom trzecim bez swojej obecności lub obecności Wykonawcy.\n\n§10. Zakończenie przed terminem\nRozliczenie nastąpi według szczegółowej kalkulacji wykonanych prac. Uzgodniona kara za nieuzasadnione rozwiązanie umowy lub niewywiązywanie się z niej wynosi ${quantity(p.terminationPercent)}% sumy końcowego rozliczenia.\n\n§11. Zmiany umowy\nZmiany wymagają formy pisemnej.\n\n§12. Pozostałe sprawy\nW sprawach nieuregulowanych mają zastosowanie przepisy kodeksu cywilnego.\n\n§13. Egzemplarze\nUmowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej strony.\n\nData i podpis Wykonawcy: ………………………\nData i podpis Inwestora: ………………………`;
}

// Catalog names and units are shared; each investment retains its price snapshot.
export const catalogMarkup=(settings,project)=>number(project?.markup??settings.markup??35);
export const serviceKey=service=>[service.category,service.name,service.unit].map(value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pl')).join('|');
export function projectCatalog(settings,project){
 const snapshots=new Map((project?.catalog||[]).map(item=>[item.id,item]));
 return (settings.catalog||[]).map(item=>({...structuredClone(item),base:number(snapshots.get(item.id)?.base??item.base)}));
}
export function captureCatalog(settings,project){return {...project,catalog:projectCatalog(settings,project),markup:catalogMarkup(settings,project)};}
export function catalogCorrectionPreview(catalog,percent){
 const raw=String(percent??'').trim().replace(',','.');const value=Number(raw);
 if(!raw||!Number.isFinite(value)||value<=-100||value>1000||value===0)throw new Error('Wpisz korektę różną od zera, większą niż −100% i nie większą niż 1000%.');
 return catalog.map(item=>({id:item.id,name:item.name,category:item.category,before:round(item.base),after:round(number(item.base)*(1+value/100))}));
}
export function correctCatalog(settings,percent,reason='',date=new Date().toISOString()){
 const changes=catalogCorrectionPreview(settings.catalog||[],percent);
 if(!changes.length)throw new Error('Cennik jest pusty.');
 const next=structuredClone(settings),prices=new Map(changes.map(item=>[item.id,item.after]));
 next.catalog=next.catalog.map(item=>({...item,base:prices.get(item.id)}));
 next.catalogCorrections=[...(next.catalogCorrections||[]),{id:uid(),date,percent:number(percent),reason:String(reason).trim(),changes}];
 return next;
}
export function lastCatalogCorrection(settings){return (settings.catalogCorrections||[]).filter(item=>!item.undoneAt).at(-1);}
export function undoCatalogCorrection(settings,date=new Date().toISOString()){
 const last=lastCatalogCorrection(settings);if(!last)throw new Error('Brak korekty do cofnięcia.');
 const prices=new Map((settings.catalog||[]).map(item=>[item.id,item.base]));
 if(last.changes.some(item=>!prices.has(item.id)||round(prices.get(item.id))!==item.after))throw new Error('Po korekcie zmieniono ceny usług. Cofnięcie nadpisałoby te zmiany.');
 const next=structuredClone(settings),previous=new Map(last.changes.map(item=>[item.id,item.before]));
 next.catalog=next.catalog.map(item=>previous.has(item.id)?{...item,base:previous.get(item.id)}:item);
 next.catalogCorrections=next.catalogCorrections.map(item=>item.id===last.id?{...item,undoneAt:date}:item);
 return next;
}

// Parse arithmetic as numbers and operators only; never execute user-provided code.
export function calculateNumber(input){
 const source=String(input??'').trim().replaceAll(',','.').replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/');
 if(!source||source.length>500)throw new Error('Wpisz liczbę lub działanie, np. 25+3+7-2.');
 let position=0,depth=0;
 const error=()=>{throw new Error('Nieprawidłowe działanie. Użyj liczb, +, −, *, / i nawiasów.');};
 const space=()=>{while(/\s/.test(source[position]||'')&&position<source.length)position++;};
 function primary(){space();if(++depth>40)error();let value;
  const token=source[position];
  if(token==='+'||token==='-'){position++;value=(token==='-'?-1:1)*primary();}
  else if(token==='('){position++;value=sum();space();if(source[position++]!==')')error();}
  else {const match=source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);if(!match)error();position+=match[0].length;value=Number(match[0]);}
  depth--;return value;
 }
 function product(){let value=primary();space();while(source[position]==='*'||source[position]==='/'){const op=source[position++],right=primary();if(op==='/'&&right===0)throw new Error('Nie można dzielić przez zero.');value=op==='*'?value*right:value/right;space();}return value;}
 function sum(){let value=product();space();while(source[position]==='+'||source[position]==='-'){const op=source[position++],right=product();value=op==='+'?value+right:value-right;space();}return value;}
 const value=sum();space();if(position!==source.length)error();if(!Number.isFinite(value))throw new Error('Wynik działania jest zbyt duży.');
 return Object.is(value,-0)?0:Number.isInteger(value)||/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source)?value:Number(value.toPrecision(15));
}

export function categoryNames(values){const names=new Map();for(const value of values){const name=String(value||'').trim().replace(/\s+/g,' '),key=name.toLocaleLowerCase('pl');if(name&&!names.has(key))names.set(key,name);}return [...names.values()].sort((a,b)=>a.localeCompare(b,'pl'));}
export function canonicalCategory(value,names){const name=String(value||'').trim().replace(/\s+/g,' ');if(!name)throw new Error('Wybierz lub wpisz kategorię pracy.');return names.find(x=>x.toLocaleLowerCase('pl')===name.toLocaleLowerCase('pl'))||name;}
export function roomWalls(room){if(!room)return [];const parts=room.parts?.length?room.parts:[room];return parts.flatMap((part,i)=>[part.length,part.width,part.length,part.width].map((length,j)=>({id:`${i}-${j}`,name:`${parts.length>1?`Część ${i+1} · `:''}Ściana ${j+1}`,length:number(length),height:number(part.height??room.height),area:roundUp(number(length)*number(part.height??room.height))})));}
export function selectedWallArea(walls){if(!walls.length)throw new Error('Zaznacz przynajmniej jedną ścianę.');return roundUp(walls.reduce((sum,wall)=>{const area=number(wall.area),deduction=calculateNumber(wall.deduction||0);if(area<=0)throw new Error('Uzupełnij dodatnie wymiary pomieszczenia.');if(deduction<0||deduction>area)throw new Error('Odliczenie musi mieścić się między zerem a powierzchnią ściany.');return sum+area-deduction;},0));}

export function selectedSurfaceArea(room,walls,surfaces={}){if(!room)throw new Error('Wybierz pomieszczenie.');if(!walls.length&&!surfaces.walls&&!surfaces.floor&&!surfaces.ceiling)throw new Error('Zaznacz ściany, sufit lub podłogę.');const areas=roomArea(room);return roundUp((surfaces.walls?areas.walls:walls.length?selectedWallArea(walls):0)+(surfaces.floor?areas.floor:0)+(surfaces.ceiling?areas.ceiling:0));}

// Saved routes belong to one Robisię project. Offer lines retain a priced snapshot.
export const isTravelService=name=>/^dojazd(?:y)?(?:\s|$|[—–-])/i.test(String(name||'').trim());
export function savedTrip(data,id=uid()){
 const name=String(data.name||'').trim(),points=data.points;
 if(!name||name.length>200)throw new Error('Podaj nazwę trasy (maksymalnie 200 znaków).');
 if(!Array.isArray(points)||points.length<2||!points.every(point=>point.label&&Array.isArray(point.coords)&&point.coords.length===2&&point.coords.every(Number.isFinite)&&Math.abs(point.coords[0])<=180&&Math.abs(point.coords[1])<=90))throw new Error('Potwierdź wszystkie adresy trasy.');
 const meters=Number(data.meters),consumption=Number(data.consumption),price=Number(data.price);
 if(![meters,consumption,price].every(Number.isFinite)||meters<0||consumption<=0||price<=0)throw new Error('Oblicz trasę z poprawną ceną paliwa i spalaniem.');
 const km=meters/1000,liters=km*consumption/100;
 return {...structuredClone(data),id,name,meters,consumption,price,km,liters,cost:round(liters*price)};
}
export function tripLineData(trip){
 return {name:'Dojazd — '+trip.name,unit:'szt.',price:round(trip.cost),travelBasis:structuredClone(trip)};
}
