export const day=value=>{const d=new Date(value);return Number.isFinite(+d)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';};
export const validDate=value=>/^20\d\d-\d\d-\d\d$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const norm=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('pl').trim();
export function validNip(value){const n=String(value||'').replace(/[\s-]/g,'').replace(/^PL/i,'');return /^\d{10}$/.test(n)&&[6,5,7,2,3,4,5,6,7].reduce((s,w,i)=>s+w*Number(n[i]),0)%11===Number(n[9])?n:'';}
export function period(reminder){
 const anchor=day(reminder.ksef_anchor_due_at||reminder.due_at);if(!anchor)throw Error('Brak terminu przypomnienia.');
 const [year,month]=anchor.split('-').map(Number);
 return {month:anchor.slice(0,7),from:new Date(Date.UTC(year,month-3,1,12)).toISOString().slice(0,10),to:new Date(Date.UTC(year,month,0,12)).toISOString().slice(0,10)};
}
const array=value=>value==null?[]:Array.isArray(value)?value:[value];
const text=value=>typeof value==='object'?String(value?.['#text']||'').trim():String(value??'').trim();
const cents=value=>{const raw=text(value);if(!/^-?\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Nieprawidłowa kwota w fakturze KSeF.');const n=Math.round(Number(raw)*100);if(!Number.isSafeInteger(n))throw Error('Nieprawidłowa kwota faktury.');return n;};
export function paymentCandidate(parsed,metadata,buyerNip){
 const root=parsed?.Faktura;if(!root||Array.isArray(root)||Array.isArray(root.Fa)||Array.isArray(root.Podmiot1)||Array.isArray(root.Podmiot2))throw Error('Nieprawidłowa struktura XML faktury.');
 const fa=root.Fa||{},seller=root.Podmiot1?.DaneIdentyfikacyjne||{},buyer=root.Podmiot2?.DaneIdentyfikacyjne||{},payment=fa.Platnosc||{},settlement=fa.Rozliczenie||{};
 const nip=text(seller.NIP),number=text(fa.P_2),date=text(fa.P_1),currency=text(fa.KodWaluty),gross=cents(fa.P_15);
 if(nip!==String(metadata.seller?.nip)||text(buyer.NIP)!==buyerNip||number!==metadata.invoiceNumber||date!==metadata.issueDate||currency!==metadata.currency||gross!==Math.round(Number(metadata.grossAmount)*100)||!validDate(date))throw Error('Dane XML nie zgadzają się z listą KSeF lub nabywcą.');
 if(/^kor/i.test(text(fa.RodzajFaktury))||settlement.DoRozliczenia)return null;
 const base=settlement.DoZaplaty!=null?cents(settlement.DoZaplaty):gross;
 const paid=array(payment.ZaplataCzesciowa).reduce((sum,p)=>sum+cents(p.KwotaZaplatyCzesciowej),0);
 if(paid<0||base<=0||text(payment.Zaplacono)==='1'||text(payment.ZnacznikZaplatyCzesciowej)==='2')return null;
 const amount=Math.max(0,base-paid);if(!amount)return null;
 const terms=array(payment.TerminPlatnosci).map(t=>text(t.Termin)).filter(validDate),warnings=[];
 if(currency!=='PLN')warnings.push('Przypomnienia obsługują kwoty w PLN. Tę fakturę uzupełnij ręcznie.');
 if(terms.length!==1)warnings.push(terms.length?'Faktura ma kilka terminów płatności. Sprawdź raty i wybierz termin.':'Faktura nie ma jednoznacznego terminu płatności. Wybierz go przed zastosowaniem.');
 return {ksef_number:metadata.ksefNumber,invoice_number:number,invoice_date:date,seller:text(seller.Nazwa).slice(0,200),seller_nip:nip,amount:amount/100,currency,due_date:terms.length===1?terms[0]:null,warnings,search:JSON.stringify(root)};
}
export function eligibleCandidates(reminder,candidates,used=[]){
 const month=period(reminder).month,needle=norm(reminder.ksef_match_text);
 return candidates.filter(c=>c&&c.seller_nip===reminder.ksef_seller_nip&&(!c.due_date||c.due_date.startsWith(month))&&(!needle||norm(c.search||c.invoice_number).includes(needle))).map(c=>{
  const result={...c,warnings:[...(c.warnings||[])]};delete result.search;
  if(used.some(r=>r.id!==reminder.id&&(String(r.ksef_number||'').toUpperCase()===c.ksef_number.toUpperCase()||norm(r.invoice_number)===norm(c.invoice_number))))result.warnings.push('Ten numer faktury jest już zapisany w innym przypomnieniu. Sprawdź powiązanie, aby nie zapłacić dwa razy.');
  return result;
 });
}
function localIso(date,time){
 const utc=Date.parse(date+'T'+time+'Z'),offset=at=>{const p=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-at;};
 const first=utc-offset(utc);return new Date(utc-offset(first)).toISOString();
}
export function paymentPatch(reminder,candidate,chosenDate){
 const due=candidate.due_date||chosenDate;
 if(candidate.currency!=='PLN'||!Number.isFinite(candidate.amount)||candidate.amount<=0||!validDate(due))throw Error('Uzupełnij poprawny termin i kwotę faktury w PLN.');
 const old=new Date(reminder.due_at),time=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(old),start=localIso(due,time),duration=Math.max(0,Date.parse(reminder.end_at||reminder.due_at)-Date.parse(reminder.start_at||reminder.due_at));
 let remind=start,custom=null;const mode=reminder.reminder_mode||'at_time',days=({day_1:1,day_2:2,day_3:3})[mode];
 if(days){const date=new Date(due+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-days);remind=localIso(date.toISOString().slice(0,10),time);}
 if(mode==='custom'&&reminder.custom_remind_at){custom=new Date(Date.parse(start)-(Date.parse(reminder.due_at)-Date.parse(reminder.custom_remind_at))).toISOString();remind=custom;}
 return {amount:candidate.amount,invoice_number:candidate.invoice_number,payee:candidate.seller,ksef_number:candidate.ksef_number,ksef_scan_status:'applied',ksef_last_error:null,start_at:start,due_at:start,end_at:new Date(Date.parse(start)+duration).toISOString(),remind_at:remind,custom_remind_at:custom,push_sent_at:null};
}
