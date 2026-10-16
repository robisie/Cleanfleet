const URL='https://nxmrobbhfqijmbjjzbof.supabase.co';
const KEY='sb_publishable_9lz7NUv2-MloX7MEcH2-vQ_AZS8IIHz';
const SESSION_KEY='bill-auth-session-v1';
let session=null,refreshing=null;
export const getSession=()=>session;
export function restoreSession(){try{session=JSON.parse(localStorage.getItem(SESSION_KEY));}catch{session=null;}return session;}
function setSession(s){if(!s.expires_at&&s.expires_in)s.expires_at=Math.floor(Date.now()/1000)+s.expires_in;session=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s));}
async function request(path,options={},auth=true){
 if(auth&&session?.expires_at&&session.expires_at*1000<Date.now()+30000){
  if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false).then(setSession).finally(()=>{refreshing=null;});
  await refreshing;
 }
 const {timeoutMs=15000,binary=false,signal:externalSignal,...init}=options,controller=new AbortController();let timer;const abort=()=>controller.abort();if(externalSignal?.aborted)controller.abort();externalSignal?.addEventListener('abort',abort,{once:true});
 try{return await Promise.race([(async()=>{
  const res=await fetch(URL+path,{...init,signal:controller.signal,headers:{apikey:KEY,'Content-Type':'application/json',...(auth&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...init.headers}});
  if(binary&&res.ok)return new Uint8Array(await res.arrayBuffer());
  const raw=await res.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('Nieprawidłowa odpowiedź serwera.');}
  if(!res.ok){const error=new Error(data?.error||data?.message||data?.error_description||'Nie udało się zapisać danych.');error.code=data?.code;throw error;}
  return data;
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=new Error('Połączenie trwa zbyt długo. Odśwież listę, aby sprawdzić wynik operacji.');error.code='RS_NETWORK_TIMEOUT';reject(error);},timeoutMs);})]);}finally{clearTimeout(timer);externalSignal?.removeEventListener('abort',abort);}
}
export async function login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);setSession(s);return s;}
export function logout(){session=null;localStorage.removeItem(SESSION_KEY);}

export const call=(body,options={})=>request("/functions/v1/cleanfleet-bill",{method:"POST",body:JSON.stringify(body),timeoutMs:90000,...options});
