export const VERSION='1.0.51';
export const SELLER={name:'ROBISIĘ-FER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',nip:'6351861297',address:'UL. RTM. WITOLDA PILECKIEGO 18',city:'43-190 MIKOŁÓW',country:'PL'};
export const EXEMPTION='Zwolnienie na podstawie art. 113 ust. 1 lub 9 ustawy o VAT';
export const EU_COUNTRIES=[['PL','Polska'],['DE','Niemcy'],['AT','Austria'],['BE','Belgia'],['BG','Bułgaria'],['HR','Chorwacja'],['CY','Cypr'],['CZ','Czechy'],['DK','Dania'],['EE','Estonia'],['FI','Finlandia'],['FR','Francja'],['GR','Grecja'],['ES','Hiszpania'],['NL','Holandia'],['IE','Irlandia'],['LT','Litwa'],['LU','Luksemburg'],['LV','Łotwa'],['MT','Malta'],['PT','Portugalia'],['RO','Rumunia'],['SK','Słowacja'],['SI','Słowenia'],['SE','Szwecja'],['HU','Węgry'],['IT','Włochy']];
export const euBusiness=p=>partyKind(p)==='company'&&partyCountry(p)!=='PL'&&EU_COUNTRIES.some(([code])=>code===partyCountry(p));
export const defaultVat=p=>euBusiness(p)?'eu-services':'exempt';
export const vatLabel=p=>p.vatTreatment==='eu-services'?'NP':'ZW';
export const vatNotice=p=>p.vatTreatment==='eu-services'?'Odwrotne obciążenie / reverse charge':EXEMPTION;
// Existing issued documents predate explicit VAT treatment and must retain their original ZW.
export const storedPayload=row=>({...row.payload,vatTreatment:row.payload.vatTreatment||(row.number&&row.status!=='draft'?'exempt':defaultVat(row.payload.buyer))});
export function externalReference(input){
 const ksefNumber=String(input.ksefNumber||'').trim().toUpperCase(),outsideKsef=input.outsideKsef===true;
 if(outsideKsef&&ksefNumber)throw Error('Wybierz fakturę poza KSeF albo podaj jej numer KSeF.');
 if(!outsideKsef&&!/^\d{10}-\d{8}-[A-F\d]{12}-[A-F\d]{2}$/.test(ksefNumber))throw Error('Podaj poprawny numer KSeF albo potwierdź wystawienie poza KSeF.');
 return {ksefNumber:ksefNumber||null,status:outsideKsef?'outside':'ksef'};
}
export const canCorrect=row=>!!row.number&&((row.status==='accepted'&&!!row.ksef_number)||(row.status==='issued'&&row.payload?.source?.app==='external'&&!row.payload?.correction));
export const logos={cleanfleet:'/assets/cleanfleet-logo.png',robisie:'/app/robisie/assets/robisie-logo.png'};
export const labels={draft:'Szkic',issued:'Do wysłania',sending:'Wysyłanie',pending:'Oczekuje w KSeF',accepted:'Przyjęta w KSeF',rejected:'Odrzucona',uncertain:'Sprawdź wysyłkę'};
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());}
export function validNip(value){return /^\d{10}$/.test(value)&&[6,5,7,2,3,4,5,6,7].reduce((s,w,i)=>s+w*Number(value[i]),0)%11===Number(value[9]);}
export function validBank(value){const s=String(value||'').replace(/\s/g,'').replace(/^PL/,'');if(!/^\d{26}$/.test(s))return false;let mod=0;for(const c of s.slice(2)+'2521'+s.slice(0,2))mod=(mod*10+Number(c))%97;return mod===1;}
export function decimal(v,places=2){const s=String(v??'').trim().replace(',','.');if(!new RegExp('^\\d{1,9}(?:\\.\\d{1,'+places+'})?$').test(s))throw Error('Podaj dodatnią liczbę, maksymalnie '+places+' miejsca po przecinku.');const [a,b='']=s.split('.');return Number(a)*10**places+Number(b.padEnd(places,'0'));}
export const money=(n,c='PLN')=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:c}).format(n/100);
export function lineDiscount(l){const s=(String(l.discount??'0').trim()||'0').replace(',','.');return (s.startsWith('-')?-1:1)*decimal(s.replace(/^[-+]/,''));}
export function lineTotal(l){const price=decimal(l.price),qty=decimal(l.qty,3);return Math.round(price*qty/1000)-lineDiscount(l);}
export function total(p){return p.lines.reduce((s,l)=>s+lineTotal(l),0);}
export function newInvoice(brand='cleanfleet'){const date=today();return {brand:brand==='robisie'?'robisie':'cleanfleet',issueDate:date,saleDate:date,dueDate:date,currency:'PLN',buyer:{name:'',nip:'',address:'',city:'',country:'PL'},recipient:null,lines:[{name:brand==='robisie'?'Usługi remontowe':'Czyszczenie wnętrza pojazdu',unit:'szt.',qty:'1',price:'0.00'}],payment:'transfer',bank:'',notes:'',source:null};}
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
 const p={brand:input?.brand,issueDate:input?.issueDate,saleDate:input?.saleDate,dueDate:input?.dueDate,currency:input?.currency,buyer:party(input?.buyer),recipient:input?.recipient?party(input.recipient):null,payment:input?.payment,bank:text(input?.bank,34).replace(/\s/g,''),notes:text(input?.notes,512),source:input?.source?{app:text(input.source.app,30),id:text(input.source.id,100),...(input.source.app==='robisie'&&['simple','detailed'].includes(input.source.invoiceMode)?{invoiceMode:input.source.invoiceMode}:{}),...(input.source.app==='cleanfleet'&&input.source.fleetId?{fleetId:text(input.source.fleetId,100),...(input.source.fleetLayout==='vehicle-lines'?{fleetLayout:'vehicle-lines'}:{})}:{}),...(input.source.app==='robisie'&&input.source.stageId?{stageId:text(input.source.stageId,100)}:{})}:null};
 p.vatTreatment=input.vatTreatment||defaultVat(p.buyer);
 if(!['exempt','eu-services'].includes(p.vatTreatment)||(p.vatTreatment==='eu-services'&&!euBusiness(p.buyer)))throw Error('NP / reverse charge wymaga firmy z innego kraju UE.');
 if(!Object.hasOwn(logos,p.brand)||!['PLN','EUR'].includes(p.currency)||!['cash','transfer','card'].includes(p.payment))throw Error('Nieprawidłowy wybór formularza.');
 for(const date of [p.issueDate,p.saleDate,p.dueDate])if(!/^20\d\d-\d\d-\d\d$/.test(date||'')||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Podaj poprawne daty.');
 if(!input?.correction&&p.dueDate<p.issueDate)throw Error('Termin płatności nie może poprzedzać wystawienia.');
 if(p.bank&&!validBank(p.bank))throw Error('Podaj poprawny polski numer rachunku (26 cyfr, z prawidłową sumą kontrolną).');
 if(p.payment==='transfer'&&!p.bank)throw Error('Uzupełnij numer rachunku do przelewu.');
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>200)throw Error('Dodaj od 1 do 200 pozycji.');
 p.lines=input.lines.map(l=>{const name=text(l.name),unit=text(l.unit,30),qty=decimal(l.qty,3),price=decimal(l.price);if(!name||!unit||qty<=0)throw Error('Uzupełnij nazwę, jednostkę i dodatnią ilość każdej pozycji.');if(!Number.isSafeInteger(qty*price))throw Error('Wartość pozycji jest zbyt duża.');const discount=lineDiscount(l);if(Math.round(price*qty/1000)-discount<0)throw Error('Rabat nie może przekraczać wartości pozycji.');return {name,unit,qty:(qty/1000).toFixed(3).replace(/\.?0+$/,''),price:(price/100).toFixed(2),...(l.discount!=null?{discount:(discount/100).toFixed(2)}:{})};});
 if(p.source?.app==='robisie'&&p.source.invoiceMode==='detailed'&&p.currency!=='PLN')throw Error('Rozbudowana kalkulacja Robisię jest w PLN.');
 if(!input?.correction&&p.source?.app==='robisie'&&p.source.invoiceMode==='detailed'&&p.source.stageId)throw Error('Rozliczenie etapu wymaga faktury prostej.');
 if(!input?.correction&&p.source?.app==='robisie'&&p.source.invoiceMode==='simple'&&p.lines.length!==1)throw Error('Faktura prosta ma jedną pozycję.');
 if(total(p)<0||(!input?.correction&&!allowZero&&total(p)===0)||total(p)>99999999999)throw Error('Nieprawidłowa suma faktury.');
 if(input?.correction){
  const c=input.correction;if(!/^[0-9a-f-]{36}$/i.test(c.originalId||'')||!['data','amount','tax'].includes(c.mode))throw Error('Nieprawidłowe powiązanie lub rodzaj korekty.');
  const reason=text(c.reason,256);if(!reason)throw Error('Wpisz przyczynę korekty.');
  if(!Array.isArray(c.references)||!c.references.length||c.references.length>2)throw Error('Brak danych faktury korygowanej.');
  const references=c.references.map(r=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(r.issueDate||'')||(!(r.outsideKsef===true&&!r.ksefNumber)&&!/^\d{10}-\d{8}-[a-f\d]{12}-[a-f\d]{2}$/i.test(r.ksefNumber||''))||!text(r.number,256))throw Error('Nieprawidłowe dane faktury korygowanej.');return {number:text(r.number,256),issueDate:r.issueDate,ksefNumber:r.ksefNumber||null,...(r.outsideKsef===true?{outsideKsef:true}:{})};});
  if(!c.before||c.before.correction)throw Error('Brak stanu przed korektą.');const before=normalize({...c.before,vatTreatment:c.before.vatTreatment||'exempt'},{allowZero:true});
  if(p.currency!==before.currency||p.buyer.nip!==before.buyer.nip||p.buyer.country!==before.buyer.country||p.buyer.kind!==before.buyer.kind)throw Error('Korekta zachowuje walutę i identyfikator nabywcy. Błędny NIP wymaga korekty do zera i nowej faktury.');
  if(JSON.stringify(p.recipient)!==JSON.stringify(before.recipient))throw Error('Ta korekta zachowuje odbiorcę z faktury pierwotnej.');
  if(p.saleDate!==before.saleDate)throw Error('Korekta zachowuje datę wykonania usługi.');
  if(['data','tax'].includes(c.mode)&&(JSON.stringify(p.lines)!==JSON.stringify(before.lines)||p.payment!==before.payment||p.bank!==before.bank))throw Error('Korekta danych nie może zmieniać pozycji ani płatności. Wybierz korektę kwot.');
  if(c.mode==='data'&&['name','address','city'].every(k=>p.buyer[k]===before.buyer[k]))throw Error('Zmień nazwę lub adres nabywcy, aby wystawić korektę danych.');
  if(c.mode==='tax'&&(p.vatTreatment===before.vatTreatment||JSON.stringify(p.buyer)!==JSON.stringify(before.buyer)))throw Error('Korekta VAT wymaga zmiany oznaczenia VAT i zachowania danych nabywcy.');
  p.correction={originalId:c.originalId,mode:c.mode,reason,references,before};
  if(invoiceAmount(p)>0&&p.dueDate<p.issueDate)throw Error('Termin dopłaty nie może poprzedzać wystawienia korekty.');
 }
 return p;
}

