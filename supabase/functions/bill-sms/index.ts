import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createStateCodec} from '../cleanfleet-ksef/core.js';

const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const codec=createStateCodec(secret,'bill-sms-config-v1');
const origins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
const base='https://api.przypominamy.com/v1';
const responseHeaders={'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
function checked(result:any){if(result.error)throw Error('Nie udało się zapisać ustawień SMS.');return result.data;}
async function provider(path:string,key:string,body?:unknown,idempotencyKey?:string){
  let res:Response;
  try{res=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});}
  catch{throw Error('Operator SMS nie odpowiada. Sprawdź połączenie później.');}
  if(!res.ok)throw Error(res.status===401?'Klucz SMS został odrzucony.':res.status===403?'Klucz SMS nie ma wymaganych uprawnień lub numer nie jest zweryfikowany.':res.status===402?'Brak środków lub testowych wiadomości SMS.':res.status===429?'Limit zapytań SMS. Spróbuj później.':'Operator SMS odrzucił żądanie (HTTP '+res.status+').');
  return res.json();
}
async function saved(userId:string){
  const row=checked(await db.from('bill_sms_credentials').select('ciphertext').eq('user_id',userId).maybeSingle());
  return row?await codec.open(row.ciphertext,userId,'sms-config'):null;
}
Deno.serve(async req=>{
  const origin=req.headers.get('Origin')||'';
  const headers={...responseHeaders,'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0]};
  const json=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{...headers,'Content-Type':'application/json'}});
  if(origin&&!origins.includes(origin))return json({error:'Niedozwolone źródło żądania.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'Niedozwolona metoda.'},405);
  try{
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'');
    const auth=await db.auth.getUser(token);
    if(auth.error||!auth.data.user)return json({error:'Zaloguj się ponownie.'},401);
    const userId=auth.data.user.id;
    const role=checked(await db.from('user_roles').select('role').eq('user_id',userId).single());
    if(role?.role!=='admin')return json({error:'Dostęp tylko dla administratora.'},403);
    const raw=await req.text();if(raw.length>10000)return json({error:'Żądanie jest za duże.'},413);
    const input=JSON.parse(raw);
    if(!input||typeof input!=='object')return json({error:'Niepoprawne żądanie.'},400);
    if(input.action==='sms-save'){
      const key=String(input.key||'').trim();
      if(!/^pk_(test|live)_[A-Za-z0-9_-]{20,150}$/.test(key))return json({error:'Podaj poprawny klucz API SMS.'},400);
      const account=await provider('/account',key);
      if(!Array.isArray(account.scopes)||!account.scopes.includes('send')||!account.scopes.includes('read'))return json({error:'Klucz musi mieć uprawnienia send i read.'},400);
      const mode=key.startsWith('pk_test_')?'test':'live';
      const ciphertext=await codec.seal({scope:'sms-config',userId,key,mode,expires:Number.MAX_SAFE_INTEGER});
      checked(await db.from('bill_sms_credentials').upsert({user_id:userId,ciphertext,updated_at:new Date().toISOString()}));
      return json({configured:true,mode,credits:account.test_credits??null,balance:account.balance_grosze??null,sender:account.sender_name||''});
    }
    if(input.action==='sms-remove'){
      checked(await db.from('bill_sms_credentials').delete().eq('user_id',userId));
      return json({configured:false});
    }
    const config=await saved(userId);
    if(input.action==='sms-config'){
      if(!config)return json({configured:false});
      const account=await provider('/account',config.key);
      return json({configured:true,mode:config.mode,credits:account.test_credits??null,balance:account.balance_grosze??null,sender:account.sender_name||''});
    }
    if(input.action==='sms-test'){
      if(!config)return json({error:'Najpierw zapisz klucz SMS.'},400);
      if(config.mode!=='test')return json({error:'Ta próba jest dostępna wyłącznie z kluczem testowym.'},400);
      const number=String(input.number||'').replace(/[\s()-]/g,'');
      if(!/^\+48[1-9]\d{8}$/.test(number))return json({error:'Podaj polski numer w formacie +48XXXXXXXXX.'},400);
      const requestId=String(input.requestId||'');
      if(!/^[0-9a-f-]{36}$/i.test(requestId))return json({error:'Otwórz formularz testowy ponownie.'},400);
      const result=await provider('/messages',config.key,{to:number,text:'Test SMS z aplikacji Bill (cleanfleet.pl). Polaczenie dziala.',purpose:'test polaczenia aplikacji Bill',reference:'bill-test-'+requestId},requestId);
      return json({id:result.id,status:result.status,to:number});
    }
    return json({error:'Nieznana akcja.'},400);
  }catch(err){return json({error:err instanceof Error?err.message:'Nie udało się obsłużyć SMS.'},400);}
});
