import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {invoiceAmount} from '../cleanfleet-bill/invoice.js';
import {reminderAmount} from '../cleanfleet-bill/reminder.js';
import {fleetPaymentEvidence} from '../cleanfleet-bill/fleet.js';
import {openAccount} from '../pack-bank-mail/vault.js';
import '../pack-bank-mail/engine.js';
import {reconcileBillPayments} from '../_shared/bill-bank-match.js';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function checked(query:any){const {data,error}=await query;if(error)throw error;return data;}
const day=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const hour=(date:Date)=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',hourCycle:'h23'}).format(date));

async function outstanding(row:any,stage:number){
 const owner=row.creator_id,source=row.payload?.source||{};
 const [evidence,direct,link,fleet,legacy]=await Promise.all([
  checked(db.from('bill_payment_evidence').select('manual_paid,bank_cents').eq('invoice_id',row.id).maybeSingle()),
  source.app==='robisie'&&source.id?checked(db.from('rs_projects').select('payload').eq('id',source.id).eq('owner_id',owner).maybeSingle()):null,
  row.status==='accepted'&&row.ksef_number&&row.payload.currency==='PLN'?checked(db.from('rs_ksef_links').select('project_id,document').eq('kind','sales').eq('owner_id',owner).eq('ksef_number',row.ksef_number).maybeSingle()):null,
  source.fleetId?fleetPaymentEvidence(db,[row.id]):[],
  row.status==='accepted'&&source.app==='external'?fleetPaymentEvidence(db,[row.id],{legacy:true,userId:owner}):[]
 ]);
 let project=direct?.payload,settlementId=row.id;
 if(!project&&link&&(source.app!=='robisie'||source.id===link.project_id)){
  const document=link.document,total=invoiceAmount(row.payload)/100;
  if(!document?.referenceOnly&&document?.id&&document.number===row.number&&document.payload?.currency==='PLN'&&Number(document.grossAmount)===total){
   const linked=await checked(db.from('rs_projects').select('payload').eq('id',link.project_id).eq('owner_id',owner).maybeSingle());
   const settlement=linked?.payload?.invoiceSettlements?.find((x:any)=>x.id===document.id&&x.number===row.number&&Number(x.total)===total);
   if(settlement){project=linked.payload;settlementId=document.id;}
  }
 }
 try{return reminderAmount(row,{evidence,project,settlementId,allowDueToday:stage===0,fleetPaid:[...fleet,...legacy].some((x:any)=>x.paid)});}catch{return 0;}
}

async function claim(invoiceId:string,stage:number,subscriptionId:string){
 const key={invoice_id:invoiceId,stage,subscription_id:subscriptionId};
 const created=await checked(db.from('bill_due_push_deliveries').insert(key).select('invoice_id'));
 return created.length>0;
}

Deno.serve(async req=>{
 const secret=Deno.env.get('CLEANFLEET_CRON_SECRET');
 if(req.method!=='POST'||!secret||req.headers.get('x-cleanfleet-cron-secret')!==secret)return new Response('Unauthorized',{status:401});
 try{
  const now=new Date(),today=day(now);
  if(hour(now)<9)return Response.json({ok:true,skipped:'before 09:00 Europe/Warsaw'});
  const threeDaysAgo=day(new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1,Number(today.slice(8))-3,12)));
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
  if(!publicKey||!privateKey||!subject)throw Error('Push VAPID is not configured');
  webpush.setVapidDetails(subject,publicKey,privateKey);
  let sent=0,examined=0,failures=0;
  for(const [due,stage] of [[today,0],[threeDaysAgo,3]] as [string,number][]){
   for(let offset=0;offset<10000;offset+=200){
    const rows=await checked(db.from('bill_invoices').select('id,creator_id,number,status,ksef_number,payload').eq('payload->>dueDate',due).neq('status','draft').not('number','is',null).order('id').range(offset,offset+199));
    for(const row of rows){
     examined++;
     if(row.payload?.correction)continue;
     const subscriptions=await checked(db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',row.creator_id).eq('enabled',true));
     if(!subscriptions.length)continue;
     try{
      const vault=await checked(db.from('cf_payment_vaults').select('envelope').eq('user_id',row.creator_id).maybeSingle());
      if(vault?.envelope?.accountKey){const {state}=await openAccount(vault.envelope);await reconcileBillPayments(db,row.creator_id,state,(globalThis as any).Payments,invoiceAmount);}
      const remaining=await outstanding(row,stage);if(remaining<=0)continue;
      const url='/bill/?invoice='+encodeURIComponent(row.id)+(stage===3?'&reminder=1':'');
      const payload=JSON.stringify({title:stage===3?'Bill — płatność po terminie':'Bill — termin płatności',body:`Faktura ${row.number}: ${stage===3?'3 dni po terminie. Otwórz przypomnienie.':'dziś mija termin płatności.'} Pozostało ${new Intl.NumberFormat('pl-PL',{style:'currency',currency:row.payload.currency||'PLN'}).format(remaining/100)}.`,tag:`bill-due-${row.id}-${stage}`,url});
      for(const sub of subscriptions){
       const key={invoice_id:row.id,stage,subscription_id:sub.id};
       const existing=await checked(db.from('bill_due_push_deliveries').select('state,claimed_at').match(key).maybeSingle());
       if(existing?.state==='sent'||existing?.state==='pending'&&Date.now()-new Date(existing.claimed_at).getTime()<15*60000)continue;
       if(existing){const updated=await checked(db.from('bill_due_push_deliveries').update({state:'pending',claimed_at:new Date().toISOString()}).match({...key,state:'pending',claimed_at:existing.claimed_at}).select('invoice_id'));if(!updated.length)continue;}
       else {try{if(!await claim(row.id,stage,sub.id))continue;}catch(e){if(e.code==='23505')continue;throw e;}}
       try{
        await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload);
        await checked(db.from('bill_due_push_deliveries').update({state:'sent',sent_at:new Date().toISOString()}).match(key));sent++;
       }catch(e){
        failures++;
        if([404,410].includes(e.statusCode))await checked(db.from('push_subscriptions').update({enabled:false}).eq('id',sub.id));
        await checked(db.from('bill_due_push_deliveries').delete().match({...key,state:'pending'}));
       }
      }
     }catch(e){failures++;console.error('Bill due invoice',row.id,e.message);}
    }
    if(rows.length<200)break;
   }
  }
  return Response.json({ok:true,examined,sent,failures});
 }catch(e){console.error('Bill due push',e.message);return Response.json({ok:false,error:e.message},{status:500});}
});