export const invoiceAmount=p=>total(p)-(p.correction?total(p.correction.before):0);
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
export function invoiceXml(row,createdAt=new Date().toISOString()){
 const p=normalize(storedPayload(row)),amount=(invoiceAmount(p)/100).toFixed(2);
 const c=p.correction,reference=c?tag('PrzyczynaKorekty',c.reason)+c.references.map(r=>`<DaneFaKorygowanej>${tag('DataWystFaKorygowanej',r.issueDate)}${tag('NrFaKorygowanej',r.number)}${r.outsideKsef?'<NrKSeFN>1</NrKSeFN>':'<NrKSeF>1</NrKSeF>'+tag('NrKSeFFaKorygowanej',r.ksefNumber)}</DaneFaKorygowanej>`).join('')+(['name','address','city'].some(k=>p.buyer[k]!==c.before.buyer[k])?`<Podmiot2K>${identity(c.before.buyer)}${address(c.before.buyer)}</Podmiot2K>`:''):'';
 const rows=c?((['amount','tax'].includes(c.mode)||p.vatTreatment!==c.before.vatTreatment)?[...c.before.lines.map(l=>({...l,before:true})),...p.lines]:[]):p.lines;
 const rc=p.vatTreatment==='eu-services',vatChanged=c&&p.vatTreatment!==c.before.vatTreatment;
 const sums=vatChanged?tag(c.before.vatTreatment==='eu-services'?'P_13_9':'P_13_7',(-total(c.before)/100).toFixed(2))+tag(rc?'P_13_9':'P_13_7',(total(p)/100).toFixed(2)):tag(rc?'P_13_9':'P_13_7',amount);
 if(!row.number)throw Error('Brak numeru faktury.');
 return '<?xml version="1.0" encoding="utf-8"?>'+`<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza>${tag('DataWytworzeniaFa',createdAt)}<SystemInfo>Robisię-Fer Bill ${VERSION}</SystemInfo></Naglowek><Podmiot1>${identity(SELLER)}${address(SELLER)}</Podmiot1><Podmiot2>${identity(p.buyer)}${address(p.buyer)}<JST>2</JST><GV>2</GV></Podmiot2>${p.recipient?`<Podmiot3>${identity(p.recipient)}${address(p.recipient)}<Rola>2</Rola></Podmiot3>`:''}<Fa>${tag('KodWaluty',p.currency)}${tag('P_1',p.issueDate)}${tag('P_2',row.number)}${tag('P_6',p.saleDate)}${sums}${tag('P_15',amount)}<Adnotacje><P_16>2</P_16><P_17>2</P_17>${tag('P_18',rc?1:2)}<P_18A>2</P_18A><Zwolnienie>${rc?'<P_19N>1</P_19N>':'<P_19>1</P_19>'+tag('P_19A',EXEMPTION)}</Zwolnienie><NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu><P_23>2</P_23><PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy></Adnotacje>${tag('RodzajFaktury',c?'KOR':'VAT')}${reference}${p.notes?`<DodatkowyOpis><Klucz>Uwagi</Klucz>${tag('Wartosc',p.notes)}</DodatkowyOpis>`:''}${rows.map((l,i)=>`<FaWiersz>${tag('NrWierszaFa',i+1)}${tag('P_7',l.name)}${tag('P_8A',l.unit)}${tag('P_8B',l.qty)}${tag('P_9A',l.price)}${lineDiscount(l)?tag('P_10',(lineDiscount(l)/100).toFixed(2)):''}${tag('P_11',(lineTotal(l)/100).toFixed(2))}${tag('P_12',(l.before?c.before.vatTreatment:p.vatTreatment)==='eu-services'?'np II':'zw')}${l.before?'<StanPrzed>1</StanPrzed>':''}</FaWiersz>`).join('')}${!c||invoiceAmount(p)>0?`<Platnosc><TerminPlatnosci>${tag('Termin',p.dueDate)}</TerminPlatnosci>${tag('FormaPlatnosci',{cash:1,card:2,transfer:6}[p.payment])}${p.bank?`<RachunekBankowy>${tag('NrRB',p.bank)}</RachunekBankowy>`:''}</Platnosc>`:''}</Fa></Faktura>`;
}
