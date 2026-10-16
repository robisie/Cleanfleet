import {validNip,today} from './invoice.js';
export const REGISTRY_SOURCE='Wykaz podatników VAT — Ministerstwo Finansów';
const clean=(value,max=512)=>typeof value==='string'?value.replace(/[\x00-\x1f]/g,' ').trim().slice(0,max):'';
export function companyFromRegistry(subject,nip){
 if(!subject||clean(subject.nip,20)!==nip||!clean(subject.name))throw Error('Nie znaleziono firmy o tym NIP-ie w wykazie MF. Uzupełnij dane ręcznie.');
 // MF: residenceAddress is the sole trader's business seat; workingAddress is the registered address.
 const fullAddress=clean(subject.residenceAddress)||clean(subject.workingAddress),match=fullAddress.match(/^(.*?)[,\s]+(\d{2}-\d{3})\s+(.+)$/u);
 const address=match?match[1].replace(/[,\s]+$/,'').trim():fullAddress,city=match?match[2]+' '+match[3].trim():'';
 return {buyer:{kind:'company',name:clean(subject.name),nip,address,city,country:'PL',regon:clean(subject.regon,14),krs:clean(subject.krs,10)},source:REGISTRY_SOURCE,...(!address||!city?{warning:'Sprawdź i uzupełnij adres, kod pocztowy i miejscowość. Wykaz nie zwrócił kompletnego adresu.'}:{})};
}
export function createCompanyLookup({fetchImpl=fetch,date=today,now=Date.now}={}){
 const cache=new Map();
 return async value=>{
  const nip=String(value||'').replace(/[\s-]/g,'');if(!validNip(nip))throw Error('Wpisz poprawny polski NIP (10 cyfr).');
  const day=date(),key=day+':'+nip,cached=cache.get(key);if(cached&&cached.expires>now())return structuredClone(cached.result);
  let response;try{response=await fetchImpl('https://wykazpodatnikowvat.mf.gov.pl/api/search/nip/'+nip+'?date='+day,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw Error('Wykaz MF jest chwilowo niedostępny. Spróbuj ponownie lub wpisz dane ręcznie.');}
  if(response.status===429)throw Error('Wykaz MF ograniczył liczbę zapytań. Spróbuj później lub wpisz dane ręcznie.');
  if(!response.ok)throw Error('Nie udało się pobrać danych z wykazu MF. Możesz uzupełnić je ręcznie.');
  let body;try{body=await response.json();}catch{throw Error('Nieprawidłowa odpowiedź wykazu MF. Wpisz dane ręcznie.');}
  const result={...companyFromRegistry(body?.result?.subject,nip),date:day};
  if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(key,{expires:now()+6*60*60*1000,result});return structuredClone(result);
 };
}
export const lookupCompany=createCompanyLookup();
