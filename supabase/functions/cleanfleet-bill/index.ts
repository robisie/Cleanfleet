import {fleetParty,fleetOptions,guardFleetPayload,fleetView,fleetPaymentEvidence} from './fleet.js';
import {createArchiveService,acceptedBillMetadata} from './archive.js';
import {gus,lookupWithFallback} from './gus.js';
import {lookupCompany} from './registry.js';
import {stageInvoiceSeed,investmentInvoiceSeed} from '../../../app/robisie/billing.js';
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {openAccount} from '../pack-bank-mail/vault.js';
import '../pack-bank-mail/engine.js';
import {reconcileBillPayments} from '../_shared/bill-bank-match.js';
import {createStateCodec,hash} from '../cleanfleet-ksef/core.js';
import {normalize,newInvoice,party,invoiceXml,invoiceAmount,advanceAllocation,SELLER,today,validBank,correctionSeed,storedPayload,externalReference} from './invoice.js';
import {ksefApi,authenticate,openSession,invoiceStatus,KsefError} from './ksef.js';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const credentials=createStateCodec(secret,'saved-credentials-v1'),codec=createStateCodec(secret,'bill-ksef-v1'),api=ksefApi();
const gusCodec=createStateCodec(secret,'bill-gus-config-v1');
async function savedGusKey(){const row=checked(await db.from('bill_settings').select('payload').single());return row?.payload?.gusKeyCiphertext?(await gusCodec.open(row.payload.gusKeyCiphertext,SELLER.nip,'gus-config')).key:'';}
async function acceptedSales(range:any){const rows=checked(await db.from('bill_invoices').select('id,number,status,ksef_number,payload,xml').eq('status','accepted').gte('payload->>issueDate',range.from).lte('payload->>issueDate',range.to).order('created_at',{ascending:false}).limit(1000));return (await Promise.all(rows.map(acceptedBillMetadata))).filter(Boolean);}
const archive=createArchiveService({authorizeKsef:authKsef,secret,api,localSales:acceptedSales});
const origins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
function checked(r:any){if(r.error)throw Error(r.error.code==='23505'?'Ten NIP lub numer już istnieje.':r.error.message);return r.data;}
async function invoice(id:string){if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('Nieprawidłowy identyfikator.');const row=checked(await db.from('bill_invoices').select('*').eq('id',id).single());if(!row)throw Error('Nie znaleziono faktury.');return row;}
async function reconcileVault(userId:string){
 const vault=checked(await db.from('cf_payment_vaults').select('envelope').eq('user_id',userId).maybeSingle());
 if(!vault?.envelope?.accountKey)return;
 const {state}=await openAccount(vault.envelope);
 await reconcileBillPayments(db,userId,state,(globalThis as any).Payments,invoiceAmount);
}
async function fleetAttachment(id:string){return checked(await db.from('bill_fleet_attachments').select('*').eq('invoice_id',id).maybeSingle());}
async function canonicalFleet(id:string,payload:any){return guardFleetPayload(payload,await fleetAttachment(id));}
async function canonicalCorrection(payload:any){if(!payload?.correction)return payload;const parent=await invoice(payload.correction.originalId),seed=correctionSeed(parent);return {...payload,source:seed.source,correction:{...seed.correction,mode:payload.correction.mode,reason:payload.correction.reason}};}
async function canonicalFinal(payload:any,userId:string,currentId?:string){
 if(payload?.documentType!=='final')return payload;
 if(!Array.isArray(payload.advances)||!payload.advances.length||payload.advances.length>30)throw Error('Wybierz wcześniejsze faktury zaliczkowe.');
 const ids=payload.advances.map((a:any)=>a.id);
 if(new Set(ids).size!==ids.length)throw Error('Zaliczka została wybrana więcej niż raz.');
 const advances=[];
 for(const id of ids){const row=await invoice(id);if(row.creator_id!==userId||row.status!=='accepted'||!row.ksef_number||row.payload.documentType!=='advance')throw Error('Faktura zaliczkowa musi być wcześniej przyjęta w KSeF.');advances.push({id:row.id,number:row.number,ksefNumber:row.ksef_number,amount:row.payload.advanceAmount,lines:advanceAllocation(row.payload)});}
 const first=(await invoice(ids[0])).payload;
 if(payload.currency!==first.currency||JSON.stringify(payload.buyer)!==JSON.stringify(first.buyer)||JSON.stringify(payload.lines)!==JSON.stringify(first.lines)||String(payload.globalDiscount||'0')!==String(first.globalDiscount||'0')||payload.orderNumber!==first.orderNumber||payload.contractNumber!==first.contractNumber)throw Error('Faktura końcowa musi zachować nabywcę, pozycje, rabat i zamówienie z zaliczki.');
 for(const id of ids.slice(1)){const other=(await invoice(id)).payload;if(other.currency!==first.currency||JSON.stringify(other.buyer)!==JSON.stringify(first.buyer)||JSON.stringify(other.lines)!==JSON.stringify(first.lines)||String(other.globalDiscount||'0')!==String(first.globalDiscount||'0')||other.orderNumber!==first.orderNumber||other.contractNumber!==first.contractNumber)throw Error('Wybrane zaliczki dotyczą różnych zamówień.');}
 const existing=checked(await db.from('bill_invoices').select('id,payload').eq('creator_id',userId).eq('payload->>documentType','final').in('status',['issued','pending','sending','uncertain','accepted']).limit(1000));
 if(existing.some((r:any)=>r.id!==currentId&&r.payload.advances?.some((a:any)=>ids.includes(a.id))))throw Error('Ta zaliczka jest już rozliczona na innej fakturze końcowej.');
 return {...payload,advances};
}
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
  if(String(body.action||'').startsWith('ksef-')){const result=await archive(body,userId);return result instanceof Uint8Array?new Response(result,{headers:{...headers,'Content-Type':'application/octet-stream'}}):json(result);}
  if(body.action==='fleet-create'){
   if(!/^[0-9a-f-]{36}$/i.test(body.id||'')||!Array.isArray(body.recordIds)||body.recordIds.length>200||!Number.isSafeInteger(body.expectedCents)||body.expectedCents<=0)throw Error('Nieprawidłowy wybór aut.');
   const description=String(body.description||'').trim();if(!description||description.length>400)throw Error('Wpisz nazwę usługi (do 400 znaków).');
   const company=checked(await db.from('companies').select('*').eq('id',body.companyId).eq('active',true).single());
   const billing=body.billingCompanyId?checked(await db.from('billing_companies').select('*').eq('id',body.billingCompanyId).eq('company_id',body.companyId).eq('active',true).single()):null;
   const settings=checked(await db.from('bill_settings').select('payload').single());
   const payload={...newInvoice('cleanfleet'),buyer:fleetParty(company,billing),bank:settings?.payload?.bank||'',lines:[{name:description,unit:'szt.',qty:'1',price:'0.00'}]};
   return json(checked(await db.rpc('bill_create_fleet_draft',{p_id:body.id,p_user:userId,p_company:body.companyId,p_billing:body.billingCompanyId||null,p_period:body.period,p_ids:body.recordIds,p_payload:payload,p_options:fleetOptions(body.options),p_expected:body.expectedCents})));
  }
  if(body.action==='fleet-payments')return json(await fleetPaymentEvidence(db,body.ids));
  if(body.action==='fleet-list'){
   const rows=checked(await db.from('bill_invoices').select('id,number,status,payload,created_at').eq('payload->source->>app','cleanfleet').eq('payload->source->>id',body.companyId).order('created_at',{ascending:false}).limit(100));
   return json(rows.filter((r:any)=>r.payload.source?.fleetId===r.id).map((r:any)=>({id:r.id,number:r.number,status:r.status,description:r.payload.source?.fleetLayout==='vehicle-lines'?String(r.payload.lines?.[0]?.name||'').replace(/ — [^—]+$/,''):r.payload.lines?.[0]?.name})));
  }
  if(body.action==='fleet-attachment'){
   const a=body.cfInvoiceId?checked(await db.from('bill_fleet_attachments').select('*').eq('cf_invoice_id',body.cfInvoiceId).maybeSingle()):await fleetAttachment(body.id);
   if(!a)return json(null);return json(fleetView(a,await invoice(a.invoice_id)));
  }
  if(body.action==='issue-only'){
   let row=await invoice(body.id);if(row.status!=='draft')return json(row);
   const payload=normalize(await canonicalFinal(await canonicalFleet(row.id,await canonicalCorrection(row.payload)),userId,row.id));
   row=checked(await db.rpc('bill_issue_prepared',{p_id:row.id,p_revision:body.revision,p_payload:payload}));
   return json(row);
  }
  if(body.action==='lookup-nip')return json(await lookupWithFallback(body.nip,await savedGusKey(),{mfLookup:lookupCompany}));
  if(body.action==='gus-save-key'){
   const key=String(body.key||'').trim();if(!/^[a-zA-Z0-9]{20}$/.test(key)||key==='abcde12345abcde12345')throw Error('Podaj własny 20-znakowy klucz produkcyjny GUS.');
   await gus.check(key);const gusKeyCiphertext=await gusCodec.seal({key,userId:SELLER.nip,scope:'gus-config',expires:Number.MAX_SAFE_INTEGER});
   checked(await db.rpc('bill_update_settings',{p_fields:{gusKeyCiphertext}}));return json({ok:true});
  }
  if(body.action==='gus-check'){const key=await savedGusKey();if(!key)throw Error('Najpierw zapisz klucz produkcyjny GUS.');await gus.check(key);return json({message:'Połączenie z GUS działa. Klucz produkcyjny został zaakceptowany.'});}
  if(body.action==='gus-remove-key'){checked(await db.rpc('bill_update_settings',{p_fields:{gusKeyCiphertext:null}}));return json({ok:true});}
  if(body.action==='payment-mark'){
   const row=await invoice(String(body.id||''));
   if(row.status==='draft'||row.payload?.correction||!row.number)throw Error('Oznaczenie płatności jest dostępne tylko dla wystawionej faktury.');
   if(typeof body.paid!=='boolean')throw Error('Nieprawidłowy status płatności.');
   const current=checked(await db.from('bill_payment_evidence').select('invoice_id').eq('invoice_id',row.id).maybeSingle());
   const values={manual_paid:body.paid,updated_at:new Date().toISOString()};
   let saved=current?await db.from('bill_payment_evidence').update(values).eq('invoice_id',row.id).select('*').single():await db.from('bill_payment_evidence').insert({invoice_id:row.id,...values}).select('*').single();
   if(saved.error?.code==='23505')saved=await db.from('bill_payment_evidence').update(values).eq('invoice_id',row.id).select('*').single();
   return json(checked(saved));
  }
  if(body.action==='bootstrap'){
   await reconcileVault(userId);
   const [invoices,parties,settings,counters,config,projects,companies,billing,payments]=await Promise.all([
    db.from('bill_invoices').select('id,number,payload,revision,status,ksef_number,ksef_session,ksef_reference,ksef_message,created_at,updated_at').order('created_at',{ascending:false}).limit(1000),
    db.from('bill_parties').select('*').order('updated_at',{ascending:false}).limit(1000),db.from('bill_settings').select('payload').single(),db.from('bill_counters').select('*'),
    db.from('cf_ksef_credentials').select('nip').eq('user_id',userId).eq('environment','production').maybeSingle(),
    db.from('rs_projects').select('id,contract_number,name:payload->>name').eq('owner_id',userId).order('created_at',{ascending:false}).limit(250),
    db.from('companies').select('id,name,nip,address').eq('active',true),db.from('billing_companies').select('id,company_id,name,tax_id,address,currency').eq('active',true),db.from('bill_payment_evidence').select('invoice_id,manual_paid,bank_cents,bank_payments').limit(1000)]);
   return json({invoices:checked(invoices),payments:checked(payments),parties:checked(parties),settings:{bank:checked(settings)?.payload?.bank||'',gusConfigured:!!checked(settings)?.payload?.gusKeyCiphertext},counters:checked(counters),ksefConfigured:checked(config)?.nip===SELLER.nip,sources:{projects:checked(projects).map((r:any)=>({id:r.id,name:r.name,number:r.contract_number})),companies:checked(companies),billing:checked(billing)}});
  }
  if(body.action==='correction-history'){
   const page=body.page;
   if(!Number.isSafeInteger(page)||page<0||page>=100)throw Error('Nieprawidłowa strona historii korekt.');
   return json(checked(await db.from('bill_invoices')
    .select('id,number,payload,revision,status,ksef_number,ksef_session,ksef_reference,ksef_message,created_at,updated_at')
    .not('payload->correction','is',null)
    .order('created_at',{ascending:false}).range(page*1000,page*1000+999)));
  }
  if(body.action==='source'){
   let buyer:any={},description='',source={app:body.app,id:body.id},currency='PLN';
   if(body.app==='robisie'){
    const project=checked(await db.from('rs_projects').select('id,contract_number,payload').eq('id',body.id).eq('owner_id',userId).single());
    return json(body.stageId?stageInvoiceSeed(project,String(body.stageId)):investmentInvoiceSeed(project));
   }else if(body.app==='cleanfleet'||body.app==='billing'){
    const billing=body.app==='billing',company=checked(await db.from(billing?'billing_companies':'companies').select('*').eq('id',body.id).single());
    buyer={kind:'company',name:company.name,nip:(billing?company.tax_id:company.nip)||'',address:company.address||'',city:'',country:/^DE/i.test((billing?company.tax_id:company.nip)||'')?'DE':'PL'};description='Czyszczenie wnętrz pojazdów';currency=billing&&company.currency==='EUR'?'EUR':'PLN';
   }else throw Error('Nieprawidłowe źródło danych.');
   const match=buyer.country==='DE'?buyer.address.replace(/,?\s*Niemcy\s*$/i,'').match(/^(.*?)[,\n ]+(\d{5}\s+.+)$/s):buyer.address.match(/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(match){buyer.address=match[1].trim();buyer.city=match[2].trim();}
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
  if(body.action==='external-ksef-reference'){
   const row=await invoice(body.id);
   if(row.status!=='issued'||row.payload.source?.app!=='external'||row.payload.correction)throw Error('Ta operacja dotyczy wyłącznie oryginału faktury zewnętrznej.');
   const children=checked(await db.from('bill_invoices').select('id,status').eq('payload->correction->>originalId',row.id));
   if(children.some((r:any)=>!['draft','issued','rejected'].includes(r.status)))throw Error('Korekta była już wysyłana. Nie można zmienić jej odwołania.');
   const ref=externalReference(body),payload={...row.payload,source:{...row.payload.source,externalKsefStatus:ref.status}};
   const saved=checked(await db.from('bill_invoices').update({payload,ksef_number:ref.ksefNumber,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('revision',body.revision).select().maybeSingle());
   if(!saved)throw Error('Faktura zmieniła się na innym urządzeniu. Odśwież dane.');return json(saved);
  }
  if(body.action==='start-correction'){
   const parent=await invoice(body.id),payload=correctionSeed(parent);
   const find=()=>db.from('bill_invoices').select('*').eq('payload->correction->>originalId',parent.id).neq('status','rejected').maybeSingle();
   const existing=checked(await find());if(existing)return json(existing);
   const created=await db.from('bill_invoices').insert({id:crypto.randomUUID(),creator_id:userId,payload}).select().single();
   if(created.error?.code==='23505'){const concurrent=checked(await find());if(concurrent)return json(concurrent);}return json(checked(created));
  }
  if(body.action==='save-draft'){
   // Partial drafts are allowed. Full validation happens before any number is allocated.
   if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw Error('Nieprawidłowy szkic.');
   if(!/^[0-9a-f-]{36}$/i.test(body.id||''))throw Error('Nieprawidłowy identyfikator szkicu.');
   if(body.payload.source?.app==='robisie'&&body.payload.source?.stageId){const origin=checked(await db.from('rs_projects').select('id,payload,contract_number').eq('id',body.payload.source.id).eq('owner_id',userId).single());stageInvoiceSeed(origin,body.payload.source.stageId);}
   body.payload=await canonicalFleet(body.id,await canonicalCorrection(body.payload));
   const existing=checked(await db.from('bill_invoices').select('id,status,revision,payload').eq('id',body.id).maybeSingle());
   if(existing?.payload?.correction&&existing.payload.correction.originalId!==body.payload.correction?.originalId)throw Error('Nie można zmienić powiązania zapisanej korekty.');
   if(existing){if(existing.status!=='draft')throw Error('Wystawiona faktura jest zablokowana.');const row=checked(await db.from('bill_invoices').update({payload:body.payload,revision:body.revision+1,updated_at:new Date().toISOString()}).eq('id',body.id).eq('status','draft').eq('revision',body.revision).select().maybeSingle());if(!row)throw Error('Szkic zmienił się na innym urządzeniu. Odśwież przed zapisem.');return json(row);}
   if(body.revision!==0)throw Error('Nie znaleziono pierwotnego szkicu. Odśwież dane.');
   return json(checked(await db.from('bill_invoices').insert({id:body.id,creator_id:userId,payload:body.payload}).select().single()));
  }
  if(body.action==='delete-draft'){checked(await db.from('bill_invoices').delete().eq('id',body.id).eq('status','draft'));return json({ok:true});}
  if(body.action==='check-ksef'){await authKsef(userId);return json({ok:true,message:'Połączenie z produkcyjnym KSeF działa. Uprawnienie do wysyłki zostanie również sprawdzone przez KSeF podczas wysyłania dokumentu.'});}
  if(body.action==='send'){
   let row=await invoice(body.id);
   if(row.status==='draft')throw Error('Najpierw wystaw fakturę i sprawdź PDF. Wysyłka do KSeF jest osobną operacją.');
   if(row.status!=='issued')return json(row);
   if(row.payload.source?.app==='external'&&!row.payload.correction)throw Error('Zaimportowana faktura zachowuje oryginał. Z tego miejsca można wysłać wyłącznie jej korektę.');
   const payload=normalize(await canonicalFinal(await canonicalFleet(row.id,await canonicalCorrection(storedPayload(row))),userId,row.id));
   if(payload.issueDate!==today())throw Error('Dla wysyłki online ustaw dzisiejszą datę wystawienia.');
   if(payload.correction){const parent=await invoice(payload.correction.originalId);if(parent.payload.source?.app==='external'&&!parent.payload.correction&&!parent.ksef_number&&parent.payload.source.externalKsefStatus!=='outside')throw Error('Uzupełnij status KSeF faktury źródłowej: wpisz jej numer KSeF albo potwierdź wystawienie poza KSeF w szczegółach oryginału.');}
   const auth=await authKsef(userId);
   const attempt=crypto.randomUUID();
   const lock=checked(await db.from('bill_invoices').update({payload,status:'sending',send_attempt:attempt,ksef_session:null,ksef_reference:null,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','issued').select().maybeSingle());
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
 }catch(e){return json({error:String(e.message||'Nie udało się wykonać operacji.').slice(0,2000),retryable:e.retryable===true,retryAfter:e.retryAfter||0},[429,500,502,503,504].includes(e.status)?e.status:400);}
});
