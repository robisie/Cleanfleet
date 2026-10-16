import {client,administrator,modules,applications} from './auth.js?v=110';
import {mountTiles} from './tiles.js?v=112';
const $=id=>document.getElementById(id),db=client();let user=null,epoch=0,current='',frame=null,disposeTiles=null;
function clearModule(){epoch++;frame?.remove();frame=null;current='';$('frameHost').replaceChildren();$('workspace').hidden=true;$('dashboard').hidden=false;$('closeModule').hidden=true;$('moduleTitle').textContent='';document.querySelectorAll('[data-module]').forEach(b=>b.classList.remove('selected'));document.querySelectorAll('[data-home]').forEach(b=>b.classList.add('selected'));}
function gate(message='Zaloguj się kontem administratora.'){user=null;disposeTiles?.();disposeTiles=null;clearModule();$('panel').hidden=true;$('login').hidden=false;$('loginForm').hidden=false;$('loginInfo').textContent=message;$('userEmail').textContent='';}
async function verify(){const allowed=await administrator(db);if(!allowed){gate();return false;}if(user&&user.id!==allowed.id)clearModule();if(!user||user.id!==allowed.id){disposeTiles?.();disposeTiles=mountTiles($('tiles'),allowed.id);}user=allowed;$('login').hidden=true;$('panel').hidden=false;$('userEmail').textContent=user.email||'';return true;}
async function openModule(name,push=true){
 if(!Object.hasOwn(modules,name))return;if(current===name&&frame)return;
 try{if(!await verify())return;}catch(error){gate(error.message);return;}
 clearModule();document.querySelectorAll('[data-home]').forEach(b=>b.classList.remove('selected'));current=name;$('dashboard').hidden=true;$('workspace').hidden=false;$('closeModule').hidden=false;$('moduleTitle').textContent=modules[name];$('moduleError').textContent='';
 frame=document.createElement('iframe');frame.title=modules[name];frame.src='/pack/module.html?module='+name+'&v=110';frame.setAttribute('allow','clipboard-write; web-share');$('frameHost').append(frame);
 document.querySelectorAll('[data-module]').forEach(b=>b.classList.toggle('selected',b.dataset.module===name));
 const url=new URL(location.href);url.searchParams.delete('application');url.searchParams.set('module',name);if(push)history.pushState(null,'',url);window.scrollTo({top:0,behavior:'auto'});
}
async function openApplication(name,push=true){
 if(!Object.hasOwn(applications,name))return;try{if(!await verify())return;}catch(error){gate(error.message);return;}
 clearModule();current='app:'+name;$('dashboard').hidden=true;$('workspace').hidden=false;$('closeModule').hidden=false;$('moduleTitle').textContent=applications[name].name;$('moduleError').textContent='';
 frame=document.createElement('iframe');frame.title=applications[name].name;frame.src=applications[name].url;frame.setAttribute('allow','camera; microphone; geolocation; clipboard-write; web-share');
 frame.onload=()=>{try{frame.contentDocument.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(a&&new URL(a.href,location.href).pathname==='/pack/'){event.preventDefault();home();}},true);}catch{}};
 $('frameHost').append(frame);const url=new URL(location.href);url.searchParams.delete('module');url.searchParams.set('application',name);if(push)history.pushState(null,'',url);window.scrollTo({top:0,behavior:'auto'});
}
function home(){clearModule();history.replaceState(null,'','/pack/');}
$('loginForm').onsubmit=async event=>{event.preventDefault();const button=$('signIn');button.disabled=true;$('loginError').textContent='';const password=$('password').value;$('password').value='';document.activeElement?.blur();try{const result=await db.auth.signInWithPassword({email:$('email').value.trim(),password});if(result.error)throw Error('Nieprawidłowy e-mail lub hasło.');if(await verify()){const module=new URL(location.href).searchParams.get('module');if(module)await openModule(module);else{const app=new URL(location.href).searchParams.get('application');if(app)await openApplication(app);}}}catch(error){gate();$('loginError').textContent=error.message;}finally{button.disabled=false;}};
$('logout').onclick=async()=>{gate('Wylogowano.');const {error}=await db.auth.signOut();if(error)$('loginError').textContent='Nie udało się zakończyć sesji na serwerze. Spróbuj ponownie.';};
document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openApplication(b.dataset.app));$('closeModule').onclick=home;document.querySelectorAll('[data-home]').forEach(b=>b.onclick=home);document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>openModule(b.dataset.module));
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;if(event.data?.type==='robisie-pack-close')home();if(event.data?.type==='robisie-pack-denied')gate(event.data.message||'Brak dostępu.');});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||user&&session&&session.user.id!==user.id)gate('Sesja została zakończona. Zaloguj się ponownie.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)verify().catch(error=>gate(error.message));});
window.addEventListener('pagehide',()=>{disposeTiles?.();clearModule();});
window.addEventListener('popstate',()=>{const url=new URL(location.href),module=url.searchParams.get('module'),app=url.searchParams.get('application');if(module)openModule(module,false);else if(app)openApplication(app,false);else clearModule();});
try{if(await verify()){const module=new URL(location.href).searchParams.get('module');if(module)await openModule(module);else{const app=new URL(location.href).searchParams.get('application');if(app)await openApplication(app);}}}catch(error){gate(error.message);}
