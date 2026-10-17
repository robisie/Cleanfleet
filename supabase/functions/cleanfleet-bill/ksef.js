import {b64,unb64,hash,certificateKey} from '../cleanfleet-ksef/core.js';
export class KsefError extends Error{constructor(message,uncertain=false){super(message);this.uncertain=uncertain;}}
export function ksefApi(fetchImpl=fetch,{pause=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){return async(path,token,body,raw=false)=>{
 const readOnly=body===undefined||/^\/invoices\/query\/metadata(?:\?|$)/.test(path),sending=/^\/sessions\/online\/[^/]+\/invoices$/.test(path);
 const operation=path.startsWith('/invoices/query/metadata')?'pobrać listy faktur':path.startsWith('/security/')?'pobrać certyfikatów KSeF':path.startsWith('/auth/')?'uwierzytelnić w KSeF':path.startsWith('/invoices/ksef/')?'pobrać faktury':'pobrać danych z KSeF';
 const retrySeconds=value=>{if(!value)return 0;const seconds=Number(value);return Number.isFinite(seconds)&&seconds>=0?Math.ceil(seconds):Math.max(0,Math.ceil((Date.parse(value)-now())/1000))||0;};
 let r;
 for(let attempt=0;attempt<3;attempt++){
  try{r=await fetchImpl('https://api.ksef.mf.gov.pl/v2'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'});}
  catch{if(readOnly&&attempt<2){await pause(attempt===0?1000:2500);continue;}const error=new KsefError(sending?'Brak odpowiedzi KSeF. Sprawdź status wysyłki przed ponowieniem.':'Brak odpowiedzi KSeF. Nie udało się '+operation+'. Spróbuj ponownie później.',sending);error.retryable=readOnly;error.status=503;throw error;}
  if(readOnly&&[502,503,504].includes(r.status)&&attempt<2){const retry=retrySeconds(r.headers.get('Retry-After'));if(retry>10)break;await r.body?.cancel().catch(()=>{});await pause(retry?retry*1000:attempt===0?1000:2500);continue;}break;
 }
 if(r.status===429){const retry=retrySeconds(r.headers.get('Retry-After'))||60,error=new KsefError('KSeF ograniczył liczbę zapytań. Spróbuj ponownie za '+retry+' s.');error.retryAfter=retry;error.status=429;error.retryable=readOnly;throw error;}
 if(!r.ok){
  if(r.status===401||r.status===403)throw new KsefError('KSeF odrzucił dostęp. Sprawdź uprawnienia zapisane w tokenie (odczyt faktur wymaga InvoiceRead).');
  const temporary=[500,502,503,504].includes(r.status),error=new KsefError(sending?'KSeF zwrócił HTTP '+r.status+'. Sprawdź status dokumentu.':temporary?'KSeF jest chwilowo niedostępny (HTTP '+r.status+'). Nie udało się '+operation+'. Spróbuj ponownie później.':'KSeF zwrócił HTTP '+r.status+'. Nie udało się '+operation+'.',sending&&r.status>=500);
  error.status=temporary?r.status:400;error.retryAfter=retrySeconds(r.headers.get('Retry-After'));error.retryable=readOnly&&temporary;throw error;
 }
 if(raw==='bytes'){const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>10*1024*1024)throw new KsefError('Faktura przekracza limit 10 MB.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
 return raw?await r.text():r.status===204?null:await r.json();
};}
export async function authenticate(token,nip,api,pause=ms=>new Promise(r=>setTimeout(r,ms))){
 const certificates=await api('/security/public-key-certificates');
 async function keyFor(usage){const cert=certificates.filter(c=>c.usage?.includes(usage)&&Date.parse(c.validFrom)<=Date.now()&&Date.parse(c.validTo)>Date.now()).sort((a,b)=>Date.parse(b.validFrom)-Date.parse(a.validFrom))[0];if(!cert)throw Error('Brak aktualnego certyfikatu KSeF.');return {key:await certificateKey(cert.certificate),id:cert.publicKeyId};}
 const challenge=await api('/auth/challenge',null,{}),key=await keyFor('KsefTokenEncryption');
 if(!Number.isFinite(challenge.timestampMs))throw Error('Nieprawidłowa odpowiedź uwierzytelnienia KSeF.');
 const encryptedToken=b64(await crypto.subtle.encrypt({name:'RSA-OAEP'},key.key,new TextEncoder().encode(token+'|'+challenge.timestampMs)));
 const auth=await api('/auth/ksef-token',null,{challenge:challenge.challenge,contextIdentifier:{type:'Nip',value:nip},encryptedToken,publicKeyId:key.id});
 for(let i=0;i<15;i++){const status=await api('/auth/'+encodeURIComponent(auth.referenceNumber),auth.authenticationToken.token);if(status.status.code===200){const access=await api('/auth/token/redeem',auth.authenticationToken.token,{});return {token:access.accessToken.token,expires:Date.parse(access.accessToken.validUntil)-10000,keyFor};}if(status.status.code!==100)throw Error('KSeF odrzucił token lub jego uprawnienia.');await pause(1000);}
 throw Error('KSeF nadal sprawdza dostęp. Spróbuj za chwilę.');
}
export async function openSession(auth,xml,api){
 const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(16)),cert=await auth.keyFor('SymmetricKeyEncryption');
 const session=await api('/sessions/online',auth.token,{formCode:{systemCode:'FA (3)',schemaVersion:'1-0E',value:'FA'},encryption:{encryptedSymmetricKey:b64(await crypto.subtle.encrypt({name:'RSA-OAEP'},cert.key,key)),initializationVector:b64(iv),publicKeyId:cert.id}});
 const bytes=new TextEncoder().encode(xml),aes=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']);
 const encrypted=await crypto.subtle.encrypt({name:'AES-CBC',iv},aes,bytes);
 return {session:session.referenceNumber,body:{invoiceHash:await hash(bytes),invoiceSize:bytes.byteLength,encryptedInvoiceHash:await hash(encrypted),encryptedInvoiceSize:encrypted.byteLength,encryptedInvoiceContent:b64(encrypted),offlineMode:false}};
}
export async function invoiceStatus(row,token,api){
 const session=encodeURIComponent(row.ksef_session);
 let result;
 if(row.ksef_reference)result=await api('/sessions/'+session+'/invoices/'+encodeURIComponent(row.ksef_reference),token);
 else {
  // A dropped send response must never trigger another POST. Reconcile the original session.
  const list=await api('/sessions/'+session+'/invoices?pageSize=100',token);
  result=list.invoices?.find(i=>i.invoiceHash===row.invoiceHash);
  if(!result)return {status:'uncertain',message:'Oczekiwanie na potwierdzenie wysyłki. Nie wysyłaj ponownie; sprawdź status za chwilę.'};
 }
 const code=result.status?.code;
 if(code===200&&result.ksefNumber)return {status:'accepted',number:result.ksefNumber,reference:result.referenceNumber,message:'Przyjęta w KSeF'};
 if(code>=400)return {status:'rejected',reference:result.referenceNumber,message:[result.status.description,...(result.status.details||[])].filter(Boolean).join(' · ').slice(0,2000)};
 return {status:'pending',reference:result.referenceNumber,message:result.status?.description||'KSeF przetwarza fakturę.'};
}
