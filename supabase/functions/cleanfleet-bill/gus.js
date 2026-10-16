import xml from 'npm:xml-js@1.6.11';
import {validNip,today} from './invoice.js';
const NS='http://CIS/BIR/PUBL/2014/07';
export const GUS_ENDPOINT='https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const local=n=>n?.name?.split(':').at(-1);
function parse(source){if(source.length>524288||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('Nieprawidłowa odpowiedź GUS.');try{return xml.xml2js(source,{compact:false});}catch{throw Error('Nieprawidłowa odpowiedź GUS.');}}
function nodes(node,name){return (node.elements||[]).flatMap(n=>[...(local(n)===name?[n]:[]),...nodes(n,name)]);}
const content=node=>(node?.elements||[]).map(n=>n.text??n.cdata??'').join('').trim();
export function gusResult(raw,method){
 // BIR uses MTOM even for responses containing only XML. Extract the SOAP root part.
 const envelope=raw.match(/<(?:[\w.-]+:)?Envelope\b[\s\S]*?<\/(?:[\w.-]+:)?Envelope\s*>/);
 if(!envelope)throw Error('Nieprawidłowa odpowiedź GUS.');const tree=parse(envelope[0]);
 if(nodes(tree,'Fault').length)throw Error('GUS odrzucił zapytanie. Sprawdź klucz lub spróbuj później.');
 const result=nodes(tree,method+'Result');if(result.length!==1)throw Error('Nieprawidłowa odpowiedź GUS.');return content(result[0]);
}
export function companyFromGus(source,nip){
 const rows=nodes(parse(source),'dane').map(node=>Object.fromEntries((node.elements||[]).filter(n=>n.type==='element').map(n=>[local(n),content(n)])));
 const matching=rows.filter(r=>r.Nip===nip&&r.Nazwa&&!r.StatusNip);
 const main=matching.filter(r=>/^\d{9}$/.test(r.Regon));const candidates=main.length?main:matching;
 const unique=[...new Map(candidates.map(r=>[r.Regon,r])).values()];
 if(!unique.length)throw Error('GUS nie zwrócił firmy z tym NIP-em. Uzupełnij dane ręcznie.');
 if(unique.length!==1)throw Error('GUS zwrócił kilka podmiotów. Zweryfikuj i uzupełnij dane ręcznie.');
 const r=unique[0],address=[r.Ulica||r.Miejscowosc,[r.NrNieruchomosci,r.NrLokalu].filter(Boolean).join('/')].filter(Boolean).join(' '),city=[r.KodPocztowy,r.Miejscowosc].filter(Boolean).join(' ');
 const warnings=[];if(!r.KodPocztowy||!r.Miejscowosc||!r.NrNieruchomosci)warnings.push('Sprawdź i uzupełnij adres.');if(r.DataZakonczeniaDzialalnosci)warnings.push('GUS wskazuje zakończenie działalności: '+r.DataZakonczeniaDzialalnosci+'. Zweryfikuj dane.');
 return {buyer:{kind:'company',name:r.Nazwa.slice(0,512),nip,address,city,country:'PL',regon:r.Regon,krs:''},source:'GUS — rejestr REGON',date:today(),...(warnings.length?{warning:warnings.join(' ')}:{})};
}
export function createGusClient({fetchImpl=fetch,endpoint=GUS_ENDPOINT,pause=()=>new Promise(r=>setTimeout(r,400))}={}){
 async function call(method,body,sid){
  await pause();let response;
  try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/soap+xml; charset=utf-8',...(sid?{sid}:{})},body:`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:b="${NS}"><s:Header xmlns:a="http://www.w3.org/2005/08/addressing"><a:Action>${NS}/IUslugaBIRzewnPubl/${method}</a:Action><a:To>${esc(endpoint)}</a:To></s:Header><s:Body><b:${method}>${body}</b:${method}></s:Body></s:Envelope>`});}catch{throw Error('GUS jest chwilowo niedostępny. Spróbuj ponownie.');}
  if(!response.ok)throw Error('Nie udało się połączyć z GUS. Sprawdź klucz lub spróbuj później.');
  if(Number(response.headers.get('content-length'))>524288)throw Error('Odpowiedź GUS jest za duża.');
  const reader=response.body.getReader();let size=0;const chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>524288)throw Error('Odpowiedź GUS jest za duża.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return gusResult(new TextDecoder().decode(bytes),method);
 }
 async function session(key,fn){const sid=await call('Zaloguj',`<b:pKluczUzytkownika>${esc(key)}</b:pKluczUzytkownika>`);if(!/^[\w-]{20}$/.test(sid))throw Error('GUS nie zaakceptował klucza dostępu.');try{return await fn(sid);}finally{await call('Wyloguj',`<b:pIdentyfikatorSesji>${esc(sid)}</b:pIdentyfikatorSesji>`,sid).catch(()=>{});}}
 return {check:key=>session(key,async()=>true),lookup:(value,key)=>{const nip=String(value||'').replace(/[\s-]/g,'');if(!validNip(nip))throw Error('Wpisz poprawny polski NIP (10 cyfr).');return session(key,async sid=>{const result=await call('DaneSzukajPodmioty',`<b:pParametryWyszukiwania xmlns:d="${NS}/DataContract"><d:Nip>${nip}</d:Nip></b:pParametryWyszukiwania>`,sid);return companyFromGus(result||'<root/>',nip);});}};
}
export const gus=createGusClient();
export async function lookupWithFallback(nip,key,{gusClient=gus,mfLookup}={}){
 if(key){try{return await gusClient.lookup(nip,key);}catch{try{const result=await mfLookup(nip);return {...result,warning:[result.warning,'Nie udało się pobrać danych z GUS. Użyto wykazu MF.'].filter(Boolean).join(' ')};}catch{throw Error('Nie udało się pobrać danych z GUS ani MF. Sprawdź klucz GUS w Ustawieniach lub uzupełnij dane ręcznie.');}}}
 try{return await mfLookup(nip);}catch(error){throw Error(error.message+' Aby korzystać z rejestru REGON, dodaj klucz GUS w Ustawieniach.');}
}
