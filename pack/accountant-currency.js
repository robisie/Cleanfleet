import {date,today,cents,convert,documents} from './accountant-core.js?v=5';
const escaped=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Inputs are already restricted to company-account income by the private finance frame.
// Return payment facts only; titles, bank accounts and vault contents stay in that frame.
export function matchReceiptEvidence(rows,incomes,asOf=today()){
 const candidates=rows.filter(r=>r.kind==='sales'&&!/^kor/i.test(r.type)&&r.key&&typeof r.number==='string'&&r.number.trim()&&r.number.length<=200).slice(0,1000);
 const patterns=candidates.map(r=>[r,new RegExp('(^|[^\\p{L}\\p{N}])'+escaped(r.number)+'(?=$|[^\\p{L}\\p{N}])','iu')]),out=[],seen=new Set();
 for(const t of incomes||[]){
  if(t.excluded||!date(t.date)||t.date>asOf||!Number.isSafeInteger(t.amount)||t.amount<=0)continue;
  const matches=patterns.filter(([,re])=>re.test(String(t.title||'')));if(matches.length!==1)continue;
  const key=t.id?String(t.id):null;if(key&&seen.has(key))continue;if(key)seen.add(key);
  out.push({key:matches[0][0].key,date:t.date,amountCents:t.amount,currency:String(t.currency||'').toUpperCase(),source:'bank'});
 }
 return out;
}
export function conversionPlan(row,evidence=[],asOf=today()){
 const issue=row.issueDate,issueLeg=amount=>({date:issue,basis:'issue',native:amount});
 if(row.kind!=='sales'||/^kor/i.test(row.type))return [issueLeg(row.native)];
 const bank=evidence.filter(p=>p.key===row.key&&date(p.date)&&p.date<=asOf&&Number.isSafeInteger(p.amountCents)&&p.amountCents>0),paid=row.paid;
 const upfront=paid&&date(paid.date)&&paid.date<=asOf&&cents(paid.amount)>0?{key:row.key,date:paid.date,amountCents:cents(paid.amount),currency:row.currency,source:'invoice'}:null;
 // A dated, unambiguous company credit in PLN still establishes an EUR invoice's
 // receipt date. Its PLN amount is not mistaken for an amount in EUR.
 if(bank.some(p=>p.currency!==row.currency)||bank.reduce((sum,p)=>sum+p.amountCents,0)>row.gross){
  return [{date:bank.map(p=>p.date).sort().at(-1),basis:'receipt-date',native:row.native}];
 }
 const bankTotal=bank.reduce((sum,p)=>sum+p.amountCents,0),payments=bankTotal>=Number(upfront?.amountCents||0)?bank:upfront?[upfront]:[];
 if(!payments.length||!(row.gross>0))return [issueLeg(row.native)];
 const ordered=[...payments].sort((a,b)=>a.date.localeCompare(b.date)),sum=ordered.reduce((n,p)=>n+p.amountCents,0);
 if(sum>row.gross)return [{date:ordered.at(-1).date,basis:'receipt-date',native:row.native}];
 let allocatedGross=0,allocatedNative=0;const legs=[];
 for(const p of ordered){allocatedGross+=p.amountCents;const target=Math.round(Math.abs(row.native)*allocatedGross/row.gross),part=target-allocatedNative;allocatedNative=target;if(part)legs.push({date:p.date,basis:'receipt',native:Math.sign(row.native)*part});}
 const remainder=Math.abs(row.native)-allocatedNative;if(remainder)legs.push(issueLeg(Math.sign(row.native)*remainder));return legs;
}
export function createQuoteReader({fetchImpl=globalThis.fetch,asOf=today,now=Date.now}={}){
 const cache=new Map();
 async function read(currency,requestedDate,signal){
  if(!/^[A-Z]{3}$/.test(currency)||currency==='PLN'||!date(requestedDate)||requestedDate>asOf())throw Error('Brak poprawnej historycznej daty kursu.');
  const key=currency+':'+requestedDate,old=cache.get(key);
  if(old&&(requestedDate<asOf()||now()-old.at<15*60000))return old.promise;
  const promise=(async()=>{
   const from=new Date(Date.parse(requestedDate+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);
   for(const table of ['A','B']){
    const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,12000);if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});
    try{
     const url=`https://api.nbp.pl/api/exchangerates/rates/${table}/${currency}/${from}/${requestedDate}/?format=json`,response=await fetchImpl(url,{signal:controller.signal,headers:{Accept:'application/json'}});
     if(response.status===404)continue;if(!response.ok)throw Error('NBP nie zwrócił kursu ('+response.status+').');
     const body=await response.json();if(body.code!==currency||body.table!==table||!Array.isArray(body.rates))throw Error('Nieprawidłowa odpowiedź NBP.');
     const rates=body.rates.filter(r=>date(r.effectiveDate)&&r.effectiveDate>=from&&r.effectiveDate<=requestedDate&&Number.isFinite(r.mid)&&r.mid>0).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
     const chosen=rates.at(-1);if(chosen)return {currency,requestedDate,date:chosen.effectiveDate,rate:chosen.mid,table:String(chosen.no||table),source:'NBP',url};
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
   }
   throw Error('Brak historycznego kursu '+currency+' w NBP dla '+requestedDate+'.');
  })();
  cache.set(key,{at:now(),promise});if(cache.size>2000)cache.delete(cache.keys().next().value);
  try{return await promise;}catch(e){cache.delete(key);throw e;}
 }
 return {read,clear:()=>cache.clear()};
}
export async function hydrateCurrencies(data,state,{quote,getReceiptEvidence=()=>[],signal,asOf=today(),progress=()=>{}}){
 const rows=documents({...data,fx:{}},state).filter(r=>r.currency&&r.currency!=='PLN'&&r.native!==null&&r.native!==0&&r.status!=='exclude'&&state.overrides[r.key]?.pln==null);
 const evidence=await getReceiptEvidence(rows.filter(r=>r.kind==='sales')),plans=new Map(rows.map(r=>[r.key,conversionPlan(r,evidence,asOf)])),requests=new Map();
 for(const row of rows)for(const leg of plans.get(row.key))requests.set(row.currency+':'+leg.date,{currency:row.currency,date:leg.date});
 const quotes=new Map(),jobs=[...requests.entries()];let cursor=0,finished=0;
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{while(cursor<jobs.length){const [key,request]=jobs[cursor++];if(signal?.aborted)throw Error('Przeliczanie anulowane.');try{quotes.set(key,await quote(request.currency,request.date,signal));}catch(e){quotes.set(key,{error:e.name==='AbortError'?'Nie udało się pobrać kursu NBP. Odśwież dane.':e.message});}progress('Pobieranie kursów NBP: '+(++finished)+' z '+jobs.length);}}));
 const fx={};for(const row of rows){try{const legs=plans.get(row.key).map(leg=>{const rate=quotes.get(row.currency+':'+leg.date);if(!rate||rate.error)throw Error(rate?.error||'Brak kursu NBP.');return {...leg,requestedDate:leg.date,date:rate.date,rate:rate.rate,table:rate.table,url:rate.url,pln:convert(leg.native,String(rate.rate))};});fx[row.key]={currency:row.currency,native:row.native,issueDate:row.issueDate,amount:legs.reduce((sum,leg)=>sum+leg.pln,0),source:'NBP',legs};}catch(e){fx[row.key]={error:e.message};}}
 return fx;
}
