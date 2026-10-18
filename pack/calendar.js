import {client,administrator} from './auth.js?v=120';
let live=false,user=null;const db=client();window.cfSupabase=db;window.cfIsAdmin=()=>live;window.cfCompanies=[];window.cfCompanyDisplayName=c=>c?.short_name||c?.name||'Firma';
const send=(type,message)=>{if(parent!==window)parent.postMessage({type,message},location.origin);};
function deny(message){live=false;document.querySelector('.app').replaceChildren();document.getElementById('modalHost')?.replaceChildren();document.querySelectorAll('.cf-rem-range-bg').forEach(el=>el.remove());const info=document.createElement('p');info.className='gate-error';info.textContent=message;document.querySelector('.app').append(info);send('robisie-pack-denied',message);}
const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Nie udało się wczytać kalendarza. Odśwież zakładkę.'));document.head.append(s);});
try{
 user=await administrator(db);if(!user)throw Error('Zaloguj się w Robisię Pack jako administrator.');live=true;
 db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session&&session.user.id!==user.id)deny('Sesja administratora została zakończona.');});
 for(const src of ['/app/calendar-engine.js?v=20260917-4','/app/weather-engine.js?v=20260917-1','/app/reminder-form-v1251.js?v=20261004-15415','/pack/calendar-view.js?v=120','/app/calendar-touch-v1251.js?v=20260917-3','/app/calendar-reminder-edit-v1261.js?v=20260917-1','/app/calendar-ageing-dnd-v1270.js?v=20260917-2']){if(!live)break;await load(src);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&live)administrator(db).then(u=>{if(!u||u.id!==user.id)deny('Sesja została zakończona.');}).catch(e=>deny(e.message));});
}catch(error){deny(error.message);}
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='robisie-pack-activated'&&live)document.getElementById('refresh')?.click();});
window.addEventListener('pagehide',()=>{live=false;});
