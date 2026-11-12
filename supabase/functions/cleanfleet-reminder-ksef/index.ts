import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {XMLParser,XMLValidator} from 'npm:fast-xml-parser@5.3.0';
import {createStateCodec,unb64,hash} from '../cleanfleet-ksef/core.js';
import {authenticate,ksefApi} from '../cleanfleet-bill/ksef.js';
import {createArchiveService} from '../cleanfleet-bill/archive.js';
import {day,validNip,period,paymentCandidate,eligibleCandidates,paymentPatch} from './core.js';

const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,cronSecret=Deno.env.get('CLEANFLEET_CRON_SECRET');
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const credentials=createStateCodec(secret,'saved-credentials-v1');
const origins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
const checked=(result:any)=>{if(result.error)throw Error(result.error.code==='23505'?'Ta faktura jest już powiązana z innym przypomnieniem.':result.error.message);return result.data;};
const message=(error:any)=>String(error?.message||'Nie udało się sprawdzić KSeF.').slice(0,500);

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'',headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
 const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers});
 try{
  if(origin&&!origins.includes(origin))return json({error:'Niedozwolone źródło.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'Niedozwolona metoda.'},405);
  const isCron=Boolean(cronSecret)&&req.headers.get('x-cleanfleet-cron-secret')===cronSecret;
  let userId='';
  if(!isCron){
   const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return json({error:'Zaloguj się.'},401);
   const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return json({error:'Zaloguj się ponownie.'},401);
   userId=auth.data.user.id;
   const role=checked(await db.from('user_roles').select('role').eq('user_id',userId).single());if(role?.role!=='admin')return json({error:'Dostęp tylko dla administratora.'},403);
  }
  const raw=await req.text();if(raw.length>4000)return json({error:'Za duże żądanie.'},413);const body=raw?JSON.parse(raw):{};
  const rows=isCron?checked(await db.from('cf_reminders').select('*').eq('invoice_source','ksef').in('status',['active','snoozed']).in('ksef_scan_status',['waiting','error','missing']).order('ksef_last_checked_at',{ascending:true,nullsFirst:true}).limit(15)):[checked(await db.from('cf_reminders').select('*').eq('id',String(body.reminder_id||'')).eq('user_id',userId).single())];
  const authCache=new Map(),listCache=new Map(),xmlCache=new Map(),api=ksefApi();
  async function authorization(owner:string){
   if(!authCache.has(owner))authCache.set(owner,(async()=>{
    const role=checked(await db.from('user_roles').select('role').eq('user_id',owner).single());if(role?.role!=='admin')throw Error('Brak uprawnień administratora.');
    const stored=checked(await db.from('cf_ksef_credentials').select('nip,ciphertext').eq('user_id',owner).eq('environment','production').maybeSingle());
    if(!stored)throw Error('Zapisz połączenie KSeF w Dokumentach dla księgowej.');
    const config=await credentials.open(stored.ciphertext,owner,'credential');
    if(config.environment!=='production'||config.nip!==stored.nip)throw Error('Nieprawidłowe zapisane połączenie KSeF.');
    return {...await authenticate(config.token,config.nip,api),nip:config.nip};
   })());return await authCache.get(owner);
  }
  const archive=createArchiveService({authorizeKsef:authorization,secret,api});
  async function usedInvoices(r:any){return checked(await db.from('cf_reminders').select('id,invoice_number,ksef_number').eq('user_id',r.user_id).neq('id',r.id).not('invoice_number','is',null).limit(2000));}
  async function update(r:any,patch:any){
   const saved=checked(await db.from('cf_reminders').update(patch).eq('id',r.id).eq('user_id',r.user_id).eq('invoice_source','ksef').eq('updated_at',r.updated_at).in('status',['active','snoozed']).select('id').maybeSingle());
   if(!saved)throw Error('Przypomnienie zmieniło się podczas odczytu. Otwórz je ponownie.');
  }
  async function scan(r:any){
   if(r.invoice_source!=='ksef'||!r.is_payment||!['active','snoozed'].includes(r.status))throw Error('Wybierz KSeF w aktywnym przypomnieniu płatności.');
   if(!validNip(r.ksef_seller_nip))throw Error('Uzupełnij poprawny NIP dostawcy.');
   if(r.ksef_scan_status==='applied')return {status:'applied',amount:r.amount,invoice_number:r.invoice_number};
   const range=period(r),today=day(new Date());
   if(isCron&&(range.month>today.slice(0,7)||day(r.ksef_last_checked_at)===today))return {status:'skipped'};
   const cacheKey=r.user_id+range.from+range.to;
   if(!listCache.has(cacheKey))listCache.set(cacheKey,(async()=>{
    let ticket,all:any[]=[];
    for(let page=0;page<4;page++){
     const result:any=await archive({action:'ksef-list',kind:'purchases',from:range.from,to:range.to,page,ticket},r.user_id);
     all.push(...result.invoices);ticket=result.ticket;
     if(result.isTruncated)throw Error('Lista KSeF jest niepełna. Spróbuj ponownie po uzupełnieniu importu.');
     if(!result.hasMore)return {all,ticket};
    }
    throw Error('Za dużo faktur w okresie do automatycznego dopasowania.');
   })());
   const {all,ticket}=await listCache.get(cacheKey),supplier=all.filter((m:any)=>String(m.seller?.nip)===r.ksef_seller_nip),hasCorrection=supplier.some((m:any)=>/^kor/i.test(m.invoiceType));
   const matches=supplier.filter((m:any)=>!/^kor/i.test(m.invoiceType));
   if(matches.length>12)throw Error('Dostawca ma ponad 12 faktur w okresie. Dopasuj fakturę ręcznie w Bill.');
   const parsed=[];
   for(const metadata of matches){
    const key=r.user_id+metadata.ksefNumber;
    if(!xmlCache.has(key))xmlCache.set(key,(async()=>{
     const result:any=await archive({action:'ksef-document',number:metadata.ksefNumber,ticket},r.user_id),bytes=unb64(result.content);
     const encoding=bytes[0]===255&&bytes[1]===254||bytes[0]===60&&bytes[1]===0?'utf-16le':bytes[0]===254&&bytes[1]===255||bytes[0]===0&&bytes[1]===60?'utf-16be':'utf-8',xml=new TextDecoder(encoding,{fatal:true}).decode(bytes);
     if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('Niepoprawny XML faktury KSeF.');
     if(metadata.invoiceHash&&await hash(bytes)!==metadata.invoiceHash)throw Error('Suma kontrolna faktury nie zgadza się z KSeF.');
     const parser=new XMLParser({ignoreAttributes:true,removeNSPrefix:true,parseTagValue:false,trimValues:true});
     const owner=await authorization(r.user_id);return paymentCandidate(parser.parse(xml),metadata,owner.nip);
    })());
    const candidate=await xmlCache.get(key);if(candidate)parsed.push(candidate);
   }
   const candidates=eligibleCandidates(r,parsed,await usedInvoices(r));
   if(hasCorrection)for(const candidate of candidates)candidate.warnings.push('W okresie znaleziono korektę od tego dostawcy. Sprawdź saldo przed potwierdzeniem.');
   const now=new Date().toISOString(),base={ksef_last_checked_at:now,ksef_last_error:null,ksef_candidates:candidates};
   if(candidates.length===1&&!candidates[0].warnings.length){
    await update(r,{...base,...paymentPatch(r,candidates[0])});return {status:'applied',amount:candidates[0].amount,invoice_number:candidates[0].invoice_number};
   }
   const status=candidates.length?'needs_review':'waiting';
   await update(r,{...base,ksef_scan_status:status});return {status,found:!!candidates.length};
  }
  if(!isCron&&body.action==='apply'){
   const r=rows[0];if(r.invoice_source!=='ksef'||r.ksef_scan_status!=='needs_review')throw Error('Otwórz aktualne propozycje KSeF.');
   const candidate=(r.ksef_candidates||[]).find((c:any)=>c.ksef_number===body.ksef_number);if(!candidate)throw Error('Nie znaleziono propozycji faktury.');
   if((await usedInvoices(r)).some((other:any)=>String(other.ksef_number||'').toUpperCase()===candidate.ksef_number.toUpperCase()||String(other.invoice_number).trim().toLowerCase()===candidate.invoice_number.trim().toLowerCase()))throw Error('Ta faktura jest już zapisana w innym przypomnieniu. Sprawdź je przed powiązaniem.');
   if(body.confirmed!==true)throw Error('Potwierdź wybór faktury.');
   await update(r,paymentPatch(r,candidate,String(body.due_date||'')));return json({status:'applied'});
  }
  if(!isCron&&body.action&&body.action!=='scan')throw Error('Nieznana operacja.');
  const stats={checked:0,applied:0,review:0,errors:0};
  for(const r of rows){
   try{const result=await scan(r);if(!isCron)return json(result);stats.checked++;if(result.status==='applied')stats.applied++;if(result.status==='needs_review')stats.review++;}
   catch(error){
    await db.from('cf_reminders').update({ksef_scan_status:'error',ksef_last_checked_at:new Date().toISOString(),ksef_last_error:message(error)}).eq('id',r.id).eq('user_id',r.user_id).eq('invoice_source','ksef').eq('updated_at',r.updated_at);
    if(!isCron)return json({error:message(error)},400);stats.errors++;
   }
  }
  return json({ok:true,...stats});
 }catch(error){return json({error:message(error)},400);}
});
