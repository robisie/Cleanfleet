import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {SOURCE,parseAnnualIndex} from './core.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function checked(q:any){const {data,error}=await q;if(error)throw error;return data;}
Deno.serve(async req=>{
 const secret=Deno.env.get('CLEANFLEET_CRON_SECRET');
 if(req.method!=='POST'||!secret||req.headers.get('x-cleanfleet-cron-secret')!==secret)return new Response('Unauthorized',{status:401});
 try{
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Warsaw',year:'numeric'}).format(new Date()))-1;
  let fetchError=null;
  let report=(await checked(db.from('cf_inflation_reports').select('*').eq('year',year)))[0];
  if(year>=2026&&!report){try{
   const response=await fetch(SOURCE,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('GUS HTTP '+response.status);
   const index=parseAnnualIndex(await response.text(),year);
   if(index!==null)report=(await checked(db.from('cf_inflation_reports').upsert({year,price_index:index,source_url:SOURCE},{onConflict:'year',ignoreDuplicates:true}).select()))[0]||(await checked(db.from('cf_inflation_reports').select('*').eq('year',year)))[0];
  }catch(e){fetchError=e.message;console.warn('GUS unavailable:',fetchError);}}
  const admins=await checked(db.from('user_roles').select('user_id').eq('role','admin'));
  if(report){
   const owners=await checked(db.from('rs_settings').select('owner_id'));
   const adminIds=new Set(admins.map((x:any)=>x.user_id));
   const proposals=[{app:'cleanfleet',year,scope:'cleanfleet'},...owners.filter((x:any)=>adminIds.has(x.owner_id)).map((x:any)=>({app:'robisie',year,scope:x.owner_id}))];
   await checked(db.from('cf_inflation_decisions').upsert(proposals,{onConflict:'app,year,scope',ignoreDuplicates:true}));
  }
  const due=await checked(db.from('cf_inflation_decisions').select('*,report:cf_inflation_reports(*)').eq('status','pending').is('notified_at',null).lte('remind_at',new Date().toISOString()));
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
  if(!publicKey||!privateKey||!subject)throw Error('Brak konfiguracji push. Propozycje zapisane w aplikacjach.');
  webpush.setVapidDetails(subject,publicKey,privateKey);
  let sent=0;
  for(const d of due){
   const recipients=d.scope==='cleanfleet'?admins.map((x:any)=>x.user_id):admins.filter((x:any)=>x.user_id===d.scope).map((x:any)=>x.user_id);
   if(!recipients.length)continue;
   const subs=await checked(db.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id',recipients).eq('enabled',true));
   let retry=false;
   for(const sub of subs){try{
    await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:(d.app==='robisie'?'Robisię':'CleanFleet')+' — korekta cennika GUS',body:`Inflacja za ${d.year}: ${d.report.percent}%. Otwórz propozycję i podejmij decyzję.`,tag:`inflation-${d.app}-${d.year}`,url:d.app==='robisie'?'/app/robisie/?inflation=1':'/app/?inflation=1'}));sent++;
   }catch(e){if([404,410].includes(e.statusCode))await checked(db.from('push_subscriptions').update({enabled:false}).eq('id',sub.id));else retry=true;}}
   if(!retry)await checked(db.from('cf_inflation_decisions').update({notified_at:new Date().toISOString()}).eq('app',d.app).eq('year',d.year).eq('scope',d.scope).eq('remind_at',d.remind_at).eq('status','pending'));
  }
  return Response.json({ok:true,year,available:!!report,sent,fetchError});
 }catch(e){console.error('Annual inflation:',e.message);return Response.json({ok:false,error:e.message},{status:500});}
});
