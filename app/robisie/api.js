const URL='https://nxmrobbhfqijmbjjzbof.supabase.co';
const KEY='sb_publishable_9lz7NUv2-MloX7MEcH2-vQ_AZS8IIHz';
const SESSION_KEY='sb-nxmrobbhfqijmbjjzbof-auth-token';
let session=null;
export const getSession=()=>session;
export function restoreSession(){try{session=JSON.parse(localStorage.getItem(SESSION_KEY));}catch{session=null;}return session;}
function setSession(s){if(!s.expires_at&&s.expires_in)s.expires_at=Math.floor(Date.now()/1000)+s.expires_in;session=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s));}
async function request(path,options={},auth=true){
 if(auth&&session?.expires_at&&session.expires_at*1000<Date.now()+30000){const r=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false);setSession(r);}
 const res=await fetch(URL+path,{...options,headers:{apikey:KEY,'Content-Type':'application/json',...(auth&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
 const raw=await res.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('Nieprawidłowa odpowiedź serwera.');}
 if(!res.ok){const error=new Error(data?.message||data?.error_description||'Nie udało się zapisać danych.');error.code=data?.code;throw error;}
 return data;
}
export async function login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);setSession(s);return s;}
export function logout(){session=null;localStorage.removeItem(SESSION_KEY);}
export const rpc=(name,args={})=>request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});
export const projects=()=>request('/rest/v1/rs_projects?select=*&order=created_at.desc');
export const settings=()=>request('/rest/v1/rs_settings?select=*');
export const createProject=(payload,date)=>rpc('rs_create_project',{p_payload:payload,p_date:date});
export const saveProject=(project,payload)=>rpc('rs_save_project',{p_id:project.id,p_payload:payload,p_revision:project.revision});
export const saveSettings=(payload,revision)=>rpc('rs_save_settings',{p_payload:payload,p_revision:revision});
