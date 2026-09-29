// Admin-only export and selective restore. Temporary photos are excluded.
// The privileged DB URL and service key stay inside the Edge runtime.
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import pg from 'npm:pg@8.16.3';
import './sections.js';
import './restore-engine.js';

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
async function transaction<T>(readOnly:boolean,run:(tx:{unsafe:(query:string,params?:unknown[])=>Promise<any[]>})=>Promise<T>):Promise<T>{
  const client=new pg.Client({connectionString:DB_URL});
  await client.connect();
  try{
    await client.query('BEGIN');
    await client.query(`SET TRANSACTION ISOLATION LEVEL ${readOnly?'REPEATABLE READ READ ONLY':'SERIALIZABLE'}`);
    const result=await run({unsafe:async(query,params=[])=> (await client.query(query,params)).rows});
    await client.query('COMMIT');
    return result;
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{await client.end();}
}
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
    ...(ALLOWED_ORIGINS.has(origin)?{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'authorization,apikey,content-type','vary':'Origin'}:{})}});
  if(!['GET','POST'].includes(req.method))return json({error:'Niedozwolona metoda.'},405,origin);
  try{
    const user=await authorize(req);
    if(req.method==='POST'){
      if(Number(req.headers.get('content-length')||0)>16_000_000)return json({error:'Plik jest za duży.'},413,origin);
      const body=await req.text();
      if(new TextEncoder().encode(body).byteLength>16_000_000)return json({error:'Plik jest za duży.'},413,origin);
      const request=JSON.parse(body);
      const source=request?.backup;
      const project=new URL(PROJECT_URL).hostname.split('.')[0];
      if(source?.format!=='CleanFleet Unified Backup v2'||source.project!==project||!source.tables||
         !Array.isArray(source.objects)||source.objects.length||source.localPhotos||
         TABLES.some(name=>!Array.isArray(source.tables[name]))||source.tables.wash_record_photos.length)
        return json({error:'Niekompletny backup lub inny projekt.'},400,origin);
      if(!['preview','restore'].includes(request.action))return json({error:'Nieznana operacja.'},400,origin);
      const sections=(globalThis as any).CFBackupSections;
      const engine=(globalThis as any).CFBackupRestoreEngine;
      const result=await transaction(request.action==='preview',async tx=>{
        const current:Record<string,unknown[]>={};
        for(const name of TABLES)current[name]=(await tx.unsafe(`SELECT * FROM public.${name}`))
          .sort((a:unknown,b:unknown)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const operations=sections.planRestore(source.tables,current,request.selection,user.id);
        const targetUsers=await tx.unsafe('SELECT id FROM auth.users');
        const knownUsers=new Set(targetUsers.map((x:{id:string})=>String(x.id)));
        for(const op of operations){
          const rows=op.action==='merge'?Object.values(op.tables).flat():op.action==='insert'?op.rows:[];
          for(const row of rows as Array<Record<string,unknown>>){
            for(const key of ['user_id','created_by','sender_user_id','recipient_user_id','requested_by']){
              if(row[key]&&!knownUsers.has(String(row[key])))throw new Error('Brakuje konta użytkownika dla pola '+key+'.');
            }
          }
        }
        const summary=operations.map((op:any)=>({scope:op.scope,action:op.action,table:op.table||'panel',count:op.action==='merge'
          ?engine.ADMIN_ORDER.reduce((n:number,table:string)=>n+(op.tables[table]?.length||0),0):op.rows.length}));
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(operations)));
        const planHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
        if(request.action==='preview')return {summary,planHash};
        if(request.expectedPlanHash!==planHash)throw new Error('Dane zmieniły się od podglądu. Otwórz podgląd ponownie; nic nie zapisano.');
        const stats=await engine.applyRestore(tx,operations);
        return {summary,planHash,stats};
      });
      return json(result,200,origin);
    }
    const payload=await transaction(true,async tx=>{
      const tables:Record<string,unknown[]>={};
      for(const name of TABLES)tables[name]=await tx.unsafe(`SELECT * FROM public.${name}`);
      const users=await tx.unsafe('SELECT id,email,phone,created_at,updated_at,raw_app_meta_data,raw_user_meta_data FROM auth.users');
      tables.wash_record_photos=[];
      return {tables,users,objects:[]};
    });
    return json({format:'CleanFleet Unified Backup v2',createdAt:new Date().toISOString(),createdBy:user.id,
      project:new URL(PROJECT_URL).hostname.split('.')[0],...payload,
      limitations:['Auth passwords and active sessions cannot be restored from this file.',
        'Temporary and server photos are excluded from the backup.']},200,origin);
  }catch(e){console.error('cleanfleet-backup export:',e);return json({error:e instanceof Error?e.message:'Błąd eksportu.'},500,origin);}
});
