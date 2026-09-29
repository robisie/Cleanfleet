// Read-only server endpoint for the unified CleanFleet backup package.
// The privileged DB URL and service key stay inside the Edge runtime.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import postgres from 'npm:postgres@3.4.7';

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
const db = postgres(DB_URL, {max:1,prepare:false});
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
  if(req.method!=='GET')return json({error:'Niedozwolona metoda.'},405,origin);
  try{
    const user=await authorize(req);
    const url=new URL(req.url);
    if(url.searchParams.get('file')){
      const bucket=url.searchParams.get('bucket')||'';
      const path=url.searchParams.get('file')||'';
      if(!bucket||!path||path.includes('..')||path.startsWith('/'))return json({error:'Nieprawidłowa ścieżka.'},400,origin);
      const {data,error}=await admin.storage.from(bucket).download(path);
      if(error||!data)return json({error:'Nie udało się pobrać pliku.'},404,origin);
      return new Response(data,{headers:{'content-type':'application/octet-stream','cache-control':'no-store',
        ...(ALLOWED_ORIGINS.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}});
    }
    const payload=await db.begin(async tx=>{
      await tx.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tables:Record<string,unknown[]>={};
      for(const name of TABLES)tables[name]=await tx.unsafe(`SELECT * FROM public.${name}`);
      const users=await tx.unsafe('SELECT id,email,phone,created_at,updated_at,raw_app_meta_data,raw_user_meta_data FROM auth.users');
      const objects=await tx.unsafe('SELECT bucket_id,name,metadata FROM storage.objects ORDER BY bucket_id,name');
      return {tables,users,objects};
    });
    return json({format:'CleanFleet Unified Backup v1',createdAt:new Date().toISOString(),createdBy:user.id,
      project:new URL(PROJECT_URL).hostname.split('.')[0],...payload,
      limitations:['Auth passwords and active sessions cannot be restored from this file.',
        'Photos stored only in another device browser are not available on this device.']},200,origin);
  }catch(e){console.error('cleanfleet-backup export:',e);return json({error:e instanceof Error?e.message:'Błąd eksportu.'},500,origin);}
});
