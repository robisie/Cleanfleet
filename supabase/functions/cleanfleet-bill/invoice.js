export const VERSION='1.0.57';
export const SELLER={name:'ROBISIĘ-FER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',nip:'6351861297',address:'UL. RTM. WITOLDA PILECKIEGO 18',city:'43-190 MIKOŁÓW',country:'PL'};
export const EXEMPTION='Zwolnienie na podstawie art. 113 ust. 1 lub 9 ustawy o VAT';
export const EU_COUNTRIES=[['PL','Polska'],['DE','Niemcy'],['AT','Austria'],['BE','Belgia'],['BG','Bułgaria'],['HR','Chorwacja'],['CY','Cypr'],['CZ','Czechy'],['DK','Dania'],['EE','Estonia'],['FI','Finlandia'],['FR','Francja'],['GR','Grecja'],['ES','Hiszpania'],['NL','Holandia'],['IE','Irlandia'],['LT','Litwa'],['LU','Luksemburg'],['LV','Łotwa'],['MT','Malta'],['PT','Portugalia'],['RO','Rumunia'],['SK','Słowacja'],['SI','Słowenia'],['SE','Szwecja'],['HU','Węgry'],['IT','Włochy']];
export const euBusiness=p=>partyKind(p)==='company'&&partyCountry(p)!=='PL'&&EU_COUNTRIES.some(([code])=>code===partyCountry(p));
export const defaultVat=p=>euBusiness(p)?'eu-services':'exempt';
export const VAT_RATES=[['23','23%'],['8','8%'],['5','5%'],['0 KR','0% — kraj'],['0 WDT','0% — WDT'],['zw','ZW'],['np II','NP — usługi UE']];
export const lineRate=(line,p)=>line.vatRate||((p?.vatTreatment==='eu-services')?'np II':'zw');
export const vatLabel=p=>{const rates=[...new Set((p.lines||[]).map(l=>lineRate(l,p)))];return rates.length===1?(rates[0].startsWith('0 ')?'0%':rates[0]==='np II'?'NP':rates[0]==='zw'?'ZW':rates[0]+'%'):'różne stawki';};
export const vatNotice=p=>(p.lines||[]).some(l=>lineRate(l,p)==='np II')?'Odwrotne obciążenie / reverse charge':(p.lines||[]).some(l=>lineRate(l,p)==='zw')?EXEMPTION:'';
// Existing issued documents predate explicit VAT treatment and must retain their original ZW.
export const storedPayload=row=>({...row.payload,vatTreatment:row.payload.vatTreatment||(row.number&&row.status!=='draft'?'exempt':defaultVat(row.payload.buyer))});
export function externalReference(input){
 const ksefNumber=String(input.ksefNumber||'').trim().toUpperCase(),outsideKsef=input.outsideKsef===true;
 if(outsideKsef&&ksefNumber)throw Error('Wybierz fakturę poza KSeF albo podaj jej numer KSeF.');
 if(!outsideKsef&&!/^\d{10}-\d{8}-[A-F\d]{12}-[A-F\d]{2}$/.test(ksefNumber))throw Error('Podaj poprawny numer KSeF albo potwierdź wystawienie poza KSeF.');
 return {ksefNumber:ksefNumber||null,status:outsideKsef?'outside':'ksef'};
}
export const canCorrect=row=>!['advance','final'].includes(row.payload?.documentType)&&!!row.number&&((row.status==='accepted'&&!!row.ksef_number)||(row.status==='issued'&&row.payload?.source?.app==='external'&&!row.payload?.correction));
export const logos={cleanfleet:'/assets/cleanfleet-logo.png',robisie:'/app/robisie/assets/robisie-logo.png'};
export const labels={draft:'Szkic',issued:'Do wysłania',sending:'Wysyłanie',pending:'Oczekuje w KSeF',accepted:'Przyjęta w KSeF',rejected:'Odrzucona',uncertain:'Sprawdź wysyłkę'};
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());}
export function validNip(value){return /^\d{10}$/.test(value)&&[6,5,7,2,3,4,5,6,7].reduce((s,w,i)=>s+w*Number(value[i]),0)%11===Number(value[9]);}
export function validBank(value){const s=String(value||'').replace(/\s/g,'').replace(/^PL/,'');if(!/^\d{26}$/.test(s))return false;let mod=0;for(const c of s.slice(2)+'2521'+s.slice(0,2))mod=(mod*10+Number(c))%97;return mod===1;}
export function decimal(v,places=2){const s=String(v??'').trim().replace(',','.');if(!new RegExp('^\\d{1,9}(?:\\.\\d{1,'+places+'})?$').test(s))throw Error('Podaj dodatnią liczbę, maksymalnie '+places+' miejsca po przecinku.');const [a,b='']=s.split('.');return Number(a)*10**places+Number(b.padEnd(places,'0'));}
export const money=(n,c='PLN')=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:c}).format(n/100);
export function lineDiscount(l){const s=(String(l.discount??'0').trim()||'0').replace(',','.');return (s.startsWith('-')?-1:1)*decimal(s.replace(/^[-+]/,''));}
export function lineTotal(l,p){const price=decimal(l.price),qty=decimal(l.qty,3),base=Math.round(price*qty/1000)-lineDiscount(l);return base-Math.round(base*decimal(p?.globalDiscount||'0')/10000);}
export function total(p){return p.lines.reduce((s,l)=>s+lineTotal(l,p),0);}
export const invoiceGross=p=>p.documentType==='advance'?decimal(p.advanceAmount||'0'):p.documentType==='final'?total(p)-((p.advances||[]).reduce((sum,a)=>sum+decimal(a.amount),0)):total(p);
export function lineTax(l,p){const gross=lineTotal(l,p),rate=lineRate(l,p),percent={'23':23,'8':8,'5':5}[rate]||0,net=percent?Math.round(gross*100/(100+percent)):gross;return {gross,net,tax:gross-net,rate};}
export function newInvoice(brand='cleanfleet'){const date=today();return {brand:brand==='robisie'?'robisie':'cleanfleet',documentType:'standard',issueDate:date,saleDate:date,dueDate:date,currency:'PLN',buyer:{name:'',nip:'',address:'',city:'',country:'PL'},recipient:null,lines:[{name:brand==='robisie'?'Usługi remontowe':'Czyszczenie wnętrza pojazdu',unit:'szt.',qty:'1',price:'0.00'}],globalDiscount:'0',payment:'transfer',bank:'',notes:'',orderNumber:'',contractNumber:'',advanceAmount:'',advances:[],paid:null,source:null};}
function text(v,max=512){const s=String(v??'').trim();if(s.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s))throw Error('Nieprawidłowa lub zbyt długa treść.');return s;}
export const partyCountry=p=>p?.country||(String(p?.nip||'').trim().toUpperCase().startsWith('DE')?'DE':'PL');
export const partyKind=p=>p?.kind||(String(p?.nip||'').trim()?'company':'person');
export function party(p){
 const kind=partyKind(p);if(!['company','person'].includes(kind))throw Error('Wybierz typ kontrahenta: osoba prywatna lub firma.');
 const result={kind,name:text(p?.name),nip:text(p?.nip,20).replace(/[\s-]/g,''),address:text(p?.address),city:text(p?.city),country:partyCountry(p),email:text(p?.email,254),phone:text(p?.phone,30),regon:kind==='company'?text(p?.regon,14):'',krs:kind==='company'?text(p?.krs,10):''};
 if(!result.name||!result.address||!result.city)throw Error(kind==='company'?'Uzupełnij nazwę firmy i pełny adres.':'Uzupełnij imię i nazwisko oraz pełny adres osoby prywatnej.');
 if(kind==='company'&&!result.nip)throw Error('Uzupełnij NIP firmy.');
 if(kind==='person'&&result.nip)throw Error('Osoba prywatna nie używa NIP-u w tym formularzu. Wybierz firmę, jeśli zakup jest na działalność.');
 if(!EU_COUNTRIES.some(([code])=>code===result.country))throw Error('Wybierz kraj Unii Europejskiej.');
 if(result.nip&&result.country==='DE'){result.nip=result.nip.toUpperCase();if(/^\d{9}$/.test(result.nip))result.nip='DE'+result.nip;if(!/^DE\d{9}$/.test(result.nip))throw Error('Niemiecki numer VAT powinien mieć prefiks DE i 9 cyfr.');}
 if(result.nip&&result.country!=='PL'&&result.country!=='DE'){result.nip=result.nip.toUpperCase();const prefix=result.country==='GR'?'EL':result.country;if(!new RegExp('^'+prefix+'[A-Z0-9]{2,12}$').test(result.nip))throw Error('Podaj numer VAT UE z prefiksem '+prefix+'.');}
 if(result.nip&&result.country==='PL'&&!validNip(result.nip))throw Error('Nieprawidłowy NIP kontrahenta.');
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw Error('Podaj poprawny adres e-mail.');
 if(result.phone&&!/^[+\d][\d\s().-]{4,29}$/.test(result.phone))throw Error('Podaj poprawny numer telefonu.');
 if(result.regon&&!/^(?:\d{9}|\d{14})$/.test(result.regon))throw Error('REGON ma 9 lub 14 cyfr.');
 if(result.krs&&!/^\d{10}$/.test(result.krs))throw Error('KRS ma 10 cyfr.');
 return result;
}
export function normalize(input,{allowZero=false}={}){
 const p={brand:input?.brand,documentType:input?.documentType||'standard',issueDate:input?.issueDate,saleDate:input?.saleDate,dueDate:input?.dueDate,currency:input?.currency,buyer:party(input?.buyer),recipient:input?.recipient?party(input.recipient):null,payment:input?.payment,bank:text(input?.bank,34).replace(/\s/g,''),notes:text(input?.notes,512),orderNumber:text(input?.orderNumber,100),contractNumber:text(input?.contractNumber,100),globalDiscount:String(input?.globalDiscount||'0'),advanceAmount:String(input?.advanceAmount||''),advances:input?.advances||[],paid:input?.paid||null,source:input?.source?{app:text(input.source.app,30),id:text(input.source.id,100),...(input.source.app==='robisie'&&['simple','detailed'].includes(input.source.invoiceMode)?{invoiceMode:input.source.invoiceMode}:{}),...(input.source.app==='cleanfleet'&&input.source.fleetId?{fleetId:text(input.source.fleetId,100),...(input.source.fleetLayout==='vehicle-lines'?{fleetLayout:'vehicle-lines'}:{})}:{}),...(input.source.app==='robisie'&&input.source.stageId?{stageId:text(input.source.stageId,100)}:{})}:null};
 p.vatTreatment=input.vatTreatment||defaultVat(p.buyer);
 if(!['exempt','eu-services'].includes(p.vatTreatment)||!['standard','advance','final'].includes(p.documentType))throw Error('Nieprawidłowy rodzaj faktury lub VAT.');
 if(!Object.hasOwn(logos,p.brand)||!['PLN','EUR'].includes(p.currency)||!['cash','transfer','card','unspecified'].includes(p.payment))throw Error('Nieprawidłowy wybór formularza.');
 for(const date of [p.issueDate,p.saleDate,p.dueDate])if(!/^20\d\d-\d\d-\d\d$/.test(date||'')||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Podaj poprawne daty.');
 if(!input?.correction&&p.dueDate<p.issueDate)throw Error('Termin płatności nie może poprzedzać wystawienia.');
 if(p.payment==='unspecified'&&p.source?.app!=='external')throw Error('Brak sposobu płatności można zachować wyłącznie z importowanej faktury.');
 if(p.bank&&!validBank(p.bank))throw Error('Podaj poprawny polski numer rachunku (26 cyfr, z prawidłową sumą kontrolną).');
 if(p.payment==='transfer'&&!p.bank)throw Error('Uzupełnij numer rachunku do przelewu.');
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>200)throw Error('Dodaj od 1 do 200 pozycji.');
 if(decimal(p.globalDiscount)>10000)throw Error('Rabat zbiorczy może wynosić najwyżej 100%.');
 p.lines=input.lines.map(l=>{const name=text(l.name),unit=text(l.unit,30),qty=decimal(l.qty,3),price=decimal(l.price),vatRate=lineRate(l,p);if(!name||!unit||qty<=0)throw Error('Uzupełnij nazwę, jednostkę i dodatnią ilość każdej pozycji.');if(!VAT_RATES.some(([rate])=>rate===vatRate))throw Error('Wybierz obsługiwaną stawkę VAT dla każdej pozycji.');if(vatRate==='np II'&&!euBusiness(p.buyer))throw Error('NP dla usług UE wymaga firmy z innego kraju UE.');if(vatRate==='0 WDT'&&!euBusiness(p.buyer))throw Error('0% WDT wymaga nabywcy z VAT UE.');if(!Number.isSafeInteger(qty*price))throw Error('Wartość pozycji jest zbyt duża.');const discount=lineDiscount(l);if(Math.round(price*qty/1000)-discount<0)throw Error('Rabat nie może przekraczać wartości pozycji.');return {name,unit,qty:(qty/1000).toFixed(3).replace(/\.?0+$/,''),price:(price/100).toFixed(2),...(l.vatRate?{vatRate}:{}),...(l.discount!=null?{discount:(discount/100).toFixed(2)}:{})};});
 if(p.currency!=='PLN'&&p.lines.some(l=>['23','8','5'].includes(lineRate(l,p))))throw Error('VAT w walucie EUR wymaga kursu do wyliczenia podatku w PLN; wybierz PLN lub stawkę bez kwoty podatku.');
 if(p.source?.app==='robisie'&&p.source.invoiceMode==='detailed'&&p.currency!=='PLN')throw Error('Rozbudowana kalkulacja Robisię jest w PLN.');
 if(!input?.correction&&p.source?.app==='robisie'&&p.source.invoiceMode==='detailed'&&p.source.stageId)throw Error('Rozliczenie etapu wymaga faktury prostej.');
 if(!input?.correction&&p.source?.app==='robisie'&&p.source.invoiceMode==='simple'&&p.lines.length!==1)throw Error('Faktura prosta ma jedną pozycję.');
 if(total(p)<0||(!input?.correction&&!allowZero&&total(p)===0)||total(p)>99999999999)throw Error('Nieprawidłowa suma faktury.');
 if(p.documentType==='advance'){
  if(input?.correction)throw Error('Korektę zaliczki przygotuj osobno; ten formularz jej jeszcze nie obsługuje.');
  if(!p.orderNumber&&!p.contractNumber)throw Error('Zaliczka wymaga numeru zamówienia lub umowy.');
  const amount=decimal(p.advanceAmount);if(amount<=0||amount>total(p))throw Error('Podaj otrzymaną zaliczkę nie większą niż wartość zamówienia.');
  if(!p.paid||decimal(p.paid.amount||'0')!==amount)throw Error('Zaliczka wymaga pełnej daty i sposobu otrzymania wpłaty.');
 }else p.advanceAmount='';
 if(p.documentType==='final'){
  if(input?.correction)throw Error('Korektę faktury końcowej przygotuj osobno; ten formularz jej jeszcze nie obsługuje.');
  if(!Array.isArray(p.advances)||!p.advances.length||p.advances.length>30)throw Error('Wybierz wcześniejszą fakturę zaliczkową.');
  p.advances=p.advances.map(a=>{if(!/^[0-9a-f-]{36}$/i.test(a.id||'')||!a.ksefNumber||!a.number||!a.amount||!Array.isArray(a.lines))throw Error('Nieprawidłowa zaliczka.');return {id:a.id,ksefNumber:text(a.ksefNumber,35),number:text(a.number,100),amount:String(a.amount),lines:a.lines.map(l=>({vatRate:lineRate(l,{vatTreatment:'exempt'}),gross:Number(l.gross),net:Number(l.net),tax:Number(l.tax)}))};});
  if(new Set(p.advances.map(a=>a.id)).size!==p.advances.length||invoiceGross(p)<0)throw Error('Zaliczki przekraczają wartość zamówienia lub powtarzają się.');
 }else p.advances=[];
 if(p.paid){const amount=decimal(p.paid.amount||'0'),date=p.paid.date,method=p.paid.method;if(!amount||(!input?.correction&&amount>invoiceGross(p))||!['cash','transfer'].includes(method)||!/^20\d\d-\d\d-\d\d$/.test(date||'')||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>p.issueDate)throw Error('Wpłata wymaga kwoty, daty i sposobu zapłaty; nie może przekraczać należności.');p.paid={amount:(amount/100).toFixed(2),method,date};}
 if(input?.correction){
  const c=input.correction;if(!/^[0-9a-f-]{36}$/i.test(c.originalId||'')||!['data','amount','tax'].includes(c.mode))throw Error('Nieprawidłowe powiązanie lub rodzaj korekty.');
  const reason=text(c.reason,256);if(!reason)throw Error('Wpisz przyczynę korekty.');
  if(!Array.isArray(c.references)||!c.references.length||c.references.length>2)throw Error('Brak danych faktury korygowanej.');
  const references=c.references.map(r=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(r.issueDate||'')||(!(r.outsideKsef===true&&!r.ksefNumber)&&!/^\d{10}-\d{8}-[a-f\d]{12}-[a-f\d]{2}$/i.test(r.ksefNumber||''))||!text(r.number,256))throw Error('Nieprawidłowe dane faktury korygowanej.');return {number:text(r.number,256),issueDate:r.issueDate,ksefNumber:r.ksefNumber||null,...(r.outsideKsef===true?{outsideKsef:true}:{})};});
  if(!c.before||c.before.correction)throw Error('Brak stanu przed korektą.');const before=normalize({...c.before,vatTreatment:c.before.vatTreatment||'exempt'},{allowZero:true});
  if(p.currency!==before.currency||p.buyer.nip!==before.buyer.nip||p.buyer.country!==before.buyer.country||p.buyer.kind!==before.buyer.kind)throw Error('Korekta zachowuje walutę i identyfikator nabywcy. Błędny NIP wymaga korekty do zera i nowej faktury.');
  if(JSON.stringify(p.recipient)!==JSON.stringify(before.recipient))throw Error('Ta korekta zachowuje odbiorcę z faktury pierwotnej.');
  if(p.saleDate!==before.saleDate)throw Error('Korekta zachowuje datę wykonania usługi.');
  const monetaryLines=lines=>lines.map(({vatRate,...l})=>l);
  if(['data','tax'].includes(c.mode)&&(JSON.stringify(monetaryLines(p.lines))!==JSON.stringify(monetaryLines(before.lines))||p.payment!==before.payment||p.bank!==before.bank||p.globalDiscount!==before.globalDiscount||JSON.stringify(p.paid)!==JSON.stringify(before.paid)))throw Error('Korekta danych lub VAT nie może zmieniać kwot ani płatności. Wybierz korektę kwot.');
  if(c.mode==='data'&&['name','address','city'].every(k=>p.buyer[k]===before.buyer[k]))throw Error('Zmień nazwę lub adres nabywcy, aby wystawić korektę danych.');
  if(c.mode==='data'&&p.lines.some((l,i)=>lineRate(l,p)!==lineRate(before.lines[i],before)))throw Error('Korekta danych nabywcy nie może zmieniać VAT.');
  if(c.mode==='tax'&&(p.lines.every((l,i)=>lineRate(l,p)===lineRate(before.lines[i],before))||JSON.stringify(p.buyer)!==JSON.stringify(before.buyer)))throw Error('Korekta VAT wymaga zmiany stawki i zachowania danych nabywcy.');
  p.correction={originalId:c.originalId,mode:c.mode,reason,references,before};
  if(invoiceAmount(p)>0&&p.dueDate<p.issueDate)throw Error('Termin dopłaty nie może poprzedzać wystawienia korekty.');
 }
 return p;
}

