import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {requestBody,normalize} from './core.mjs';
import {signJob,readJob} from './jobs.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({error:'Nieprawidłowa metoda.'},405);
  try{
    const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)return json({error:'Zaloguj się do CleanFleet.'},401);
    const {data,error}=await admin.auth.getUser(token);
    if(error||!data.user)return json({error:'Zaloguj się ponownie.'},401);
    const role=await admin.from('user_roles').select('role').eq('user_id',data.user.id).single();
    if(role.error||role.data?.role!=='admin')return json({error:'Czytnik jest dostępny dla administratora.'},403);
    const key=Deno.env.get('OPENAI_API_KEY');
    if(!key)return json({error:'Czytnik nie ma skonfigurowanego klucza OpenAI API.'},503);
    if(Number(req.headers.get('content-length')||0)>9000000)return json({error:'Zdjęcie jest zbyt duże.'},413);
    const body=await req.json();
    if(body.action==='health')return json({ok:true,configured:true});
    let response;
    if(body.action==='status'){
      const job=await readJob(body.job,data.user.id,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      if(!job)return json({error:'Sesja odczytu wygasła lub jest nieprawidłowa.'},403);
      response=await fetch('https://api.openai.com/v1/responses/'+encodeURIComponent(job.id),{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
    }else{
      const image=body.image;
      if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>8500000)return json({error:'Wybierz poprawne zdjęcie JPG, PNG lub WebP.'},400);
      const input=requestBody(image);
      // Legacy clients remain compatible; current clients use short polling requests.
      if(body.action==='start')input.background=true;
      response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(body.action==='start'?30000:120000),body:JSON.stringify(input)});
    }
    if(!response.ok){
      const detail=await response.json().catch(()=>({}));
      console.error('wash-sheet api',response.status,detail?.error?.code||'unknown');
      return json({error:response.status===429?'Brak dostępnego limitu lub środków OpenAI API.':response.status===401?'Klucz OpenAI API jest nieprawidłowy.':'Serwer odczytu odrzucił żądanie. Spróbuj ponownie.'},502);
    }
    const output=await response.json();
    if(['queued','in_progress'].includes(output.status)){
      const job=body.action==='status'?body.job:await signJob(output.id,data.user.id,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      return json({ok:true,pending:true,job});
    }
    if(output.status!=='completed')return json({error:'Odczyt nie został ukończony. Podziel kartkę na mniejsze zdjęcia.'},502);
    const raw=(output.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
    const parsed=JSON.parse(raw);
    const rows=normalize(parsed);
    return json({ok:true,rows});
  }catch(error){console.error('wash-sheet',error instanceof Error?error.name:'error');return json({error:error instanceof Error&&error.name==='TimeoutError'?'Serwer odczytu odpowiada zbyt długo. Spróbuj ponownie.':'Nie udało się odczytać kartki. Spróbuj ponownie lub uzupełnij wiersze ręcznie.'},502);}
});
