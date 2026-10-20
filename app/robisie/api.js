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

// The server commits the completion and its unique earnings entry together.
export const finishProject=(project,amount)=>rpc('rs_finish_project_with_earnings',{p_id:project.id,p_revision:project.revision,p_amount:amount});

export async function stageInvoices(id){
 const [bill,linked]=await Promise.all([request('/functions/v1/cleanfleet-bill',{method:'POST',body:JSON.stringify({action:'search',sourceApp:'robisie',sourceId:id})}),request('/rest/v1/rs_ksef_links?select=document&project_id=eq.'+encodeURIComponent(id))]);
 const rows=[...bill];for(const entry of linked){const row=entry.document;if(!rows.some(x=>x.id===row.id||(x.ksef_number&&x.ksef_number===row.ksef_number)))rows.push(row);}return rows;
}

export const project=id=>request('/rest/v1/rs_projects?select=*&id=eq.'+encodeURIComponent(id)).then(rows=>rows[0]);

export const purchaseKsefLink=(number,id)=>request('/rest/v1/rs_ksef_links?select=*&ksef_number=eq.'+encodeURIComponent(number)+'&project_id=eq.'+encodeURIComponent(id)).then(rows=>{if(!rows[0])throw Error('Nie znaleziono przypisanej faktury. Odśwież inwestycję.');return rows[0];});
export async function purchaseKsefXml(number){
 const result=await request('/functions/v1/cleanfleet-bill',{method:'POST',body:JSON.stringify({action:'ksef-document',number}),timeoutMs:90000});
 const bytes=Uint8Array.from(atob(result.content),c=>c.charCodeAt(0));
 return new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',{fatal:true}).decode(bytes);
}
export const purchaseKsefPreview=xml=>rpc('rs_ksef_purchase_preview',{p_xml:xml});
export async function savePurchaseSettlement(project,payload,link,indices,xml){return savePurchaseKsef(project,payload,link,indices,xml,'rs_save_purchase_ksef_settlement');}
export async function savePurchaseKsef(project,payload,link,indices,xml,endpoint='rs_save_purchase_ksef_form'){
 const args={p_project:project.id,p_revision:project.revision,p_number:link.ksef_number,p_xml:xml,p_indices:indices,p_expected_indices:link.document.selectedIndices??null,p_payload:payload};
 try{return await request('/rest/v1/rpc/'+endpoint,{method:'POST',body:JSON.stringify(args),timeoutMs:30000});}
 catch(error){
  if(error.code==='RS_NETWORK_TIMEOUT'||error.name==='AbortError'||error.name==='TypeError'||/RS_CONFLICT/.test(error.message)){
   try{const rows=await request('/rest/v1/rs_projects?select=*&id=eq.'+encodeURIComponent(project.id));const row=rows[0],expected=structuredClone(payload);if(row){const actual=row.payload.purchases?.find(x=>x.sourceKsefNumber===link.ksef_number),submitted=expected.purchases?.find(x=>x.sourceKsefNumber===link.ksef_number);if(actual&&submitted&&sameData(actual.selectedKsefRows,indices))submitted.description=actual.description;}if(row&&row.revision>project.revision&&sameData(clean(row.payload),clean(expected)))return row;}catch{}
  }
  throw error;
 }
}