export const invoiceAmount=p=>invoiceGross(p)-(p.correction?invoiceGross(p.correction.before):0);
export function advanceAllocation(p){
 const order=total(p),amount=decimal(p.advanceAmount),lines=[];let remaining=amount;
 p.lines.forEach((l,i)=>{const gross=i===p.lines.length-1?remaining:Math.round(lineTotal(l,p)*amount/order);remaining-=gross;const rate=lineRate(l,p),percent={'23':23,'8':8,'5':5}[rate]||0,net=percent?Math.round(gross*100/(100+percent)):gross;lines.push({vatRate:rate,gross,net,tax:gross-net});});
 return lines;
}
export function taxBuckets(p){
 const buckets=new Map(),add=(l,sign=1)=>{const {rate,net,tax}=l;const old=buckets.get(rate)||{net:0,tax:0};old.net+=net*sign;old.tax+=tax*sign;buckets.set(rate,old);};
 if(p.correction){p.correction.before.lines.forEach(l=>add(lineTax(l,p.correction.before),-1));p.lines.forEach(l=>add(lineTax(l,p)));}
 else if(p.documentType==='advance')advanceAllocation(p).forEach(add);
 else{p.lines.forEach(l=>add(lineTax(l,p)));if(p.documentType==='final')p.advances.forEach(a=>a.lines.forEach(l=>add({rate:l.vatRate,net:l.net,tax:l.tax},-1)));}
 return buckets;
}
export function correctionSeed(row){
 if(!canCorrect(row))throw Error('Korektę można utworzyć do faktury przyjętej w KSeF lub zaimportowanej faktury zewnętrznej.');
 const before=structuredClone(storedPayload(row));delete before.correction;const date=today(),reference={number:row.number,ksefNumber:row.ksef_number||null,...(!row.ksef_number?{outsideKsef:true}:{}),issueDate:row.payload.issueDate};
 const references=row.payload.correction?[row.payload.correction.references[0],reference]:[reference];
 const vatTreatment=defaultVat(before.buyer),taxChange=vatTreatment!==before.vatTreatment;
 return {...structuredClone(before),vatTreatment,issueDate:date,dueDate:before.dueDate<date?date:before.dueDate,notes:'',correction:{originalId:row.id,mode:taxChange?'tax':'data',reason:taxChange?'Zmiana oznaczenia VAT z ZW na NP i dodanie adnotacji odwrotne obciążenie / reverse charge':'Uzupełnienie lub poprawa danych nabywcy',references,before}};
}

