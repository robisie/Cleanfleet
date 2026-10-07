export const VERSION='1.0.1';
export const MODULES=[['overview','Panel inwestycji'],['data','Dane inwestycji'],['rooms','Pomieszczenia i pomiary'],['offer','Oferta wstępna'],['contract','Umowa'],['works','Realizacja i kalkulacja'],['summary','Zestawienie prac'],['payments','Etapy i płatności'],['purchases','Zakupy i materiały'],['journal','Dziennik prac'],['handover','Odbiór inwestycji']];
export const uid=()=>crypto.randomUUID();
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());
export function number(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0;}
export const money=v=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(number(v));
export const quantity=v=>new Intl.NumberFormat('pl-PL',{maximumFractionDigits:3}).format(number(v));
export const round=v=>Math.round((number(v)+Number.EPSILON)*100)/100;
export function attachment(project,prefix,version){return `${prefix}-${project.contract_number.replace('UUR-','')}${version?'/V'+version:''}`;}
export function roomArea(room){
 const parts=room.parts?.length?room.parts:[room];
 const floor=parts.reduce((s,p)=>s+number(p.length)*number(p.width),0);
 const wall=parts.reduce((s,p)=>s+2*(number(p.length)+number(p.width))*number(p.height??room.height),0);
 return {floor,ceiling:floor,walls:Math.max(0,wall-number(room.sharedWalls)-number(room.openings)),perimeter:parts.reduce((s,p)=>s+2*(number(p.length)+number(p.width)),0)};
}
export const lineValue=line=>line.included===false?0:round(number(line.qty)*number(line.price));
export function workTotals(lines,discount=0){const before=round(lines.reduce((s,l)=>s+lineValue(l),0));return {before,after:round(before*(1-number(discount)/100)),done:round(lines.filter(l=>l.done).reduce((s,l)=>s+lineValue(l),0)*(1-number(discount)/100)),hours:lines.reduce((s,l)=>s+number(l.hours),0),days:lines.reduce((s,l)=>s+number(l.days),0)};}
export function purchaseTotals(p){
 const spent=round((p.purchases||[]).filter(x=>x.paid).reduce((s,x)=>s+number(x.amount),0));
 const charged=round((p.purchases||[]).filter(x=>x.paid).reduce((s,x)=>s+number(x.charge),0));
 const advances=round((p.receipts||[]).filter(x=>x.kind==='materials').reduce((s,x)=>s+number(x.amount),0));
 return {spent,charged,advances,actualBalance:round(advances-spent),balance:round(advances-charged),difference:round(charged-spent)};
}
export function totals(p){
 const offer=workTotals(p.offer||[],p.discount),works=workTotals(p.works||[],p.workDiscount??p.discount),materials=purchaseTotals(p);
 const accepted=p.acceptedOffers?.at(-1);
 const agreed=accepted?workTotals(accepted.lines,accepted.discount).after:offer.after;
 const paid=round((p.receipts||[]).filter(x=>x.kind!=='materials').reduce((s,x)=>s+number(x.amount),0));
 return {offer,works,materials,agreed,paid,remaining:round(works.after+materials.charged-paid-materials.advances),workRemaining:round(works.after-paid),change:round(works.after-agreed)};
}
export function aggregate(lines){const map=new Map();for(const l of lines){if(l.included===false)continue;const key=l.serviceId+'|'+l.name+'|'+l.unit;const row=map.get(key)||{name:l.name,category:l.category,unit:l.unit,qty:0,value:0};row.qty+=number(l.qty);row.value=round(row.value+lineValue(l));map.set(key,row);}return [...map.values()].sort((a,b)=>a.category.localeCompare(b.category,'pl')||a.name.localeCompare(b.name,'pl'));}
export function newProject(name,investor,date=today()){
 return {name,investor,address:'',investorAddress:'',phone:'',email:'',pesel:'',status:'przygotowanie',contractDate:date,contractPlace:'',startDate:'',endDate:'',discount:0,workDiscount:0,materialEstimate:0,rooms:[],offer:[],works:[],acceptedOffers:[],changes:[],purchases:[],receipts:[],journal:[],stages:[{id:uid(),name:'Etap I',percent:40,description:'Prace demontażowe i przygotowawcze, pomiary i kalkulacja materiału',due:'',invoice:''},{id:uid(),name:'Etap II',percent:30,description:'Organizacja materiału, zabudowy i instalacje',due:'',invoice:''},{id:uid(),name:'Etap III',percent:30,description:'Prace wykończeniowe i końcowe rozliczenie',due:'',invoice:''}],paymentDays:7,materialAdvance:0,terminationPercent:0,contractText:'',handover:{date:'',receiver:'',notes:'',accepted:true}};
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
 return `UMOWA O WYKONANIE PRAC REMONTOWYCH\nNumer: ${project.contract_number}\nZawarta dnia ${p.contractDate} w ${p.contractPlace||'……………………'}.\n\nZLECENIODAWCA\n${p.investor||'……………………'}, adres: ${p.investorAddress||'……………………'}, PESEL: ${p.pesel||'……………………'}.\n\nWYKONAWCA\n${company.name||'ROBISIĘ-FER sp. z o.o.'}, ${company.address||'……………………'}, NIP: ${company.nip||'6351861297'}, KRS: ${company.krs||'……………………'}, reprezentowany przez ${company.representative||'Michał Sobota – prezes zarządu'}.\n\n§1. Przedmiot umowy\nWykonawca zobowiązuje się wykonać prace remontowe w nieruchomości przy ${p.address||'……………………'}. Zakres i wynagrodzenie określa oferta ${attachment(project,'OFE',p.acceptedOffers?.at(-1)?.version||1)}. Wymiary pomieszczeń określa załącznik ${attachment(project,'WYM')}.\n\n§2. Termin\nRozpoczęcie: ${p.startDate||'do ustalenia'}. Zakończenie: ${p.endDate||'do ustalenia'}.\n\n§3. Przygotowanie lokalu\nZleceniodawca przygotuje lokal do prac, w szczególności opróżni remontowane pomieszczenia z mebli i dekoracji. Nieprzygotowanie lokalu, które bezpośrednio uniemożliwi lub wstrzyma prace, skutkuje karą umowną 600 zł brutto za każdy dzień roboczy przestoju.\n\n§4. Wynagrodzenie i materiały\nUzgodnione wynagrodzenie za prace wynosi ${money(t.agreed)}. Cena nie obejmuje materiałów. Zleceniodawca dostarcza je na bieżąco lub powierza Wykonawcy ich zakup w swoim imieniu. Uzgodniona zaliczka materiałowa wynosi ${money(p.materialAdvance)} i jest płatna przed rozpoczęciem prac. Zakupy zostaną szczegółowo rozliczone.\n\n§5. Dokumentacja\nZleceniodawca udzieli informacji i udostępni dokumenty potrzebne do prawidłowego wykonania prac. Prace wymagające zezwolenia nie zostaną wykonane bez odpowiedniej dokumentacji.\n\n§6. Rozliczenia\n${stages}\nZapłata nastąpi w ciągu ${p.paymentDays} dni od otrzymania faktury. Rachunek: ${company.account||'……………………'}. Zmiany zakresu i zakupy zostaną rozliczone końcowo zgodnie z kalkulacją ${attachment(project,'KAL-K')} i zestawieniem ${attachment(project,'ROZ')}.\n\n§7. Wykonanie i odbiór\nPrace będą wykonywane zgodnie ze sztuką budowlaną. Odbiór nastąpi zgodnie z ustaleniami stron oraz wymaganiami dotyczącymi wykonywanych prac.\n\n§8. Dostęp do lokalu\nZleceniodawca udostępni klucze na okres realizacji. Wprowadzanie dodatkowych ekip i wykonywanie prac mogących utrudnić realizację wymaga uzgodnienia z Wykonawcą.\n\n§9. Osoby trzecie\nZleceniodawca nie udostępni terenu prac osobom trzecim bez swojej obecności lub obecności Wykonawcy.\n\n§10. Zakończenie przed terminem\nRozliczenie nastąpi według szczegółowej kalkulacji wykonanych prac. Uzgodniona kara za nieuzasadnione rozwiązanie umowy lub niewywiązywanie się z niej wynosi ${quantity(p.terminationPercent)}% sumy końcowego rozliczenia.\n\n§11. Zmiany umowy\nZmiany wymagają formy pisemnej.\n\n§12. Pozostałe sprawy\nW sprawach nieuregulowanych mają zastosowanie przepisy kodeksu cywilnego.\n\n§13. Egzemplarze\nUmowę sporządzono w dwóch jednobrzmiących egzemplarzach, po jednym dla każdej strony.\n\nData i podpis Wykonawcy: ………………………\nData i podpis Inwestora: ………………………`;
}
