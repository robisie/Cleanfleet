import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {requestBody,normalize} from './core.mjs';
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
    const image=body.image;
    if(typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>8500000)return json({error:'Wybierz poprawne zdjęcie JPG, PNG lub WebP.'},400);
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(85000),body:JSON.stringify(requestBody(image))});
    if(!response.ok){await response.body?.cancel();return json({error:response.status===429?'Brak dostępnego limitu lub środków OpenAI API.':response.status===401?'Klucz OpenAI API jest nieprawidłowy.':'Nie udało się odczytać zdjęcia. Spróbuj ponownie.'},502);}
    const output=await response.json();
    if(output.status!=='completed')return json({error:'Odczyt nie został ukończony. Podziel kartkę na mniejsze zdjęcia.'},502);
    const raw=(output.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
    const parsed=JSON.parse(raw);
    const rows=normalize(parsed);
    return json({ok:true,rows});
  }catch(error){console.error('wash-sheet',error instanceof Error?error.name:'error');return json({error:'Nie udało się odczytać kartki. Spróbuj ponownie lub uzupełnij wiersze ręcznie.'},502);}
});