const xml=v=>esc(v).replace(/&#39;/g,'&apos;');
const tag=(name,value)=>`<${name}>${xml(value)}</${name}>`;
const address=p=>`<Adres>${tag('KodKraju',p.country||'PL')}${tag('AdresL1',p.address)}${tag('AdresL2',p.city)}</Adres>`;
const identity=p=>`<DaneIdentyfikacyjne>${p.nip?(euBusiness(p)?tag('KodUE',partyCountry(p)==='GR'?'EL':partyCountry(p))+tag('NrVatUE',p.nip.slice(2)):tag('NIP',p.nip)):tag('BrakID',1)}${tag('Nazwa',p.name)}</DaneIdentyfikacyjne>`;
const moneyValue=cents=>(cents/100).toFixed(2);
const bucketFields={'23':['P_13_1','P_14_1'],'8':['P_13_2','P_14_2'],'5':['P_13_3','P_14_3'],'0 KR':['P_13_6_1'],'0 WDT':['P_13_6_2'],'0 EX':['P_13_6_3'],'zw':['P_13_7'],'np II':['P_13_9']};
const paymentXml=p=>{
 if(p.correction&&invoiceAmount(p)<=0)return '';
 const paid=p.correction?null:p.paid,amount=invoiceGross(p),paymentTag=paid?(decimal(paid.amount)===amount?tag('Zaplacono',1)+tag('DataZaplaty',paid.date):tag('ZnacznikZaplatyCzesciowej',1)+`<ZaplataCzesciowa>${tag('KwotaZaplatyCzesciowej',paid.amount)}${tag('DataZaplatyCzesciowej',paid.date)}${tag('FormaPlatnosci',paid.method==='cash'?1:6)}</ZaplataCzesciowa>`):'';
 return `<Platnosc>${paymentTag}<TerminPlatnosci>${tag('Termin',p.dueDate)}</TerminPlatnosci>${p.payment==='unspecified'?'':tag('FormaPlatnosci',{cash:1,card:2,transfer:6}[p.payment])}${p.bank?`<RachunekBankowy>${tag('NrRB',p.bank)}</RachunekBankowy>`:''}</Platnosc>`;
};
export function invoiceXml(row,createdAt=new Date().toISOString()){
 const p=normalize(storedPayload(row)),c=p.correction,amount=invoiceAmount(p),reference=c?tag('PrzyczynaKorekty',c.reason)+c.references.map(r=>`<DaneFaKorygowanej>${tag('DataWystFaKorygowanej',r.issueDate)}${tag('NrFaKorygowanej',r.number)}${r.outsideKsef?'<NrKSeFN>1</NrKSeFN>':'<NrKSeF>1</NrKSeF>'+tag('NrKSeFFaKorygowanej',r.ksefNumber)}</DaneFaKorygowanej>`).join('')+(['name','address','city'].some(k=>p.buyer[k]!==c.before.buyer[k])?`<Podmiot2K>${identity(c.before.buyer)}${address(c.before.buyer)}</Podmiot2K>`:''):'';
 if(!row.number)throw Error('Brak numeru faktury.');
 const buckets=taxBuckets(p),sums=VAT_RATES.map(([rate])=>{const names=bucketFields[rate],b=buckets.get(rate);return b&&(b.net||b.tax||c)?tag(names[0],moneyValue(b.net))+(names[1]?tag(names[1],moneyValue(b.tax)):''):'';}).join('');
 const hasZw=[...buckets.keys()].includes('zw'),rc=[...buckets.keys()].includes('np II');
 const descriptions=[['Numer zamówienia',p.orderNumber],['Numer umowy',p.contractNumber],['Uwagi',p.notes]].filter(([,v])=>v).map(([k,v])=>`<DodatkowyOpis>${tag('Klucz',k)}${tag('Wartosc',v)}</DodatkowyOpis>`).join('');
 const advanceRefs=p.documentType==='final'?p.advances.map(a=>`<FakturaZaliczkowa>${tag('NrKSeFFaZaliczkowej',a.ksefNumber)}</FakturaZaliczkowa>`).join(''):'';
 const rows=c?(['amount','tax'].includes(c.mode)||p.vatTreatment!==c.before.vatTreatment?[...c.before.lines.map(l=>({line:l,source:c.before,before:true})),...p.lines.map(l=>({line:l,source:p}))]:[]):p.documentType==='advance'?[]:p.lines.map(l=>({line:l,source:p}));
 const rowXml=rows.map(({line:l,source,before},i)=>{const part=lineTax(l,source),unitNet={'23':23,'8':8,'5':5}[part.rate]?Math.round(decimal(l.price)*100/(100+Number(part.rate))):decimal(l.price);const base=Math.round(decimal(l.price)*decimal(l.qty,3)/1000);const discount=base-part.gross;return `<FaWiersz>${tag('NrWierszaFa',i+1)}${tag('P_7',l.name)}${tag('P_8A',l.unit)}${tag('P_8B',l.qty)}${tag('P_9A',moneyValue(unitNet))}${discount?tag('P_10',moneyValue(Math.round(discount*part.net/(part.gross||1)))):''}${tag('P_11',moneyValue(part.net))}${tag('P_12',part.rate)}${before?'<StanPrzed>1</StanPrzed>':''}</FaWiersz>`;}).join('');
 const order=p.documentType==='advance'?`<Zamowienie>${tag('WartoscZamowienia',moneyValue(total(p)))}${p.lines.map((l,i)=>{const part=lineTax(l,p);return `<ZamowienieWiersz>${tag('NrWierszaZam',i+1)}${tag('P_7Z',l.name)}${tag('P_8AZ',l.unit)}${tag('P_8BZ',l.qty)}${tag('P_9AZ',moneyValue(Math.round(decimal(l.price)*100/(100+({'23':23,'8':8,'5':5}[part.rate]||0)))))}${tag('P_11NettoZ',moneyValue(part.net))}${part.tax?tag('P_11VatZ',moneyValue(part.tax)):''}${tag('P_12Z',part.rate)}</ZamowienieWiersz>`;}).join('')}</Zamowienie>`:'';
 const kind=c?'KOR':p.documentType==='advance'?'ZAL':p.documentType==='final'?'ROZ':'VAT';
 return '<?xml version="1.0" encoding="utf-8"?>'+`<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza>${tag('DataWytworzeniaFa',createdAt)}<SystemInfo>Robisię-Fer Bill ${VERSION}</SystemInfo></Naglowek><Podmiot1>${identity(SELLER)}${address(SELLER)}</Podmiot1><Podmiot2>${identity(p.buyer)}${address(p.buyer)}<JST>2</JST><GV>2</GV></Podmiot2>${p.recipient?`<Podmiot3>${identity(p.recipient)}${address(p.recipient)}<Rola>2</Rola></Podmiot3>`:''}<Fa>${tag('KodWaluty',p.currency)}${tag('P_1',p.issueDate)}${tag('P_2',row.number)}${p.documentType==='advance'?'':tag('P_6',p.saleDate)}${sums}${tag('P_15',moneyValue(amount))}<Adnotacje><P_16>2</P_16><P_17>2</P_17>${tag('P_18',rc?1:2)}<P_18A>2</P_18A><Zwolnienie>${hasZw?'<P_19>1</P_19>'+tag('P_19A',EXEMPTION):'<P_19N>1</P_19N>'}</Zwolnienie><NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje>${tag('RodzajFaktury',kind)}${reference}${descriptions}${advanceRefs}${rowXml}${paymentXml(p)}${order}</Fa></Faktura>`;
}
