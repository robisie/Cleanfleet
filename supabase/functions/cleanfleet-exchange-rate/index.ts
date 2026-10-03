import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {fetchRate} from './core.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Nieprawidłowa metoda.'},405);
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return json({error:'Zaloguj się.'},401);
 const {data,error}=await admin.auth.getUser(token);
 if(error||!data.user)return json({error:'Zaloguj się ponownie.'},401);
 try{
  const cached=await admin.from('cf_exchange_rates').select('*').order('rate_date',{ascending:false}).order('rate_time',{ascending:false}).limit(1).maybeSingle();
  if(cached.error)throw cached.error;
  if(cached.data&&Date.now()-Date.parse(cached.data.checked_at)<15*60*1000)return json({ok:true,...cached.data});
  const rate={...await fetchRate(),checked_at:new Date().toISOString()};
  const saved=await admin.from('cf_exchange_rates').upsert(rate,{onConflict:'rate_date,rate_time'});
  if(saved.error)throw saved.error;
  return json({ok:true,...rate});
 }catch(e){console.error('exchange-rate',e instanceof Error?e.message:'error');return json({error:'Nie udało się pobrać aktualnego kursu mBanku. Spróbuj ponownie.'},503);}
});
