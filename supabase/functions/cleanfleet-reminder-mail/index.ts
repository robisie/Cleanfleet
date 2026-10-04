
import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {ImapFlow} from 'npm:imapflow@2.2.1';

const URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const CRON_SECRET=Deno.env.get('CLEANFLEET_CRON_SECRET')!;
const OPENAI_API_KEY=Deno.env.get('OPENAI_API_KEY')!;
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
const TZ='Europe/Warsaw';
const MAX_PDF=8*1024*1024;
const encoder=new TextEncoder();

function json(v:unknown,s=200){return new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
function clean(v:unknown,n=300){return String(v??'').trim().slice(0,n);}
function norm(v:unknown){return clean(v,500).normalize('NFKC').toLocaleLowerCase('pl-PL');}
function validDate(v:unknown){const s=clean(v,20);if(!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(s))return '';const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';}
function b64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x8000)));return btoa(out);}
function unb64(v:string){return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function openCredential(ciphertext:string,userId:string){
  const raw=await crypto.subtle.importKey('raw',encoder.encode(SERVICE),'HKDF',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('CleanFleet/Mail/v1'),info:encoder.encode('mail-credentials-v1')},raw,{name:'AES-GCM',length:256},false,['decrypt']);
  const bytes=unb64(ciphertext);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,bytes.slice(12));
  const state=JSON.parse(new TextDecoder().decode(plain));
  if(state.userId!==userId||state.scope!=='mail-stored'||!Number.isFinite(state.expires)||state.expires<=Date.now())throw new Error('Zapisane połączenie poczty jest nieważne.');
  return state;
}
function makeClient(config:any){
  const client=new ImapFlow({host:'poczta.o2.pl',port:993,secure:true,auth:{user:config.email,pass:config.password,loginMethod:'LOGIN'},logger:false,logRaw:false,disableAutoIdle:true,disableCompression:true,disableBinary:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,tls:{rejectUnauthorized:true}});
  client.on('error',()=>{});return client;
}
function selectableFolders(list:any[]){return list.filter(f=>![...(f.flags||[])].some((x:any)=>['noselect','nonexistent'].includes(String(x).replaceAll('\\','').toLowerCase()))).map(f=>({path:String(f.path),name:String(f.name||f.path)})).filter(f=>f.path&&f.path.length<=128);}
function resolveFolder(list:any[],value:string){
  const name=String(value||'').normalize('NFC');
  const exact=list.find(f=>f.path.normalize('NFC')===name||(name.toUpperCase()==='INBOX'&&f.path.toUpperCase()==='INBOX'));
  if(exact)return exact.path;
  const same=list.filter(f=>f.name.normalize('NFC')===name);
  if(same.length===1)return same[0].path;
  throw new Error('Skonfigurowany folder poczty nie jest dostępny.');
}
function attachmentList(node:any,result:any[]=[]){
  if(!node)return result;
  const name=node.dispositionParameters?.filename||node.parameters?.name;
  if(node.childNodes?.length){for(const child of node.childNodes)attachmentList(child,result);}
  else if(name&&/\.pdf$/i.test(String(name))&&/^[1-9]\d*(\.[1-9]\d*)*$/.test(node.part||'1')&&Number.isInteger(node.size)&&node.size>=0){
    result.push({part:node.part||'1',filename:clean(name,180).split(/[\\/]/).at(-1),size:node.size});
  }
  return result;
}
function receivedDay(message:any){
  const d=new Date(message.internalDate);if(!Number.isFinite(d.getTime()))return '';
  return new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function localParts(iso:string){
  const d=new Date(iso);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const get=(t:string)=>parts.find(p=>p.type===t)?.value||'';
  return {date:get('year')+'-'+get('month')+'-'+get('day'),time:get('hour')+':'+get('minute')};
}
function zoneOffsetMs(at:Date){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at);
  const g=(t:string)=>Number(p.find(x=>x.type===t)?.value||0);
  return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'),g('second'))-at.getTime();
}
function localIso(date:string,time:string){
  let guess=new Date(date+'T'+time+':00Z');
  let offset=zoneOffsetMs(guess);
  let result=new Date(guess.getTime()-offset);
  const offset2=zoneOffsetMs(result);
  if(offset2!==offset)result=new Date(guess.getTime()-offset2);
  return result.toISOString();
}
function advanceDays(iso:string,days:number){const d=new Date(iso);d.setUTCDate(d.getUTCDate()+days);return d.toISOString();}
function calcRemindAt(newDue:string,mode:string,oldDue?:string|null,oldCustom?:string|null){
  if(mode==='custom'&&oldDue&&oldCustom){
    const diff=new Date(oldDue).getTime()-new Date(oldCustom).getTime();
    if(Number.isFinite(diff))return new Date(new Date(newDue).getTime()-diff).toISOString();
  }
  const days=mode==='day_1'?1:mode==='day_2'?2:mode==='day_3'?3:0;
  return days?advanceDays(newDue,-days):newDue;
}
async function downloadPart(client:any,uid:number,part:any){
  if(part.size>MAX_PDF)throw new Error('PDF faktury przekracza limit automatycznego odczytu 8 MB.');
  const dl=await client.download(uid,part.part,{uid:true,maxBytes:MAX_PDF+1});
  const chunks:Uint8Array[]=[];let size=0;
  for await(const chunk of dl.content){const u=new Uint8Array(chunk);size+=u.byteLength;if(size>MAX_PDF)throw new Error('PDF faktury przekracza limit automatycznego odczytu 8 MB.');chunks.push(u);}
  const bytes=new Uint8Array(size);let o=0;for(const x of chunks){bytes.set(x,o);o+=x.length;}return bytes;
}
function outputText(v:any){
  if(typeof v?.output_text==='string')return v.output_text;
  return (v?.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
}
async function inspectPdf(bytes:Uint8Array,filename:string,context:any){
  if(!OPENAI_API_KEY)throw new Error('Brak konfiguracji odczytu faktur.');
  const prompt=[
    'Przeanalizuj załączony PDF jako potencjalną fakturę dla przypomnienia o płatności.',
    'Zwróć WYŁĄCZNIE JSON bez markdownu:',
    '{"is_invoice":true,"matches_reminder":true,"invoice_number":"...","reference_number":"...","amount":123.45,"currency":"PLN","invoice_date":"YYYY-MM-DD","due_date":"YYYY-MM-DD","seller":"...","confidence":"high|medium|low"}',
    'amount ma oznaczać końcową kwotę DO ZAPŁATY, nie netto ani VAT.',
    'due_date to termin płatności, invoice_date to data wystawienia. invoice_number to właściwy numer faktury/dokumentu. Jeżeli dokument ma pola „Numer dokumentu” i „Numer referencyjny”, invoice_number MUSI być wartością z „Numer dokumentu”, a reference_number z „Numer referencyjny”. Nigdy nie podstawiaj numeru referencyjnego, numeru klienta, zamówienia ani polecenia zapłaty jako invoice_number.',
    'Nie zgaduj. Jeśli któregokolwiek pola nie da się wiarygodnie ustalić, użyj null i obniż confidence.',
    'matches_reminder oznacza zgodność faktury z opisem przypomnienia i danymi wiadomości.',
    'Kontekst przypomnienia: '+JSON.stringify(context)
  ].join('\n');
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({
    model:'gpt-5.6-luna',
    reasoning:{effort:'none'},
    input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_file',filename,file_data:'data:application/pdf;base64,'+b64(bytes)}]}],
    max_output_tokens:350
  })});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(res.status===429?'Brak dostępnego limitu OpenAI API.':'Nie udało się odczytać PDF faktury.');
  const raw=outputText(body).trim();let parsed:any=null;
  try{parsed=JSON.parse(raw);}catch{const m=raw.match(/\{[\s\S]*\}/);if(m)parsed=JSON.parse(m[0]);}
  if(!parsed||typeof parsed!=='object')throw new Error('Odczyt faktury nie zwrócił poprawnych danych.');
  const amount=Number(parsed.amount);
  return {
    is_invoice:parsed.is_invoice===true,
    matches_reminder:parsed.matches_reminder===true,
    invoice_number:clean(parsed.invoice_number,120)||null,
    reference_number:clean(parsed.reference_number,120)||null,
    amount:Number.isFinite(amount)&&amount>=0?Math.round(amount*100)/100:null,
    currency:clean(parsed.currency,8).toUpperCase()||null,
    invoice_date:validDate(parsed.invoice_date)||null,
    due_date:validDate(parsed.due_date)||null,
    seller:clean(parsed.seller,160)||null,
    confidence:['high','medium','low'].includes(parsed.confidence)?parsed.confidence:'low'
  };
}
async function scanReminder(r:any){
  const now=new Date(),due=new Date(r.mail_anchor_due_at||r.due_at);
  if(!Number.isFinite(due.getTime()))return {skipped:true};
  const starts=new Date(due);starts.setUTCDate(starts.getUTCDate()-Number(r.mail_scan_days_before||2));
  if(now<starts)return {skipped:true};
  if(now.getTime()>due.getTime()+8*86400000)return {skipped:true};
  if(r.mail_last_checked_at&&now.getTime()-new Date(r.mail_last_checked_at).getTime()<6*3600000)return {skipped:true};
  const folder=clean(r.mail_folder,128),sender=norm(r.mail_sender),subjectNeedle=norm(r.mail_subject_contains),attachmentNeedle=norm(r.mail_attachment_contains);
  if(!folder||(!sender&&!subjectNeedle&&!attachmentNeedle))throw new Error('Uzupełnij folder i co najmniej jeden filtr faktury: nadawca, temat lub nazwa załącznika.');
  const cred=await db.from('cf_mail_credentials').select('ciphertext').eq('user_id',r.user_id).maybeSingle();
  if(cred.error)throw cred.error;if(!cred.data?.ciphertext)throw new Error('Brak zapisanego połączenia z pocztą o2.');
  const config=await openCredential(cred.data.ciphertext,r.user_id);
  const client=makeClient(config);const timer=setTimeout(()=>client.close(),80000);
  try{
    await client.connect();
    const folders=selectableFolders(await client.list());
    await client.mailboxOpen(resolveFolder(folders,folder),{readOnly:true});
    const targetMonth=localParts(r.mail_anchor_due_at||r.due_at).date.slice(0,7);
    const [ty,tm]=targetMonth.split('-').map(Number);
    const monthStart=new Date(Date.UTC(ty,tm-1,1,0,0,0));
    const from=new Date(monthStart.getTime()-14*86400000);
    const before=new Date(Date.UTC(tm===12?ty+1:ty,tm===12?0:tm,1,0,0,0));
    const search:any={since:from,before};if(sender)search.from=sender;if(subjectNeedle)search.subject=subjectNeedle;
    const uids=await client.search(search,{uid:true});
    if(!uids?.length)return {found:false};
    const messages=await client.fetchAll(uids.slice(-100),{uid:true,envelope:true,bodyStructure:true,internalDate:true},{uid:true});
    const candidates:any[]=[];
    for(const m of messages){
      const received=receivedDay(m);
      const subject=clean(m.envelope?.subject,300),subjectNorm=norm(subject);
      const senders=(m.envelope?.from||[]).map((x:any)=>norm(x.address)).filter(Boolean);
      if(sender&&!senders.includes(sender))continue;
      if(subjectNeedle&&!subjectNorm.includes(subjectNeedle))continue;
      const parts=attachmentList(m.bodyStructure).filter(p=>!attachmentNeedle||norm(p.filename).includes(attachmentNeedle));
      for(const p of parts)candidates.push({m,p,subject,sender:senders.join(', '),received:receivedDay(m),time:new Date(m.internalDate).getTime()});
    }
    candidates.sort((a,b)=>b.time-a.time);
    if(!candidates.length)return {found:false};
    let best:any=null;
    for(const item of candidates.slice(0,6)){
      if(item.p.size>MAX_PDF)continue;
      const bytes=await downloadPart(client,item.m.uid,item.p);
      const parsed=await inspectPdf(bytes,item.p.filename,{title:r.title,payee:r.payee||'',expected_due:localParts(r.mail_anchor_due_at||r.due_at).date,target_month:targetMonth,email_sender:item.sender,email_subject:item.subject,attachment:item.p.filename});
      if(!parsed.is_invoice)continue;
      if(!parsed.due_date||!parsed.due_date.startsWith(targetMonth+'-'))continue;
      const candidate={...parsed,source:{uid:item.m.uid,subject:item.subject,received:item.received,attachment:item.p.filename,sender:item.sender}};
      best=candidate;
      if(parsed.confidence==='high'&&parsed.matches_reminder)break;
    }
    if(!best)return {found:false};
    const auto=best.confidence==='high'&&best.matches_reminder&&best.invoice_number&&best.amount!=null&&best.due_date&&best.due_date.startsWith(targetMonth+'-')&&best.currency==='PLN';
    const sourcePatch={
      mail_last_checked_at:now.toISOString(),
      mail_last_error:null,
      mail_source_message_uid:best.source.uid,
      mail_source_subject:best.source.subject,
      mail_source_received_at:best.source.received||null,
      mail_source_attachment:best.source.attachment,
      mail_invoice_detected_at:now.toISOString(),
      mail_candidate:best
    };
    if(!auto){
      const u=await db.from('cf_reminders').update({...sourcePatch,mail_scan_status:'needs_review'}).eq('id',r.id).eq('user_id',r.user_id);
      if(u.error)throw u.error;return {found:true,review:true};
    }
    const oldDue=r.due_at,lp=localParts(oldDue),newDue=localIso(best.due_date,lp.time||'09:00');
    const duration=r.start_at&&r.end_at?Math.max(0,new Date(r.end_at).getTime()-new Date(r.start_at).getTime()):0;
    const newEnd=duration?new Date(new Date(newDue).getTime()+duration).toISOString():newDue;
    const newRemind=calcRemindAt(newDue,r.reminder_mode||'at_time',oldDue,r.custom_remind_at);
    const patch:any={...sourcePatch,mail_scan_status:'applied',amount:best.amount,invoice_number:best.invoice_number,due_at:newDue,start_at:newDue,end_at:newEnd,remind_at:newRemind,push_sent_at:null};
    if((r.reminder_mode||'')==='custom'&&r.custom_remind_at&&oldDue){
      const diff=new Date(oldDue).getTime()-new Date(r.custom_remind_at).getTime();
      patch.custom_remind_at=new Date(new Date(newDue).getTime()-diff).toISOString();
    }
    const u=await db.from('cf_reminders').update(patch).eq('id',r.id).eq('user_id',r.user_id);if(u.error)throw u.error;
    return {found:true,applied:true};
  }finally{clearTimeout(timer);try{client.close();}catch{}}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(!CRON_SECRET||req.headers.get('x-cleanfleet-cron-secret')!==CRON_SECRET)return json({error:'Unauthorized'},401);
  let rows:any[]=[];
  const q=await db.from('cf_reminders').select('id,user_id,title,payee,amount,invoice_number,due_at,start_at,end_at,remind_at,reminder_mode,custom_remind_at,status,recurrence,mail_invoice_enabled,mail_folder,mail_sender,mail_subject_contains,mail_attachment_contains,mail_scan_days_before,mail_scan_status,mail_last_checked_at,mail_anchor_due_at').eq('mail_invoice_enabled',true).in('status',['active','snoozed']).neq('mail_scan_status','applied').order('due_at',{ascending:true}).limit(60);
  if(q.error)return json({error:q.error.message},500);rows=q.data||[];
  const stats={checked:0,skipped:0,found:0,applied:0,review:0,waiting:0,errors:0};
  for(const r of rows){
    try{
      const result=await scanReminder(r);
      if(result.skipped){stats.skipped++;continue;}
      stats.checked++;
      if(result.found)stats.found++;
      if(result.applied)stats.applied++;
      else if(result.review)stats.review++;
      else {
        stats.waiting++;
        await db.from('cf_reminders').update({mail_scan_status:'waiting',mail_last_checked_at:new Date().toISOString(),mail_last_error:null}).eq('id',r.id).eq('user_id',r.user_id);
      }
    }catch(error){
      stats.errors++;
      const due=new Date(r.due_at);const status=Number.isFinite(due.getTime())&&Date.now()>due.getTime()+86400000?'error':'waiting';
      await db.from('cf_reminders').update({mail_scan_status:status,mail_last_checked_at:new Date().toISOString(),mail_last_error:clean(error instanceof Error?error.message:String(error),500)}).eq('id',r.id).eq('user_id',r.user_id);
      console.warn('CF_REMINDER_MAIL',r.id,error instanceof Error?error.message:String(error));
    }
  }
  return json({ok:true,...stats});
});
