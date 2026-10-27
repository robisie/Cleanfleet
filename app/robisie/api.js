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
 const {timeoutMs=15000,signal:externalSignal,...init}=options,controller=new AbortController();let timer;const abort=()=>controller.abort();if(externalSignal?.aborted)controller.abort();externalSignal?.addEventListener('abort',abort,{once:true});
 try{return await Promise.race([(async()=>{
  const res=await fetch(URL+path,{...init,signal:controller.signal,headers:{apikey:KEY,'Content-Type':'application/json',...(auth&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...init.headers}});
  const raw=await res.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('Nieprawidłowa odpowiedź serwera.');}
  if(!res.ok){const error=new Error(data?.message||data?.error_description||'Nie udało się zapisać danych.');error.code=data?.code;throw error;}
  return data;
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=new Error('Połączenie trwa zbyt długo. Zmiany zachowano na urządzeniu.');error.code='RS_NETWORK_TIMEOUT';reject(error);},timeoutMs);})]);}finally{clearTimeout(timer);externalSignal?.removeEventListener('abort',abort);}
}
export async function login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);setSession(s);return s;}
export function logout(){session=null;localStorage.removeItem(SESSION_KEY);}
export const rpc=(name,args={})=>request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args)});
// Magazyn uses Robisię's authenticated session, including KSeF reads and quantity writes.
export const ksefCall=(body,options={})=>request('/functions/v1/cleanfleet-bill',{method:'POST',body:JSON.stringify(body),timeoutMs:90000,...options});
const stockRpc=(name,args={})=>request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(args),timeoutMs:90000});
export function stockIntegration(rows,onChange=()=>{}){return {
 userId:getSession()?.user?.id,
 projects:rows.map(r=>({id:r.id,name:r.payload.name,number:r.contract_number})),
 index:()=>stockRpc('rs_ksef_document_index'),
 storeMetadata:rows=>stockRpc('rs_ksef_store_metadata',{p_rows:rows}),
 storeXml:(number,xml)=>stockRpc('rs_ksef_store_xml',{p_number:number,p_xml:xml}),
 stock:()=>stockRpc('rs_ksef_stock'),
 scanReceipt:({file,signal})=>request('/functions/v1/robisie-receipt-scan',{method:'POST',body:JSON.stringify(file),timeoutMs:120000,signal}),
 saveReceipt:({hash,data})=>stockRpc('rs_receipt_save',{p_hash:hash,p_data:data}),
 assignReceipt:async({number,project,entries,revision})=>{const result=await stockRpc('rs_receipt_assign_project',{p_number:number,p_project:project,p_entries:entries,p_revision:revision});await onChange(result.project);return result;},
 assignReceiptCleanfleet:({number,indices})=>stockRpc('rs_receipt_assign_cleanfleet',{p_number:number,p_indices:indices}),
 correctCostContext:number=>stockRpc('rs_ksef_cost_correction_context',{p_number:number}),
 applyCostCorrection:async({project,number,amount,revision})=>{const result=await stockRpc('rs_apply_ksef_cost_correction',{p_project:project,p_number:number,p_amount:amount,p_revision:revision});await onChange(result.project);return result;},
 setReturn:({number,index,quantity,revision})=>stockRpc('rs_ksef_set_return',{p_number:number,p_index:index,p_quantity:quantity,p_revision:revision}),
 setUse:({number,index,category,quantity,revision})=>stockRpc('rs_ksef_set_use',{p_number:number,p_index:index,p_category:category,p_quantity:quantity,p_revision:revision}),
 setInvoiceUse:({number,category,indices})=>stockRpc('rs_ksef_set_invoice_use',{p_number:number,p_category:category,p_expected_indices:indices}),
 loadLinks:()=>request('/rest/v1/rs_ksef_links?select=*'),
 cfLinks:()=>request('/rest/v1/cf_purchases?source_ksef_number=not.is.null&select=source_ksef_number,source_ksef_index'),
 cfContext:number=>stockRpc('cf_ksef_cost_context',{p_number:number}),
 cfCompanies:()=>stockRpc('cf_admin_companies_list'),
 cfSave:({number,xml,entries,revision})=>stockRpc('cf_save_ksef_costs',{p_number:number,p_xml:xml,p_entries:entries,p_revision:revision}),
 preview:({xml})=>stockRpc('rs_ksef_purchase_preview',{p_xml:xml}),
 allocationContext:number=>stockRpc('rs_ksef_allocation_context',{p_number:number}),
 findPurchases:project,
 assign:async({project:projectId,number,xml,entries,previous,replacement,projectRevision})=>{const result=await stockRpc('rs_allocate_ksef_purchase',{p_project:projectId,p_number:number,p_xml:xml,p_entries:entries,p_revision:projectRevision,p_expected_document:previous?.document??null,p_replace_purchase:replacement||null});await onChange(result.project);return result.link;},
 unassign:async({project:projectId,number,revision})=>{const result=await stockRpc('rs_unassign_ksef_purchase',{p_project:projectId,p_number:number,p_revision:revision});await onChange(result);return result;}
};}
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

