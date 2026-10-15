const URL='https://nxmrobbhfqijmbjjzbof.supabase.co';
const KEY='sb_publishable_9lz7NUv2-MloX7MEcH2-vQ_AZS8IIHz';
const SESSION_KEY='robisie-auth-session-v1';
let session=null,refreshing=null;
export const getSession=()=>session;
export function restoreSession(){try{session=JSON.parse(localStorage.getItem(SESSION_KEY));}catch{session=null;}return session;}
function setSession(s){if(!s.expires_at&&s.expires_in)s.expires_at=Math.floor(Date.now()/1000)+s.expires_in;session=s;localStorage.setItem(SESSION_KEY,JSON.stringify(s));}
async function request(path,options={},auth=true){
 if(auth&&session?.expires_at&&session.expires_at*1000<Date.now()+30000){
  if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false).then(setSession).finally(()=>{refreshing=null;});
  await refreshing;
 }
 const {timeoutMs=15000,...init}=options,controller=new AbortController();let timer;
 try{return await Promise.race([(async()=>{
  const res=await fetch(URL+path,{...init,signal:controller.signal,headers:{apikey:KEY,'Content-Type':'application/json',...(auth&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...init.headers}});
  const raw=await res.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('Nieprawidłowa odpowiedź serwera.');}
  if(!res.ok){const error=new Error(data?.message||data?.error_description||'Nie udało się zapisać danych.');error.code=data?.code;throw error;}
  return data;
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=new Error('Połączenie trwa zbyt długo. Zmiany zachowano na urządzeniu.');error.code='RS_NETWORK_TIMEOUT';reject(error);},timeoutMs);})]);}finally{clearTimeout(timer);}
}
export async function login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);setSession(s);return s;}
export function logout(){session=null;localStorage.removeItem(SESSION_KEY);}
export const rpc=(name,args={})=>request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});
export const projects=()=>request('/rest/v1/rs_projects?select=*&order=created_at.desc');
export const settings=()=>request('/rest/v1/rs_settings?select=*');
export const createProject=(payload,date)=>rpc('rs_create_project',{p_payload:payload,p_date:date});
function clean(value){const {_undo,...data}=value||{};return data;}
function sameData(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameData(a[key],b[key]));}
export function changedFields(before,after){const a=clean(before),b=clean(after);return {p_fields:Object.fromEntries(Object.keys(b).filter(key=>!sameData(a[key],b[key])).map(key=>[key,b[key]])),p_remove_keys:Object.keys(a).filter(key=>!Object.hasOwn(b,key))};}
async function fastSave(name,args,payload,baseline,path){
 const submitted=structuredClone(payload);
 try{const metadata=await rpc(name,args),row=Array.isArray(metadata)?metadata[0]:metadata;if(!row||!Number.isFinite(row.revision))throw new Error('Serwer nie potwierdził zapisu.');return {...baseline,...row,payload:submitted};}
 catch(error){
  // A dropped response does not mean the write failed. Confirm once; never repeat a write blindly.
  if(error.code==='RS_NETWORK_TIMEOUT'||error.name==='AbortError'||error.name==='TypeError'||error.code==='RS_CONFLICT'||/RS_CONFLICT/.test(error.message)){
   try{const rows=await request(path,{timeoutMs:5000});const row=Array.isArray(rows)?rows[0]:rows;if(row&&row.revision===args.p_revision+1&&sameData(clean(row.payload),clean(submitted)))return row;}catch{}
  }
  throw error;
 }
}
export const saveProject=(project,payload)=>fastSave('rs_save_project_fast',{p_id:project.id,...changedFields(project.payload,payload),p_revision:project.revision,p_undo_saved_at:payload._undo?.savedAt||null},payload,project,'/rest/v1/rs_projects?select=*&id=eq.'+encodeURIComponent(project.id));
export const saveSettings=(payload,revision,previous)=>fastSave('rs_save_settings_fast',{...changedFields(previous,payload),p_revision:revision,p_undo_saved_at:payload._undo?.savedAt||null},payload,{revision},'/rest/v1/rs_settings?select=*');

export const deleteProject=project=>rpc('rs_delete_project',{p_id:project.id,p_revision:project.revision});
