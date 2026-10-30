import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
const clean=(v:unknown,n=200)=>String(v??'').trim().slice(0,n);
const text=(v:any)=>typeof v?.output_text==='string'?v.output_text:(v?.output||[]).flatMap((o:any)=>o.content||[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('');
const number=(v:unknown,places=2)=>{const n=Number(String(v??'').replace(',','.'));if(v==null||String(v).trim()==='')return null;return Number.isFinite(n)&&n>=0?Number(n.toFixed(places)):null};
const date=(v:unknown)=>{const s=clean(v,10);return /^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(new Date(s+'T12:00:00Z').getTime())&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s?s:''};
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(origin&&!origins.includes(origin))return json({error:'Niedozwolone źródło.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Nieprawidłowa metoda.'},405);
 try{
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return json({error:'Zaloguj się ponownie.'},401);
  const user=await db.auth.getUser(token);if(user.error||!user.data.user)return json({error:'Zaloguj się ponownie.'},401);
  const role=await db.from('user_roles').select('role').eq('user_id',user.data.user.id).maybeSingle();if(role.error||role.data?.role!=='admin')return json({error:'Dostęp tylko dla administratora.'},403);
  const body=await req.json(),mime=clean(body.mime,50),name=clean(body.name,150),base64=clean(body.base64,11200000);
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(mime)||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length>11200000||base64.length<100||!name)return json({error:'Wybierz czytelny JPG, PNG, WebP lub PDF do 8 MB.'},400);
  const key=Deno.env.get('OPENAI_API_KEY');if(!key)return json({error:'Brak konfiguracji odczytu paragonów.'},503);
  const prompt='Przeanalizuj WSZYSTKIE strony pliku. Odczytaj WSZYSTKIE paragony z NIP-em w kolejności stron, również kilka paragonów na jednej stronie. Paragon kontynuowany na następnej stronie połącz w jeden dokument. Nie łącz różnych paragonów. Zwróć sam JSON: {"complete":true,"receipts":[{"pages":[1],"date":"YYYY-MM-DD","number":"numer paragonu/dokumentu","seller":"sklep/wystawca","sellerNip":"10 cyfr","buyerNip":"10 cyfr kupującego","total":123.45,"items":[{"name":"pełna nazwa widoczna na paragonie","quantity":1,"unit":"szt.","gross":12.34}],"uncertain":["co sprawdzić"]}]}. complete=true tylko po przeanalizowaniu każdej strony, w przeciwnym razie false. Nie pomijaj nieczytelnych paragonów: zwróć je z pustymi polami i uncertain do ręcznego uzupełnienia. Pusta receipts oznacza brak paragonów. Każdy zakupiony towar w oddzielnym wierszu, po zniżkach, gross = łączna kwota brutto tej pozycji, NIE cena jednostkowa. Zwrócone opakowania, płatności i podsumowania nie są towarami. Nie zgaduj numerów, dat, NIP-ów, ilości ani kwot; brakującą wartość ustaw null. Nie twórz brakujących pozycji. Kwota total to suma do zapłaty na paragonie. NIP kupującego musi być wyraźnie oznaczony; nie kopiuj NIP-u sprzedawcy.';
  const content=mime==='application/pdf'?[{type:'input_text',text:prompt},{type:'input_file',filename:name.replace(/[^\w.\-]/g,'_'),file_data:'data:application/pdf;base64,'+base64}]:[{type:'input_text',text:prompt},{type:'input_image',image_url:'data:'+mime+';base64,'+base64,detail:'high'}];
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(105000),body:JSON.stringify({model:'gpt-5.6-luna',store:false,reasoning:{effort:'low'},input:[{role:'user',content}],max_output_tokens:24000})});
  const result=await response.json().catch(()=>({}));if(!response.ok)return json({error:response.status===429?'Limit odczytu dokumentów jest chwilowo wyczerpany.':'Nie udało się odczytać paragonu.'},502);
  if(result.status==='incomplete')throw Error('Plik zawiera zbyt dużo danych na jeden odczyt. Podziel PDF na mniejsze części i dodaj każdą osobno.');
  let parsed:any;try{parsed=JSON.parse(text(result));}catch{throw Error('Odczyt nie zwrócił poprawnych danych. Spróbuj wyraźniejszego skanu.');}
  if(parsed.complete===false)throw Error('Nie udało się odczytać całego pliku. Podziel PDF na mniejsze części.');
  const receipts=Array.isArray(parsed.receipts)?parsed.receipts:[parsed];
  if(receipts.length>80)throw Error('W pliku jest więcej niż 80 paragonów. Podziel PDF na mniejsze części.');
  const normalized=receipts.map((parsed:any)=>{
  if(parsed.items?.length>80)throw Error('Paragon zawiera ponad 80 pozycji. Dodaj go osobno.');
  const items=Array.isArray(parsed.items)?parsed.items.map((i:any)=>({name:clean(i.name,200),quantity:number(i.quantity,6),unit:clean(i.unit,25)||'szt.',gross:number(i.gross)})):[];
  return {pages:Array.isArray(parsed.pages)?parsed.pages.filter((p:unknown)=>Number.isInteger(p)&&Number(p)>0):[],date:date(parsed.date),number:clean(parsed.number,100),seller:clean(parsed.seller,200),sellerNip:clean(parsed.sellerNip,20).replace(/\D/g,''),buyerNip:clean(parsed.buyerNip,20).replace(/\D/g,''),total:number(parsed.total),items,uncertain:Array.isArray(parsed.uncertain)?parsed.uncertain.slice(0,20).map((x:unknown)=>clean(x,180)):[]};});
  return json(Array.isArray(parsed.receipts)?{...(normalized[0]||{}),receipts:normalized}:normalized[0]);
 }catch(error){return json({error:error instanceof Error?error.message:'Nie udało się odczytać skanu.'},422);}
});
