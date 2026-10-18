import {client,administrator,modules,applications} from './auth.js?v=120';
import {mountTiles} from './tiles.js?v=113';
const $=id=>document.getElementById(id),db=client(),tabs=new Map();
let user=null,epoch=0,current='',frame=null,disposeTiles=null;
function renderTabs(){
 const focusedKey=document.activeElement?.dataset?.tabKey;
 $('openTabs').replaceChildren();$('workspaceTabs').hidden=!user;
 $('homeTab').setAttribute('aria-selected',String(!current));$('homeTab').tabIndex=current?-1:0;
 for(const [key,tab] of tabs){
  const item=document.createElement('div');item.className='workspace-tab'+(key===current?' active':'');item.setAttribute('role','presentation');
  const button=document.createElement('button');button.type='button';button.className='workspace-tab-select';button.textContent=tab.title;button.title=tab.title;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(key===current));button.setAttribute('aria-controls',tab.frame.id);button.tabIndex=key===current?0:-1;button.dataset.tabKey=key;button.onclick=()=>openTarget(tab.kind,tab.name);
  const close=document.createElement('button');close.type='button';close.className='workspace-tab-close';close.textContent='×';close.setAttribute('aria-label','Zamknij zakładkę '+tab.title);close.onclick=()=>closeTab(key);
  item.append(button,close);$('openTabs').append(item);
 }
 $('openTabs').querySelector('.workspace-tab.active')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 if(focusedKey)$('workspaceTabs').querySelector('[data-tab-key="'+focusedKey+'"]')?.focus();
}
function clearModule(){epoch++;for(const tab of tabs.values())tab.frame.remove();tabs.clear();frame=null;current='';$('frameHost').replaceChildren();$('workspace').hidden=true;$('dashboard').hidden=false;$('closeModule').hidden=true;$('moduleTitle').textContent='';renderTabs();}
function gate(message='Zaloguj się kontem administratora.'){user=null;disposeTiles?.();disposeTiles=null;clearModule();$('panel').hidden=true;$('login').hidden=false;$('loginForm').hidden=false;$('loginInfo').textContent=message;$('userEmail').textContent='';}
async function verify(){
 const checking=epoch,allowed=await administrator(db);if(checking!==epoch)return false;
 if(!allowed){gate();return false;}if(user&&user.id!==allowed.id)clearModule();
 if(!user||user.id!==allowed.id){disposeTiles?.();disposeTiles=mountTiles($('tiles'),allowed.id);}
 user=allowed;$('login').hidden=true;$('panel').hidden=false;$('userEmail').textContent=user.email||'';renderTabs();return true;
}
function locationFor(tab){return '/pack/?'+(tab.kind==='application'?'application=':'module=')+encodeURIComponent(tab.name);}
function activate(key,push=true){
 const tab=tabs.get(key);if(!tab||!user)return;current=key;frame=tab.frame;
 for(const [id,t] of tabs){t.frame.hidden=id!==key;t.frame.setAttribute('aria-hidden',String(id!==key));}
 $('dashboard').hidden=true;$('workspace').hidden=false;$('closeModule').hidden=true;$('moduleTitle').textContent=tab.title;$('moduleError').textContent='';renderTabs();
 const button=[...$('workspaceTabs').querySelectorAll('[data-tab-key]')].find(el=>el.dataset.tabKey===key);button?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 if(push)history.pushState(null,'',locationFor(tab));window.scrollTo({top:0,behavior:'auto'});
 tab.frame.contentWindow?.postMessage?.({type:'robisie-pack-activated'},location.origin);
}
async function openTarget(kind,name,push=true){
 const source=kind==='application'?applications:modules;if(!Object.hasOwn(source,name))return;
 try{if(!await verify())return;}catch(error){gate(error.message);return;}
 const key=(kind==='application'?'app:':'')+name;
 if(!tabs.has(key)){
  const target=document.createElement('iframe'),title=kind==='application'?applications[name].name:modules[name];
  target.id='pack-frame-'+key.replace(':','-');target.title=title;target.setAttribute('role','tabpanel');target.hidden=true;
  target.src=kind==='application'?applications[name].url:name==='calendar'?'/pack/calendar.html?v=120':'/pack/module.html?module='+name+'&v=120';
  target.setAttribute('allow',kind==='application'?'camera; microphone; geolocation; clipboard-write; web-share':'clipboard-write; web-share');target.onload=()=>fitFrame(target);
  tabs.set(key,{kind,name,title,frame:target});$('frameHost').append(target);
 }
 activate(key,push);
}
const openModule=(name,push=true)=>openTarget('module',name,push),openApplication=(name,push=true)=>openTarget('application',name,push);
function closeTab(key){
 const tab=tabs.get(key);if(!tab)return;const keys=[...tabs.keys()],index=keys.indexOf(key);tab.frame.remove();tabs.delete(key);
 if(current===key){const next=keys[index-1]||keys[index+1];if(next)activate(next);else home();}else renderTabs();
}
function fitFrame(target){
 try{
  const doc=target.contentDocument;if(!doc)return;
  doc.documentElement.classList.add('robisie-pack-frame');
  if(!doc.getElementById('robisiePackFrameStyle')){
   const link=doc.createElement('link');link.id='robisiePackFrameStyle';link.rel='stylesheet';link.href='/pack/frame.css?v=120';doc.head.append(link);
  }
  // Finance has its own same-origin private frame. Fit it once it exists and
  // after each navigation, without shrinking the outer content a second time.
  const fitChildren=()=>{for(const child of doc.querySelectorAll?.('iframe.cf-finance-frame')||[]){
   if(child.dataset.packFitted)continue;child.dataset.packFitted='1';
   child.addEventListener('load',()=>fitFrame(child));fitFrame(child);
  }};
  fitChildren();
  if(!doc.robisiePackLayoutBound){
   doc.robisiePackLayoutBound=true;
   const Observer=doc.defaultView?.MutationObserver;
   if(Observer)new Observer(fitChildren).observe(doc.documentElement,{childList:true,subtree:true});
   doc.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(a&&new URL(a.href,location.href).pathname==='/pack/'){event.preventDefault();home();}},true);
  }
 }catch(error){console.warn('Robisię Pack: nie udało się dopasować widoku aplikacji.',error);}
}
function home(push=true){
 current='';frame=null;for(const tab of tabs.values())tab.frame.hidden=true;
 $('workspace').hidden=true;$('dashboard').hidden=false;$('closeModule').hidden=true;$('moduleTitle').textContent='';renderTabs();
 if(push)history.pushState(null,'','/pack/');window.scrollTo({top:0,behavior:'auto'});
}
$('loginForm').onsubmit=async event=>{event.preventDefault();const button=$('signIn');button.disabled=true;$('loginError').textContent='';const password=$('password').value;$('password').value='';document.activeElement?.blur();try{const result=await db.auth.signInWithPassword({email:$('email').value.trim(),password});if(result.error)throw Error('Nieprawidłowy e-mail lub hasło.');if(await verify()){const url=new URL(location.href);if(url.searchParams.get('module'))await openModule(url.searchParams.get('module'));else if(url.searchParams.get('application'))await openApplication(url.searchParams.get('application'));}}catch(error){gate();$('loginError').textContent=error.message;}finally{button.disabled=false;}};
$('logout').onclick=async()=>{gate('Wylogowano.');const {error}=await db.auth.signOut();if(error)$('loginError').textContent='Nie udało się zakończyć sesji na serwerze. Spróbuj ponownie.';};
document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openApplication(b.dataset.app));$('closeModule').onclick=()=>home();$('homeTab').onclick=()=>home();$('homeLogo').onclick=event=>{event.preventDefault();home();};document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>openModule(b.dataset.module));
$('workspaceTabs').onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!event.target.matches('[role=tab]'))return;event.preventDefault();const items=[$('homeTab'),...$('workspaceTabs').querySelectorAll('[data-tab-key]')],index=items.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:items.length-1))%items.length;const button=items[next],key=button.dataset.tabKey;if(key){activate(key);$('workspaceTabs').querySelector('[data-tab-key="'+key+'"]')?.focus();}else{home();$('homeTab').focus();}};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||!user)return;const entry=[...tabs.entries()].find(([,t])=>event.source===t.frame.contentWindow);if(!entry)return;
 if(event.data?.type==='robisie-pack-close')closeTab(entry[0]);
 if(event.data?.type==='robisie-pack-home')home();
 if(event.data?.type==='robisie-pack-open'&&Object.hasOwn(modules,event.data.module))openModule(event.data.module);
 if(event.data?.type==='robisie-pack-denied')gate(event.data.message||'Brak dostępu.');
});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||user&&session&&session.user.id!==user.id)gate('Sesja została zakończona. Zaloguj się ponownie.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)verify().catch(error=>gate(error.message));});
window.addEventListener('pagehide',()=>{disposeTiles?.();clearModule();});
window.addEventListener('resize',()=>{$('openTabs').querySelector('.workspace-tab.active')?.scrollIntoView?.({block:'nearest',inline:'nearest'});});
window.addEventListener('popstate',()=>{const url=new URL(location.href),module=url.searchParams.get('module'),app=url.searchParams.get('application');if(module)openModule(module,false);else if(app)openApplication(app,false);else home(false);});
try{if(await verify()){const url=new URL(location.href),module=url.searchParams.get('module'),app=url.searchParams.get('application');if(module)await openModule(module);else if(app)await openApplication(app);}}catch(error){gate(error.message);}
