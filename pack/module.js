import {client,administrator,modules,URL as apiURL,KEY} from './auth.js?v=120';
const name=new URL(location.href).searchParams.get('module');let live=false,user=null,observer;
window.RobisiePack=true;
window.CF_SUPABASE_URL=apiURL;window.CF_SUPABASE_KEY=KEY;window.cfSupabase=client();
window.cfIsAdmin=()=>live;window.cfCompanies=[];window.cfCompanyDisplayName=c=>c?.short_name||c?.name||'Firma';
window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.showToast=text=>{const el=document.getElementById('toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000);};
window.cfBackupBridge={isAdmin:()=>live,getClient:()=>window.cfSupabase,toast:window.showToast};
window.cfRefreshExchangeRate=async(required=true)=>{try{const {data,error}=await window.cfSupabase.functions.invoke('cleanfleet-exchange-rate',{body:{}});if(error||!data?.ok)throw Error('Nie udało się pobrać kursu mBanku.');window.CFExchange.set(data);return data;}catch(error){if(required)throw error;return null;}};
const send=(type,extra={})=>{if(parent!==window)parent.postMessage({type,...extra},location.origin);};
const close=()=>{live=false;window.CFFinance?.close();window.cfFinanceEarningsBridge?.lock();window.CFAccountingMail?.reset();document.getElementById('modalRoot').replaceChildren();send('robisie-pack-close');};
function deny(message){live=false;observer?.disconnect();window.CFFinance?.close();window.CFAccountingMail?.reset();document.getElementById('modalRoot').replaceChildren();const status=document.getElementById('moduleStatus');status.hidden=false;status.textContent=message;send('robisie-pack-denied',{message});}
function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('Nie udało się wczytać modułu. Odśwież Robisię Pack.'));document.head.append(script);});}
const scripts={
 reminders:['/pack/reminders.js?v=123','/app/reminder-fix.js?v=120','/app/reminder-batch.js?v=1','/app/reminder-form-v1251.js?v=20261025-1'],
 finances:['/app/vendor/xlsx-0.18.5.full.min.js','/app/period-picker.js?v=1532','/app/exchange-rate.js?v=1531','/pack/aga.js?v=20261025-4','/pack/earnings.js?v=106','/app/dojazdy.js?v=20261025-1','/app/finances.js?v=20261101-4'],
 taxes:['/app/taxes-v1310.js?v=20260918-6'],
 website:['/app/period-picker.js?v=1532','/pack/website-stats.js?v=100'],
 documents:['/app/vendor/jszip-3.10.1.min.js','/app/vendor/jspdf-2.5.1.umd.min.js','/app/vendor/jspdf-autotable-3.8.2.min.js','/app/mbank-mt940.js?v=20261002-1520','/app/pdf-unlock.js?v=20261006-15424','/app/mail-documents.js?v=20261024-1','/app/ksef-preview.js?v=20261006-15427','/app/ksef-pdf.js?v=20261006-15425','/app/accounting-package.js?v=20261024-1','/app/accounting-history.js?v=20261006-15425','/app/accounting-decisions.js?v=20261002-15123','/app/accounting-reconcile.js?v=20261002-15123','/app/accounting-documents-v1510.js?v=20261024-1']
};
try{
 if(!Object.hasOwn(modules,name))throw Error('Nie znaleziono modułu.');
 user=await administrator(window.cfSupabase);if(!user)throw Error('Zaloguj się w Robisię Pack.');live=true;
 window.cfSupabase.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session&&session.user.id!==user.id)deny('Sesja administratora została zakończona.');});
 for(const src of scripts[name]){if(!live)break;await load(src);}if(!live)throw Error('Sesja została zakończona.');
 document.getElementById('moduleStatus').hidden=true;
 if(name==='reminders'){const result=await window.cfSupabase.rpc('cf_admin_companies_list');if(result.error)throw result.error;window.cfCompanies=result.data||[];await window.cfShowReminders();}
 if(name==='finances')window.CFFinance.open();
 if(name==='taxes')await window.cfShowTaxes();
 if(name==='website')window.cfOpenWebsiteStatsPanel();
 if(name==='documents')window.CFAccountingDocuments.open();
 const selectors={reminders:'#cfRemindersOverlay',finances:'#cfFinanceWindow',taxes:'#cfTaxesOverlay',website:'#cfWebsiteStatsOverlay',documents:'#cfAccountingDocsOverlay.cf-open'};
 observer=new MutationObserver(()=>{if(live&&!document.querySelector(selectors[name]))close();});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&live)administrator(window.cfSupabase).then(allowed=>{if(!allowed||allowed.id!==user.id)deny('Sesja została zakończona.');}).catch(error=>deny(error.message));});
}catch(error){deny(error.message);}
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='robisie-pack-activated'&&live){if(name==='reminders')window.cfRefreshPackReminders?.().catch(error=>window.showToast(error.message));if(name==='finances')void window.CFFinance?.refresh?.();}});
window.addEventListener('pagehide',event=>{if(event.persisted)return;live=false;observer?.disconnect();window.CFFinance?.lock();window.CFAccountingMail?.reset();});

window.addEventListener('pageshow',event=>{if(event.persisted&&live){document.body.style.visibility='hidden';administrator(window.cfSupabase).then(allowed=>{if(!allowed||allowed.id!==user.id)deny('Sesja została zakończona.');}).catch(error=>deny(error.message)).finally(()=>{document.body.style.visibility='';});}});