// Completion never writes earnings. Adding earnings is a separate, idempotent RPC.
export const finishProject=project=>rpc('rs_finish_project',{p_id:project.id,p_revision:project.revision});
export const addProjectEarnings=(project,amount)=>rpc('rs_add_project_earnings',{p_id:project.id,p_revision:project.revision,p_amount:amount});
export const projectEarnings=id=>request('/rest/v1/cf_earnings?select=id,my_amount,work_date,source_robisie_project_id&source_robisie_project_id=eq.'+encodeURIComponent(id)).then(rows=>rows[0]||null);

export async function stageInvoices(id){
 const [bill,linked]=await Promise.all([request('/functions/v1/cleanfleet-bill',{method:'POST',body:JSON.stringify({action:'search',sourceApp:'robisie',sourceId:id})}),request('/rest/v1/rs_ksef_links?select=document&project_id=eq.'+encodeURIComponent(id))]);
 const rows=[...bill];for(const entry of linked){const row=entry.document;if(row.sourceReceipt)continue;if(!rows.some(x=>x.id===row.id||(x.ksef_number&&x.ksef_number===row.ksef_number)))rows.push(row);}return rows;
}

export const project=id=>request('/rest/v1/rs_projects?select=*&id=eq.'+encodeURIComponent(id)).then(rows=>rows[0]);

export const purchaseKsefLink=(number,id)=>request('/rest/v1/rs_ksef_links?select=*&ksef_number=eq.'+encodeURIComponent(number)+'&project_id=eq.'+encodeURIComponent(id)).then(rows=>{if(!rows[0])throw Error('Nie znaleziono przypisanej faktury. Odśwież inwestycję.');return rows[0];});
export const purchaseKsefAllocationContext=number=>rpc('rs_ksef_allocation_context',{p_number:number});
export const purchaseKsefLinks=id=>request('/rest/v1/rs_ksef_links?select=*&kind=eq.purchases&project_id=eq.'+encodeURIComponent(id));
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

export async function savePurchaseAllocation(project,payload,link,entries,xml){
 if(link.document.sourceReceipt)return stockRpc('rs_receipt_update_allocation',{p_project:project.id,p_number:link.ksef_number,p_entries:entries,p_revision:project.revision,p_expected_document:link.document,p_payload:payload});
 const args={p_project:project.id,p_number:link.ksef_number,p_xml:xml,p_entries:entries,p_revision:project.revision,p_expected_document:link.document,p_payload:payload};
 try{const result=await request('/rest/v1/rpc/rs_allocate_ksef_purchase',{method:'POST',body:JSON.stringify(args),timeoutMs:30000});return result.project;}
 catch(error){
  if(error.code==='RS_NETWORK_TIMEOUT'||error.name==='AbortError'||error.name==='TypeError'||/RS_CONFLICT/.test(error.message)){
   try{const rows=await request('/rest/v1/rs_projects?select=*&id=eq.'+encodeURIComponent(project.id));const row=rows[0],expected=structuredClone(payload);const actual=row?.payload.purchases?.find(x=>x.sourceKsefNumber===link.ksef_number),submitted=expected.purchases?.find(x=>x.sourceKsefNumber===link.ksef_number);if(actual&&submitted&&sameData(actual.selectedKsefQuantities,entries))submitted.description=actual.description;if(row&&row.revision>project.revision&&sameData(clean(row.payload),clean(expected)))return row;}catch{}
  }
  throw error;
 }
}

// Read-only owner-scoped summary; paginate both sources instead of truncating a year.
export async function earningsSummaryData(){
 const owner=session?.user?.id;if(!owner)throw Error('Zaloguj się ponownie.');
 async function pages(path){const rows=[];for(let offset=0;;offset+=500){if(session?.user?.id!==owner)throw Error('Sesja zmieniła się.');const page=await request(path+'&limit=500&offset='+offset);if(session?.user?.id!==owner)throw Error('Sesja zmieniła się.');rows.push(...page);if(page.length<500)return rows;}}
 const own=encodeURIComponent(owner),[projects,earnings]=await Promise.all([
  pages('/rest/v1/rs_projects?select=id,contract_number,payload&owner_id=eq.'+own+'&order=id.asc'),
  pages('/rest/v1/cf_earnings?select=id,source_robisie_project_id,work_date,total_amount,my_amount,employee_amount,employee_paid&created_by=eq.'+own+'&source_robisie_project_id=not.is.null&order=id.asc')
 ]);return {projects,earnings};
}

export const importProjectReceipt=({hash,data,entries,project,revision})=>stockRpc('rs_receipt_import_selected',{p_hash:hash,p_data:data,p_project:project,p_entries:entries,p_revision:revision});
