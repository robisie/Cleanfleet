// Read-only export of application data for administrators. Photos are temporary and excluded.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import pg from 'npm:pg@8.16.3';

const TABLES = [
  'billing_companies','cf_client_errors','cf_earning_rules','cf_earnings',
  'cf_earnings_security','cf_employee_profiles','cf_messages','cf_notifications',
  'cf_purchases','cf_reminders','cf_service_catalog','cf_tax_payments',
  'cf_user_activity_daily','cf_user_presence','companies','company_users',
  'invoice_items','invoices','notification_log','push_notification_log',
  'push_subscriptions','user_roles','vehicles','wash_change_requests',
  'wash_record_photos','wash_records','website_content','website_events'
] as const;
const ALLOWED_ORIGINS = new Set(['https://cleanfleet.pl','https://www.cleanfleet.pl']);
const PROJECT_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const admin = createClient(PROJECT_URL, SERVICE_KEY, {auth:{autoRefreshToken:false,persistSession:false}});
function json(body:unknown,status=200,origin=''){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store',
    ...(ALLOWED_ORIGINS.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}});
}
async function authorize(req:Request){
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('Brak sesji.');
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)throw new Error('Niepoprawna sesja.');
  const {data:role,error:roleError}=await admin.from('user_roles').select('role').eq('user_id',user.id).single();
  if(roleError||role?.role!=='admin')throw new Error('Brak uprawnień administratora.');
  return user;
}
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
    ...(ALLOWED_ORIGINS.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'authorization,apikey,content-type','vary':'Origin'}:{})}});
  if(req.method!=='GET')return json({error:'Ta funkcja obsługuje tylko odczyt.'},405,origin);
  try{
    const user=await authorize(req);
    const client=new pg.Client({connectionString:DB_URL});
    await client.connect();
    let payload;
    try{
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tables:Record<string,unknown[]>={};
      for(const name of TABLES)tables[name]=(await client.query(`SELECT * FROM public.${name}`)).rows;
      tables.wash_record_photos=[];
      const users=(await client.query('SELECT id,email,phone,created_at,updated_at,raw_app_meta_data,raw_user_meta_data FROM auth.users')).rows;
      await client.query('COMMIT');
      payload={tables,users,objects:[]};
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{await client.end();}
    return json({format:'CleanFleet Unified Backup v2',createdAt:new Date().toISOString(),createdBy:user.id,
      project:new URL(PROJECT_URL).hostname.split('.')[0],...payload,
      limitations:['Hasła i aktywne sesje kont nie są zawarte w kopii.','Zdjęcia są pomijane.']},200,origin);
  }catch(error){console.error('Backup export:',error);
    return json({error:error instanceof Error?error.message:'Błąd eksportu.'},500,origin);}
});
