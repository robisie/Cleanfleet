import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'',headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
 try{
  if(origin&&!origins.includes(origin))return reply({error:'Niedozwolone źródło.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Niedozwolona metoda.'},405);
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply({error:'Zaloguj się ponownie.'},401);
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return reply({error:'Zaloguj się ponownie.'},401);
  const user=auth.data.user,role=await db.from('user_roles').select('role').eq('user_id',user.id).single();if(role.error||role.data?.role!=='admin')return reply({error:'Dostęp tylko dla administratora.'},403);
  const raw=await req.text();if(raw.length>5000)return reply({error:'Zbyt duże żądanie.'},413);const body=JSON.parse(raw);
  if(!/^[0-9a-f-]{36}$/i.test(body.id||'')||!/^\d{4}-\d{2}-\d{2}$/.test(body.date||''))return reply({error:'Nieprawidłowe dane faktury.'},400);
  const result=await db.rpc('rs_aga_bill_draft',{p_actor:user.id,p_id:body.id,p_amount:body.amount,p_date:body.date,p_rate:body.rate,p_received:body.received??null,p_note:body.note||'',p_revision:body.revision});if(result.error)throw result.error;
  return reply(result.data);
 }catch(error){return reply({error:error instanceof Error?error.message:(error as {message?:string})?.message||'Nie udało się przygotować faktury.'},400);}
});
