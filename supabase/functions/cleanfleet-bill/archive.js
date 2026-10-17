import {invoiceAmount,SELLER} from './invoice.js';
import {b64,hash,createStateCodec} from '../cleanfleet-ksef/core.js';
export const validKsefNumber=value=>/^\d{10}-\d{8}-[a-f\d]{12}-[a-f\d]{2}$/i.test(value||'');
export function archiveFilters(body){
 if(!['sales','purchases'].includes(body.kind))throw Error('Wybierz faktury sprzedażowe lub zakupowe.');
 const date=value=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Podaj poprawne daty.');return Date.parse(value);};
 const start=date(body.from),end=date(body.to);if(end<start||end-start>98*86400000)throw Error('Wybierz zakres do 99 dni, z datą końcową po początkowej.');
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const midnight=utc=>{const p=Object.fromEntries(formatter.formatToParts(new Date(utc)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));return utc-(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-utc);};
 const dateType=body.dateType||'Issue';if(!['Issue','Invoicing','PermanentStorage'].includes(dateType))throw Error('Nieprawidłowy typ daty.');
 return {subjectType:body.kind==='sales'?'Subject1':'Subject2',dateRange:{dateType,from:new Date(midnight(start)).toISOString(),to:new Date(midnight(end+86400000)-1).toISOString()}};
}
export async function acceptedBillMetadata(row){
 if(row.status!=='accepted'||!validKsefNumber(row.ksef_number)||!row.xml||!row.number)return null;const p=row.payload;return {billId:row.id,source:'bill-accepted',ksefNumber:row.ksef_number,invoiceNumber:row.number,issueDate:p.issueDate,seller:{nip:SELLER.nip,name:SELLER.name},buyer:{name:p.buyer.name,identifier:{type:p.buyer.nip?(p.buyer.country==='DE'?'VatUe':'Nip'):'None',value:p.buyer.nip||''}},grossAmount:invoiceAmount(p)/100,currency:p.currency,invoiceType:p.correction?'Kor':'Vat',invoiceHash:await hash(new TextEncoder().encode(row.xml))};
}
export function createArchiveService({authorizeKsef,secret,api,fetchImpl=fetch,now=Date.now,localSales=async()=>[]}){
 const codec=createStateCodec(secret,'bill-ksef-archive-v1');
 async function access(body,userId){if(body.ticket){try{return await codec.open(body.ticket,userId,'browse');}catch{throw Error('Sesja odczytu KSeF wygasła. Odśwież listę faktur.');}}const auth=await authorizeKsef(userId);return {accessToken:auth.token,expires:Math.min(auth.expires||now()+10*60000,now()+10*60000),userId,scope:'browse'};}
 async function seal(state){return codec.seal(state);}
 return async(body,userId)=>{
  if(body.action==='ksef-list'){
   const filters=archiveFilters(body),page=body.page??0;if(!Number.isInteger(page)||page<0||page>39)throw Error('Nieprawidłowa strona wyników.');
   const sort=body.sort||'Desc';if(!['Asc','Desc'].includes(sort))throw Error('Nieprawidłowe sortowanie.');
   const local=body.kind==='sales'&&filters.dateRange.dateType==='Issue'&&page===0?await localSales({from:body.from,to:body.to}):[];
   let state,result;try{state=await access(body,userId);result=await api('/invoices/query/metadata?sortOrder='+sort+'&pageOffset='+page+'&pageSize=250',state.accessToken,filters);}catch(error){if(!local.length)throw error;return {invoices:local,hasMore:false,isTruncated:false,page:0,ticket:'',partial:true,warning:'Nie udało się odczytać listy z KSeF. Pokazano wyłącznie dokumenty wystawione w Bill z zapisanym potwierdzeniem przyjęcia w KSeF. Lista sprzedaży spoza Bill może być niepełna. '+error.message};}

   if(!Array.isArray(result?.invoices)||result.invoices.length>250)throw Error('Nieprawidłowa lista KSeF.');
   const merged=new Map(local.map(row=>[row.ksefNumber,row]));for(const row of result.invoices)merged.set(row.ksefNumber,row);
   return {invoices:[...merged.values()],hasMore:result.hasMore===true&&page<39,isTruncated:result.isTruncated===true||(page===39&&result.hasMore===true),page,ticket:await seal(state)};
  }
  if(body.action==='ksef-document'){
   if(!validKsefNumber(body.number))throw Error('Nieprawidłowy numer KSeF.');const state=await access(body,userId),bytes=await api('/invoices/ksef/'+encodeURIComponent(body.number),state.accessToken,undefined,'bytes');
   if(bytes.length>10*1024*1024)throw Error('Faktura przekracza limit 10 MB.');return {content:b64(bytes)};
  }
  if(body.action==='ksef-export-start'){
   const filters=archiveFilters(body),auth=await authorizeKsef(userId),cert=await auth.keyFor('SymmetricKeyEncryption'),key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(16));
   const result=await api('/invoices/exports',auth.token,{encryption:{encryptedSymmetricKey:b64(await crypto.subtle.encrypt({name:'RSA-OAEP'},cert.key,key)),initializationVector:b64(iv),publicKeyId:cert.id},onlyMetadata:false,compressionType:'Zip',filters});
   const ticket=await seal({scope:'export',userId,accessToken:auth.token,reference:result.referenceNumber,expires:Math.min(auth.expires||now()+15*60000,now()+15*60000)});
   return {ticket,key:b64(key),iv:b64(iv)};
  }
  if(body.action==='ksef-export-status'){
   const state=await codec.open(body.ticket,userId,'export'),result=await api('/invoices/exports/'+encodeURIComponent(state.reference),state.accessToken);
   if(result.status?.code===100)return {status:'pending',retryAfter:4};
   if(result.status?.code!==200)throw Error('KSeF nie przygotował eksportu. Spróbuj ponownie.');const pack=result.package;
   if(!pack||pack.isTruncated||pack.compressionType!=='Zip'||!Number.isInteger(pack.invoiceCount)||pack.invoiceCount<0||!Number.isInteger(pack.size)||pack.size<0||pack.size>100*1024*1024)throw Error('Eksport jest niepełny lub przekracza 100 MB. Zawęź zakres dat.');
   const parts=[];const ordered=[...(pack.parts||[])].sort((a,b)=>a.ordinalNumber-b.ordinalNumber);if(ordered.length>16||(pack.invoiceCount&&!ordered.length))throw Error('Nieprawidłowe części eksportu.');
   for(const [i,p]of ordered.entries()){
    const url=new URL(p.url);if(p.ordinalNumber!==i+1||p.method!=='GET'||url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!Number.isInteger(p.encryptedPartSize)||p.encryptedPartSize<16||p.encryptedPartSize>50*1024*1024+16||!Number.isInteger(p.partSize)||p.partSize<0||! /^[A-Za-z0-9+/]{43}=$/.test(p.encryptedPartHash||'')||! /^[A-Za-z0-9+/]{43}=$/.test(p.partHash||''))throw Error('Nieprawidłowa część eksportu.');
    const expires=Math.min(state.expires,Date.parse(p.expirationDate));if(!Number.isFinite(expires)||expires<=now())throw Error('Link eksportu wygasł.');
    parts.push({ordinal:p.ordinalNumber,partSize:p.partSize,partHash:p.partHash,ticket:await seal({scope:'part',userId,url:p.url,size:p.encryptedPartSize,hash:p.encryptedPartHash,expires})});
   }
   if(ordered.reduce((sum,p)=>sum+p.partSize,0)!==pack.size)throw Error('Niezgodny rozmiar eksportu.');
   return {status:'ready',invoiceCount:pack.invoiceCount,size:pack.size,parts};
  }
  if(body.action==='ksef-export-part'){
   const state=await codec.open(body.ticket,userId,'part');let response;try{response=await fetchImpl(state.url,{redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw Error('Nie udało się pobrać części eksportu.');}
   if(!response.ok||!response.body)throw Error('Link eksportu wygasł. Przygotuj paczkę ponownie.');
   const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>state.size)throw Error('Niezgodny rozmiar części eksportu.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}if(size!==state.size||await hash(bytes)!==state.hash)throw Error('Weryfikacja części eksportu nie powiodła się.');return bytes;
  }
  throw Error('Nieznana operacja archiwum KSeF.');
 };
}
