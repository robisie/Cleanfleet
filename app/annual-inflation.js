// Shared GUS proposal UI. Prices change only inside the transactional decision RPC.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percentLabel=v=>Number(v).toLocaleString('pl-PL',{maximumFractionDigits:2});
const money=v=>Number(v).toLocaleString('pl-PL',{style:'currency',currency:'PLN'});
export function isDue(context,now=Date.now()) {const d=context?.decision;return !!d&&d.status==='pending'&&new Date(d.remind_at).getTime()<=now;}
export function inflationTiming(context,now=Date.now()){
 const date=new Date(now),year=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Warsaw',year:'numeric'}).format(date));
 const report=context?.report,target=Math.max(2026,year-1,Number(report?.year||2025)+1);
 const nextCheck=new Date(date);nextCheck.setUTCMinutes(10,0,0);if(nextCheck.getTime()<=date.getTime())nextCheck.setUTCHours(nextCheck.getUTCHours()+1);
 return {targetYear:target,publicationYear:target+1,fetchedAt:report?.fetched_at||null,nextCheck:year>=target+1?nextCheck.toISOString():null};
}
function timingMarkup(context){
 const t=inflationTiming(context),format=value=>new Date(value).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw',dateStyle:'short',timeStyle:'short'});
 return `<div class="gus-inflation-timing"><p>${t.fetchedAt?`Dane za ${esc(context.report.year)} pobrano: <strong>${esc(format(t.fetchedAt))}</strong>.<br>`:''}Kolejne dane: <strong>inflacja za ${t.targetYear} rok</strong>.<br>Przewidywana publikacja GUS: <strong>styczeń ${t.publicationYear}</strong>. Dokładny dzień zależy od GUS.</p><p>${t.nextCheck?`Najbliższe zaplanowane sprawdzenie dostępności: <strong>${esc(format(t.nextCheck))}</strong>.`:`Sprawdzanie nowych danych rozpocznie się <strong>1 stycznia ${t.publicationYear}</strong>.`} W okresie oczekiwania system sprawdza GUS co godzinę. Dane zostaną pobrane po udostępnieniu, podczas najbliższego udanego sprawdzenia. Godziny podano według czasu polskiego.</p></div>`;
}
export function createInflationController({app,rpc,owner,before=async()=>{},buildPayload=()=>null,onApplied=async()=>{}}){
 let state=null,currentOwner=null,prompted='',dialog=null,working=false,loading=false;
 const hosts=new Set();
 function reset(){state=null;prompted='';dialog?.remove();dialog=null;paint();}
 function paint(){for(const host of hosts){if(!host.isConnected){hosts.delete(host);continue;}const r=state?.report,d=state?.decision;
  host.innerHTML=!r?'<p>Coroczna korekta GUS: oczekiwanie na publikację danych za poprzedni rok.</p>':`<p><strong>Średnioroczna inflacja GUS za ${r.year}: ${esc(percentLabel(r.percent))}%</strong></p><p>${({pending:new Date(d.remind_at)>new Date()?'Przypomnienie: '+new Date(d.remind_at).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw'}):'Cennik wymaga Twojej decyzji.',applied:'Korekta została zastosowana.',rejected:'Pozostawiono dotychczasowe ceny.',undone:'Korekta została cofnięta.'})[d.status]}</p>${d.status==='pending'&&Number(r.percent)>0?`<button type="button" class="btn btn-solid" data-gus-apply>Zastosuj podwyżkę o ${esc(percentLabel(r.percent))}%</button>`:''} <button type="button" class="btn btn-outline" data-gus-open>${d.status==='pending'?'Sprawdź i zastosuj korektę':'Zobacz decyzję'}</button>`;
  host.insertAdjacentHTML('beforeend',timingMarkup(state));
  const shown=structuredClone(state);host.querySelector('[data-gus-apply]')?.addEventListener('click',()=>applyDirect(shown).catch(showError));
  host.querySelector('[data-gus-open]')?.addEventListener('click',()=>open().catch(showError));}}
 async function applyDirect(shown){
  if(working||!owner())return;const id=owner();working=true;
  try{await before();if(owner()!==id)return;
   const result=await rpc('cf_inflation_decide',{p_app:app,p_year:shown.report.year,p_action:'apply',p_revision:shown.settings?.revision??null,p_payload:app==='robisie'?buildPayload(shown.settings.payload,Number(shown.report.percent),shown.report.year):null,p_catalog:app==='cleanfleet'?shown.catalog:null});
   if(owner()!==id)return;
   if(result.alreadyDecided)throw Error('Decyzja została już zapisana. Odświeżono stan propozycji.');
   state=result;paint();await onApplied();
  }finally{working=false;await refresh(false);}
 }
 function showError(e){if(dialog)dialog.querySelector('[data-gus-error]').textContent=e.message;else globalThis.alert?.('Korekta GUS: '+e.message);}
 async function refresh(prompt=true){
  const id=owner();if(id!==currentOwner){reset();currentOwner=id;}if(!id||loading||working)return;
  loading=true;try{const data=await rpc('cf_inflation_context',{p_app:app});if(owner()!==id)return;state=data;paint();
   const key=state.report?.year+':'+state.decision?.remind_at;
   if(prompt&&isDue(state)&&prompted!==key&&![...document.querySelectorAll('dialog[open],.overlay')].some(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')){prompted=key;await open();}
  }catch(e){console.warn('GUS proposal:',e.message);}finally{loading=false;}
 }
 async function open(){
  if(working||dialog||!owner())return;await before();const id=owner();const data=await rpc('cf_inflation_context',{p_app:app});if(id!==owner())return;state=data;const snapshot=data;paint();if(!snapshot.report)return;
  const {report:r,decision:d}=state,percent=Number(r.percent),source=new URL(r.source_url);if(source.protocol!=='https:'||source.hostname!=='stat.gov.pl')throw Error('Nieprawidłowe źródło GUS.');
  const items=app==='robisie'?state.settings?.payload?.catalog||[]:state.catalog||[];
  const changes=d.status==='applied'&&d.changes?d.changes:items.map(x=>({name:x.name,before:app==='robisie'?x.base:x.price,after:Math.round((Number(app==='robisie'?x.base:x.price)*(1+percent/100)+Number.EPSILON)*100)/100}));
  dialog=document.createElement('dialog');dialog.className='gus-inflation-dialog';dialog.style.cssText='width:min(780px,94vw);max-height:88dvh;overflow:auto;border:1px solid #aaa;border-radius:16px;padding:24px;color:#222;background:#fff;z-index:30000;font:16px system-ui';
  dialog.innerHTML=`<h2>${app==='robisie'?'Robisię':'CleanFleet'} — korekta cennika GUS</h2><p>Średnioroczna inflacja za ${r.year}: <strong>${esc(percentLabel(percent))}%</strong>. ${percent>0?'Proponowana podwyżka: '+esc(percentLabel(percent))+'%.':'Brak dodatniej inflacji. Ceny pozostają bez zmian.'}</p>${timingMarkup(snapshot)}<p><a href="${esc(source.href)}" target="_blank" rel="noopener">Źródło: GUS</a></p><p>${app==='robisie'?'Zmiana dotyczy cen bazowych dla nowych inwestycji. Domyślne podwyższenie pozostaje bez zmian.':'Zmiana dotyczy cennika usług dla nowych wykonań.'} Zapisane wyceny i rozliczenia zachowują swoje kwoty.</p>${percent>0?`<details><summary>Podgląd cen (${changes.length})</summary><table style="width:100%;text-align:left"><thead><tr><th>Usługa</th><th>Przed</th><th>Po</th></tr></thead><tbody>${changes.map(x=>`<tr><td>${esc(x.name)}</td><td>${money(x.before)}</td><td>${money(x.after)}</td></tr>`).join('')}</tbody></table></details>`:''}<p role="alert" data-gus-error></p><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:20px">${d.status==='pending'?`${percent>0?'<button type="button" data-gus-action="apply">OK, wprowadź zmiany</button>':''}<button type="button" data-gus-action="reject">Nie wprowadzaj zmian</button><button type="button" data-gus-action="snooze">Powiadom mnie za 3 dni</button>`:`<p>${d.status==='applied'?'Korekta została zastosowana.':d.status==='undone'?'Korekta została cofnięta.':'Pozostawiono dotychczasowe ceny.'}</p>${app==='cleanfleet'&&d.status==='applied'?'<button type="button" data-gus-action="undo">Cofnij korektę</button>':''}`}<button type="button" data-gus-close>Zamknij</button></div>`;
  const close=()=>{if(working)return;dialog?.close();dialog?.remove();dialog=null;};dialog.querySelector('[data-gus-close]').onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
  for(const button of dialog.querySelectorAll('[data-gus-action]'))button.onclick=async()=>{
   if(working||owner()!==id)return;working=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const action=button.dataset.gusAction;const result=await rpc('cf_inflation_decide',{p_app:app,p_year:r.year,p_action:action,p_revision:snapshot.settings?.revision??null,p_payload:action==='apply'&&app==='robisie'?buildPayload(snapshot.settings.payload,percent,r.year):null,p_catalog:action==='apply'&&app==='cleanfleet'?snapshot.catalog:null});
    if(owner()!==id){working=false;reset();return;}
    if(result.alreadyDecided){throw Error('Decyzję zapisano już na innym urządzeniu. Zamknij i otwórz propozycję ponownie.');}
    state=result;working=false;close();paint();if(['apply','undo'].includes(action))await onApplied();
   }catch(e){working=false;showError(e);dialog?.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  document.body.append(dialog);dialog.showModal();
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 setInterval(()=>{if(!document.hidden)void refresh();},60000);
 return {refresh,open,mount(host){if(host){hosts.add(host);paint();}}};
}
