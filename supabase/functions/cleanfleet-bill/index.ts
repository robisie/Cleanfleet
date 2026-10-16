import {gus,lookupWithFallback} from './gus.js';
import {lookupCompany} from './registry.js';
import {stageInvoiceSeed,investmentInvoiceSeed} from '../../../app/robisie/billing.js';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createStateCodec,hash} from '../cleanfleet-ksef/core.js';
import {normalize,party,invoiceXml,SELLER,today,validBank} from './invoice.js';
import {ksefApi,authenticate,openSession,invoiceStatus,KsefError} from './ksef.js';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const credentials=createStateCodec(secret,'saved-credentials-v1'),codec=createStateCodec(secret,'bill-ksef-v1'),api=ksefApi();
const gusCodec=createStateCodec(secret,'bill-gus-config-v1');
async function savedGusKey(){const row=checked(await db.from('bill_settings').select('payload').single());return row?.payload?.gusKeyCiphertext?(await gusCodec.open(row.payload.gusKeyCiphertext,SELLER.nip,'gus-config')).key:'';}
const origins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
function checked(r:any){if(r.error)throw Error(r.error.code==='23505'?'Ten NIP lub numer już istnieje.':r.error.message);return r.data;}
async function invoice(id:string){if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('Nieprawidłowy identyfikator.');const row=checked(await db.from('bill_invoices').select('*').eq('id',id).single());if(!row)throw Error('Nie znaleziono faktury.');return row;}
async function authKsef(userId:string){
 const saved=checked(await db.from('cf_ksef_credentials').select('nip,ciphertext').eq('user_id',userId).eq('environment','production').maybeSingle());
 if(!saved||saved.nip!==SELLER.nip)throw Error('Brak zapisanej konfiguracji KSeF dla Twojego konta. Zapisz token w CleanFleet → Dokumenty księgowe → KSeF.');
 const state=await credentials.open(saved.ciphertext,userId,'credential');
 if(state.environment!=='production'||state.nip!==SELLER.nip)throw Error('Konfiguracja KSeF nie pasuje do wystawcy.');
 return authenticate(state.token,SELLER.nip,api);
}
async function patch(id:string,values:any,attempt?:string){let query=db.from('bill_invoices').update({...values,updated_at:new Date().toISOString()}).eq('id',id);if(attempt)query=query.eq('send_attempt',attempt);const row=checked(await query.select().maybeSingle());if(!row)throw Error('Operację przejęło inne urządzenie. Odśwież fakturę.');return row;}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'',headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
 try{
  if(origin&&!origins.includes(origin))return json({error:'Niedozwolone źródło.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'Niedozwolona metoda.'},405);
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return json({error:'Zaloguj się.'},401);
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user)return json({error:'Zaloguj się ponownie.'},401);
  const userId=data.user.id,role=await db.from('user_roles').select('role').eq('user_id',userId).single();
  if(role.error||role.data?.role!=='admin')return json({error:'Dostęp tylko dla administratora.'},403);
  const raw=await req.text();if(raw.length>300000)return json({error:'Żądanie jest za duże.'},413);
  const body=JSON.parse(raw);
  if(body.action==='lookup-nip')return json(await lookupWithFallback(body.nip,await savedGusKey(),{mfLookup:lookupCompany}));
  if(body.action==='gus-save-key'){
   const key=String(body.key||'').trim();if(!/^[a-zA-Z0-9]{20}$/.test(key)||key==='abcde12345abcde12345')throw Error('Podaj własny 20-znakowy klucz produkcyjny GUS.');
   await gus.check(key);const gusKeyCiphertext=await gusCodec.seal({key,userId:SELLER.nip,scope:'gus-config',expires:Number.MAX_SAFE_INTEGER});
   checked(await db.rpc('bill_update_settings',{p_fields:{gusKeyCiphertext}}));return json({ok:true});
  }
  if(body.action==='gus-check'){const key=await savedGusKey();if(!key)throw Error('Najpierw zapisz klucz produkcyjny GUS.');await gus.check(key);return json({message:'Połączenie z GUS działa. Klucz produkcyjny został zaakceptowany.'});}
  if(body.action==='gus-remove-key'){checked(await db.rpc('bill_update_settings',{p_fields:{gusKeyCiphertext:null}}));return json({ok:true});}
  if(body.action==='bootstrap'){
   const [invoices,parties,settings,counters,config,projects,companies,billing]=await Promise.all([
    db.from('bill_invoices').select('id,number,payload,revision,status,ksef_number,ksef_session,ksef_reference,ksef_message,created_at,updated_at').order('created_at',{ascending:false}).limit(1000),
    db.from('bill_parties').select('*').order('updated_at',{ascending:false}).limit(1000),db.from('bill_settings').select('payload').single(),db.from('bill_counters').select('*'),
    db.from('cf_ksef_credentials').select('nip').eq('user_id',userId).eq('environment','production').maybeSingle(),
    db.from('rs_projects').select('id,contract_number,name:payload->>name').eq('owner_id',userId).order('created_at',{ascending:false}).limit(250),
    db.from('companies').select('id,name,nip,address').eq('active',true),db.from('billing_companies').select('id,company_id,name,tax_id,address,currency').eq('active',true)]);
   return json({invoices:checked(invoices),parties:checked(parties),settings:{bank:checked(settings)?.payload?.bank||'',gusConfigured:!!checked(settings)?.payload?.gusKeyCiphertext},counters:checked(counters),ksefConfigured:checked(config)?.nip===SELLER.nip,sources:{projects:checked(projects).map((r:any)=>({id:r.id,name:r.name,number:r.contract_number})),companies:checked(companies),billing:checked(billing)}});
  }
  if(body.action==='source'){
   let buyer:any={},description='',source={app:body.app,id:body.id},currency='PLN';
   if(body.app==='robisie'){
    const project=checked(await db.from('rs_projects').select('id,contract_number,payload').eq('id',body.id).eq('owner_id',userId).single());
    return json(body.stageId?stageInvoiceSeed(project,String(body.stageId)):investmentInvoiceSeed(project));
   }else if(body.app==='cleanfleet'||body.app==='billing'){
    const billing=body.app==='billing',company=checked(await db.from(billing?'billing_companies':'companies').select('*').eq('id',body.id).single());
    buyer={kind:'company',name:company.name,nip:(billing?company.tax_id:company.nip)||'',address:company.address||'',city:''};description='Czyszczenie wnętrz pojazdów';currency=billing&&company.currency==='EUR'?'EUR':'PLN';
   }else throw Error('Nieprawidłowe źródło danych.');
   const match=buyer.address.match(/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(match){buyer.address=match[1].trim();buyer.city=match[2].trim();}
   return json({buyer,description,currency,source});
  }
  if(body.action==='search'){
   const q=String(body.q||'').replace(/[^\p{L}\p{N} /_.-]/gu,'').slice(0,100);
   let query=db.from('bill_invoices').select('id,number,payload,revision,status,ksef_number,ksef_session,ksef_reference,ksef_message,created_at,updated_at').order('created_at',{ascending:false}).limit(1000);
   if(body.sourceApp==='robisie'&&body.sourceId){checked(await db.from('rs_projects').select('id').eq('id',body.sourceId).eq('owner_id',userId).single());query=query.eq('payload->source->>app','robisie').eq('payload->source->>id',body.sourceId);if(body.stageId)query=query.eq('payload->source->>stageId',body.stageId);}
   if(q)query=query.or('number.ilike.%'+q+'%,ksef_number.ilike.%'+q+'%,payload->buyer->>name.ilike.%'+q+'%,payload->buyer->>nip.ilike.%'+q+'%');
   if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month||''))query=query.like('payload->>issueDate',body.month+'%');
   if(['cleanfleet','robisie'].includes(body.brand))query=query.eq('payload->>brand',body.brand);
   if(['draft','issued','sending','pending','accepted','rejected','uncertain'].includes(body.status))query=query.eq('status',body.status);
   return json(checked(await query));
  }
  if(body.action==='save-settings'){
   const bank=String(body.bank||'').replace(/\s/g,'');if(bank&&!validBank(bank))throw Error('Podaj poprawny numer rachunku (26 cyfr z sumą kontrolną).');checked(await db.rpc('bill_update_settings',{p_fields:{bank}}));return json({ok:true});
  }
  if(body.action==='save-party'){
   const payload=party(body.payload);let result;
   if(body.id)result=await db.from('bill_parties').update({payload,revision:body.revision+1,updated_at:new Date().toISOString()}).eq('id',body.id).eq('revision',body.revision).select().maybeSingle();
   else result=await db.from('bill_parties').insert({payload}).select().single();
   const row=checked(result);if(!row)throw Error('Kontrahent został zmieniony. Odśwież listę.');return json(row);
  }
  if(body.action==='save-draft'){
   // Partial drafts are allowed. Full validation happens before any number is allocated.
   if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw Error('Nieprawidłowy szkic.');
   if(!/^[0-9a-f-]{36}$/i.test(body.id||''))throw Error('Nieprawidłowy identyfikator szkicu.');
   if(body.payload.source?.app==='robisie'&&body.payload.source?.stageId){const origin=checked(await db.from('rs_projects').select('id,payload,contract_number').eq('id',body.payload.source.id).eq('owner_id',userId).single());stageInvoiceSeed(origin,body.payload.source.stageId);}
   const existing=checked(await db.from('bill_invoices').select('id,status,revision').eq('id',body.id).maybeSingle());
   if(existing){if(existing.status!=='draft')throw Error('Wystawiona faktura jest zablokowana.');const row=checked(await db.from('bill_invoices').update({payload:body.payload,revision:body.revision+1,updated_at:new Date().toISOString()}).eq('id',body.id).eq('status','draft').eq('revision',body.revision).select().maybeSingle());if(!row)throw Error('Szkic zmienił się na innym urządzeniu. Odśwież przed zapisem.');return json(row);}
   if(body.revision!==0)throw Error('Nie znaleziono pierwotnego szkicu. Odśwież dane.');
   return json(checked(await db.from('bill_invoices').insert({id:body.id,creator_id:userId,payload:body.payload}).select().single()));
  }
  if(body.action==='delete-draft'){checked(await db.from('bill_invoices').delete().eq('id',body.id).eq('status','draft'));return json({ok:true});}
  if(body.action==='check-ksef'){await authKsef(userId);return json({ok:true,message:'Połączenie z produkcyjnym KSeF działa. Uprawnienie do wysyłki zostanie również sprawdzone przez KSeF podczas wysyłania dokumentu.'});}
  if(body.action==='send'){
   let row=await invoice(body.id);
   if(!['draft','issued'].includes(row.status))return json(row);
   const payload=normalize(row.payload);
   if(payload.issueDate!==today())throw Error('Dla wysyłki online ustaw dzisiejszą datę wystawienia.');
   const auth=await authKsef(userId);
   if(row.status==='draft'){
    if(row.revision!==body.revision)throw Error('Szkic zmienił się. Odśwież dane.');
    row=checked(await db.rpc('bill_issue',{p_id:row.id,p_revision:row.revision}));
   }
   if(row.status!=='issued')return json(row);
   const attempt=crypto.randomUUID();
   const lock=checked(await db.from('bill_invoices').update({status:'sending',send_attempt:attempt,ksef_session:null,ksef_reference:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','issued').select().maybeSingle());
   if(!lock)return json(await invoice(row.id));
   row=lock;let postStarted=false,session:string|null=null;
   try{
    const xml=row.xml||invoiceXml(row,row.updated_at);
    row=await patch(row.id,{xml},attempt);
    const prepared=await openSession(auth,xml,api);session=prepared.session;
    const encrypted_state=await codec.seal({scope:'bill',userId,invoiceHash:prepared.body.invoiceHash,expires:Date.now()+3650*86400000});
    checked(await db.from('bill_ksef_state').upsert({invoice_id:row.id,encrypted_state}));
    row=await patch(row.id,{ksef_session:session,ksef_message:'Wysyłanie do KSeF…'},attempt);
    postStarted=true;
    const sent=await api('/sessions/online/'+encodeURIComponent(session)+'/invoices',auth.token,prepared.body);
    row=await patch(row.id,{status:'pending',ksef_reference:sent.referenceNumber,ksef_message:'KSeF przetwarza fakturę.'},attempt);
    try{await api('/sessions/online/'+encodeURIComponent(session)+'/close',auth.token,{});}catch{/* Status polling can continue even when close response is lost. */}
    return json(row);
   }catch(error){
    const current=await invoice(row.id);if(current.send_attempt!==attempt)return json(current);
    row=await patch(row.id,{status:postStarted&&!(error instanceof KsefError&&!error.uncertain)?'uncertain':'issued',ksef_message:postStarted&&!(error instanceof KsefError&&!error.uncertain)?'Nie potwierdzono wyniku wysyłki. Sprawdź status; program nie wyśle jej ponownie automatycznie.':String(error.message).slice(0,1000)},attempt);
    return json({invoice:row,error:row.ksef_message},postStarted?409:502);
   }
  }
  if(body.action==='status'){
   const row=await invoice(body.id);if(row.status==='accepted')return json(row);
   if(!row.ksef_session){
    if(row.status==='sending'&&Date.parse(row.updated_at)<Date.now()-90000){
     const recovered=checked(await db.from('bill_invoices').update({status:'issued',send_attempt:null,ksef_message:'Przerwano przygotowanie wysyłki. Dokument nie został wysłany; możesz ponowić.',updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','sending').is('ksef_session',null).eq('send_attempt',row.send_attempt).select().maybeSingle());
     return json(recovered||await invoice(row.id));
    }
    return json(row);
   }
   const auth=await authKsef(userId),saved=checked(await db.from('bill_ksef_state').select('encrypted_state').eq('invoice_id',row.id).single());
   const state=await codec.open(saved.encrypted_state,userId,'bill');
   const result=await invoiceStatus({...row,invoiceHash:state.invoiceHash},auth.token,api);
   return json(await patch(row.id,{status:result.status,ksef_message:result.message,...(result.number?{ksef_number:result.number}:{}),...(result.reference?{ksef_reference:result.reference}:{})}));
  }
  if(body.action==='document'){
   const row=await invoice(body.id);return json({...row,xml:row.xml|| (row.number?invoiceXml(row,row.updated_at):null)});
  }
  if(body.action==='upo'){
   const row=await invoice(body.id);if(row.status!=='accepted'||!row.ksef_number||!row.ksef_session)throw Error('UPO będzie dostępne po przyjęciu faktury.');
   const auth=await authKsef(userId),xml=await api('/sessions/'+encodeURIComponent(row.ksef_session)+'/invoices/ksef/'+encodeURIComponent(row.ksef_number)+'/upo',auth.token,undefined,true);
   return json({xml});
  }
  return json({error:'Nieznana operacja.'},400);
 }catch(e){return json({error:String(e.message||'Nie udało się wykonać operacji.').slice(0,2000)},400);}
});
