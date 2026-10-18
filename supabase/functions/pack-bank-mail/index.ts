import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {ImapFlow} from 'npm:imapflow@2.2.1';
import {BANK_SENDER,BANK_SUBJECT,attachments,matchesBankMessage,selectableFolders,resolveFolder,MAX_PART} from './mail.js';
import {createStateCodec} from './crypto.js';
import {openAccount,seal} from './vault.js';
import {bankPeriod,mergeStatement} from './import.mjs';
import './engine.js';
const P=(globalThis as any).Payments;
const URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON=Deno.env.get('CLEANFLEET_CRON_SECRET');
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const codec=createStateCodec(SERVICE,'mail-credentials-v1'),passwordCodec=createStateCodec(SERVICE,'bank-pdf-password-v1');
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw'}).format(new Date());
const bucket='pack-bank-statements';
function check(r:any){if(r.error)throw r.error;return r.data;}
async function parsePdf(bytes:Uint8Array,password:string){
  const pdf=await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.mjs');
  const worker=await import('npm:pdfjs-dist@4.4.168/legacy/build/pdf.worker.mjs');
  (globalThis as any).pdfjsWorker={WorkerMessageHandler:worker.WorkerMessageHandler};
  const task=pdf.getDocument({data:bytes.slice(),password,isEvalSupported:false,useSystemFonts:false,disableFontFace:true});
  let doc;
  try{doc=await task.promise;if(doc.numPages>100)throw Error('Wyciąg przekracza 100 stron.');const pages=[];for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);pages.push(P.rowsFromItems((await page.getTextContent()).items));}return P.parsePages(pages);}
  catch(e){if((e as any).name==='PasswordException')throw Error('Hasło do wyciągu PDF jest wymagane albo nieprawidłowe. Uzupełnij je w Moje finanse → Automatyzacja.');throw e;}
  finally{if(doc)await doc.destroy();else await task.destroy();}
}
async function saveStatement(uid:string,batch:any){
  for(let attempt=0;attempt<3;attempt++){
    const row=check(await db.from('cf_payment_vaults').select('envelope,revision').eq('user_id',uid).single());
    if(!row.envelope.accountKey)throw Error('Najpierw otwórz Moje finanse i przełącz dostęp na konto.');
    const {state,key}=await openAccount(row.envelope);
    const next=mergeStatement(state,batch,P);
    const envelope={...await seal(next,key,row.envelope.salt),accountKey:row.envelope.accountKey};
    const saved=check(await db.from('cf_payment_vaults').update({envelope,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('user_id',uid).eq('revision',row.revision).select('revision'));
    if(saved.length)return;
  }
  throw Error('Finanse były równocześnie edytowane. Import zostanie ponowiony.');
}
async function run(settings:any,dry=false){
  const period=bankPeriod(day());if(!period||(!dry&&day()<settings.starts_on))return {skipped:true};
  const uid=settings.user_id;
  // Lease protects concurrent manual and scheduled executions, including after a crash.
  if(!dry){const claimed=check(await db.from('pack_bank_mail_settings').update({locked_until:new Date(Date.now()+300000).toISOString()}).eq('user_id',uid).or('locked_until.is.null,locked_until.lt.'+new Date().toISOString()).select('user_id'));if(!claimed.length)return {busy:true};}
  let client:any;const stats={found:0,downloaded:0,imported:0,errors:0};
  try{
    const cred=check(await db.from('cf_mail_credentials').select('ciphertext').eq('user_id',uid).single());
    const config=await codec.open(cred.ciphertext,uid,'mail-stored');
    client=new ImapFlow({host:'poczta.o2.pl',port:993,secure:true,auth:{user:config.email,pass:config.password,loginMethod:'LOGIN'},logger:false,logRaw:false,disableAutoIdle:true,disableCompression:true,disableBinary:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,tls:{rejectUnauthorized:true}});client.on('error',()=>{});
    await client.connect();await client.mailboxOpen(resolveFolder(selectableFolders(await client.list()),config.folder),{readOnly:true});
    const uids=await client.search({since:new Date(period.from+'T00:00:00Z'),before:new Date(Date.now()+86400000),from:BANK_SENDER,subject:BANK_SUBJECT.trim()},{uid:true});
    if(uids.length>200)throw Error('Zbyt wiele wiadomości w miesięcznym zakresie.');
    const messages=uids.length?await client.fetchAll(uids,{uid:true,envelope:true,bodyStructure:true,internalDate:true},{uid:true}):[];
    const candidates=messages.filter(matchesBankMessage).flatMap((m:any)=>attachments(m.bodyStructure).map((a:any)=>({m,a})));
    stats.found=candidates.length;
    if(dry)return {ok:true,dry_run:true,folder:config.folder,found:stats.found,password_configured:!!settings.password_ciphertext};
    const password=settings.password_ciphertext?(await passwordCodec.open(settings.password_ciphertext,uid,'bank-pdf')).password:'';
    const pending=check(await db.from('pack_bank_mail_files').select('*').eq('user_id',uid).neq('status','imported').order('created_at',{ascending:true}).limit(100)).filter((f:any)=>/\.pdf$/i.test(f.filename));
    const queue=[...candidates,...pending.map((saved:any)=>({m:null,a:{filename:saved.filename,size:0},saved}))];
    const seen=new Set();let processed=0;const deadline=Date.now()+90000;
    for(const {m,a,saved} of queue){
      if(processed>=8||Date.now()>deadline)break;
      const source=saved?.source_key||[config.folder,String(client.mailbox.uidValidity),m.uid,a.part].join('|');
      if(seen.has(source))continue;seen.add(source);
      const existing=saved||check(await db.from('pack_bank_mail_files').select('*').eq('user_id',uid).eq('source_key',source).maybeSingle());
      if(existing?.status==='imported'||existing?.status==='downloaded'&&!/\.pdf$/i.test(a.filename))continue;
      processed++;
      let file=existing;
      try{
        if(a.size>MAX_PART)throw Error('Załącznik przekracza limit 20 MB.');
        let bytes:Uint8Array;
        if(existing?.storage_path){const blob=check(await db.storage.from(bucket).download(existing.storage_path));bytes=new Uint8Array(await blob.arrayBuffer());}
        else{
          const dl=await client.download(m.uid,a.part,{uid:true,maxBytes:MAX_PART+1});const chunks=[];let size=0;
          for await(const c of dl.content){size+=c.byteLength;if(size>MAX_PART)throw Error('Załącznik przekracza limit 20 MB.');chunks.push(new Uint8Array(c));}
          if(!size)throw Error('Pobrano pusty załącznik.');bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
          const storage_path=uid+'/'+period.period+'/'+hash+'/'+a.filename;
          const uploaded=await db.storage.from(bucket).upload(storage_path,bytes,{contentType:/\.pdf$/i.test(a.filename)?'application/pdf':'application/octet-stream',upsert:false});
          if(uploaded.error&&!['409','Duplicate'].includes(String((uploaded.error as any).statusCode))&&!uploaded.error.message.includes('already exists'))throw uploaded.error;
          file=check(await db.from('pack_bank_mail_files').upsert({user_id:uid,source_key:source,filename:a.filename,period:period.period,sha256:hash,storage_path,status:'downloaded'},{onConflict:'user_id,source_key'}).select('*').single());stats.downloaded++;
        }
        if(!/\.pdf$/i.test(a.filename))continue;
        const parsed=await parsePdf(bytes,password);
        await saveStatement(uid,{...parsed,name:a.filename,hash:file.sha256,period:file.period});
        check(await db.from('pack_bank_mail_files').update({status:'imported',last_error:null,imported_at:new Date().toISOString()}).eq('id',file.id));stats.imported++;
      }catch(e){stats.errors++;if(file)check(await db.from('pack_bank_mail_files').update({status:'needs_attention',last_error:String((e as any).message||'Błąd importu').slice(0,500)}).eq('id',file.id));else throw e;}
    }
    check(await db.from('pack_bank_mail_settings').update({last_checked_at:new Date().toISOString(),last_error:stats.errors?'Część wyciągów wymaga sprawdzenia.':stats.found?null:'Nie znaleziono wyciągów. Ponowne sprawdzenie jutro.'}).eq('user_id',uid));
    return {ok:stats.errors===0,...stats};
  }finally{try{client?.close();}catch{}if(!dry)check(await db.from('pack_bank_mail_settings').update({locked_until:null}).eq('user_id',uid));}
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(origin&&['https://cleanfleet.pl','https://www.cleanfleet.pl'].includes(origin))headers['Access-Control-Allow-Origin']=origin;
  const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  try{
    const raw=await req.text();if(raw.length>5000)return json({error:'Request too large'},413);const body=raw?JSON.parse(raw):{};
    const cron=!!CRON&&req.headers.get('x-cleanfleet-cron-secret')===CRON;
    if(cron&&body.action==='self_test'){
      const bytes=Uint8Array.from(atob(body.fixture),c=>c.charCodeAt(0));
      const parsed=await parsePdf(bytes,body.password||'');
      return json({ok:true,transactions:parsed.transactions.length,incomes:parsed.incomes.length,range:parsed.range,warnings:parsed.warnings.length});
    }
    if(cron){
      const settings=check(await db.from('pack_bank_mail_settings').select('*').eq('enabled',true));const results=[];
      for(const s of settings){try{results.push(await run(s,body.dry_run===true));}catch(e){check(await db.from('pack_bank_mail_settings').update({last_checked_at:new Date().toISOString(),last_error:String((e as any).message).slice(0,500)}).eq('user_id',s.user_id));results.push({ok:false,error:'Sprawdź status automatyzacji w Moich finansach.'});}}
      return json({results});
    }
    const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return json({error:'Zaloguj się.'},401);
    const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return json({error:'Zaloguj się ponownie.'},401);const uid=auth.data.user.id;
    const role=check(await db.from('user_roles').select('role').eq('user_id',uid).single());if(role.role!=='admin')return json({error:'Dostęp tylko dla administratora.'},403);
    if(body.action==='save'){
      const patch:any={user_id:uid,enabled:body.enabled===true};
      if(typeof body.password==='string'){if(body.password.length>1024)throw Error('Hasło jest zbyt długie.');patch.password_ciphertext=await passwordCodec.seal({userId:uid,scope:'bank-pdf',expires:9999999999999,password:body.password});}
      check(await db.from('pack_bank_mail_settings').upsert(patch,{onConflict:'user_id'}));return json({ok:true});
    }
    if(body.action==='status'){
      const s=check(await db.from('pack_bank_mail_settings').select('*').eq('user_id',uid).maybeSingle());
      const files=check(await db.from('pack_bank_mail_files').select('id,filename,period,status,last_error,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(30));
      return json({enabled:s?.enabled===true,password_configured:!!s?.password_ciphertext,starts_on:s?.starts_on||null,last_checked_at:s?.last_checked_at,last_error:s?.last_error,files});
    }
    if(body.action==='download'){
      const file=check(await db.from('pack_bank_mail_files').select('storage_path').eq('id',body.id).eq('user_id',uid).single());
      return json(check(await db.storage.from(bucket).createSignedUrl(file.storage_path,60)));
    }
    throw Error('Nieznana operacja.');
  }catch(e){return json({error:String((e as any).message||'Błąd automatyzacji').slice(0,500)},400);}
});
