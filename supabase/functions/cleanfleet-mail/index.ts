import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {ImapFlow} from 'npm:imapflow@2.2.1';
import {createMailHandler} from './core.js';
import {HttpError} from './crypto.js';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
async function authorize(request:Request){
  const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)throw new HttpError('Zaloguj się do CleanFleet.',401);
  const {data,error}=await admin.auth.getUser(token);
  if(error || !data.user)throw new HttpError('Zaloguj się ponownie do CleanFleet.',401);
  const role=await admin.from('user_roles').select('role').eq('user_id',data.user.id).single();
  if(role.error || role.data?.role!=='admin')throw new HttpError('Moduł jest dostępny dla administratora.',403);
  return data.user.id;
}
function makeClient(config:{email:string;password:string}){
  const client=new ImapFlow({host:'poczta.o2.pl',port:993,secure:true,auth:{user:config.email,pass:config.password,loginMethod:'LOGIN'},logger:false,logRaw:false,disableAutoIdle:true,disableCompression:true,disableBinary:true,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:25000,tls:{rejectUnauthorized:true}});
  client.on('error',()=>{});return client;
}
const credentialStore={
  async get(userId:string){
    const result=await admin.from('cf_mail_credentials').select('ciphertext').eq('user_id',userId).maybeSingle();
    if(result.error)throw new HttpError('Nie udało się odczytać zapisanych danych poczty.',503);
    return result.data;
  },
  async set(userId:string,value:{ciphertext:string}){
    const result=await admin.from('cf_mail_credentials').upsert({user_id:userId,...value,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(result.error)throw new HttpError('Nie udało się zapisać danych poczty.',503);
  }
};
Deno.serve(createMailHandler({authorize,makeClient,secret,credentialStore}));

