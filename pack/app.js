import {client,administrator,modules,applications} from './auth.js?v=120';
import {mountTiles} from './tiles.js?v=113';
const $=id=>document.getElementById(id),db=client(),tabs=new Map();
let user=null,epoch=0,current='',frame=null,disposeTiles=null,leaving=false;
const returnTabs=new Map();
const workspaceKey='robisie-pack-workspace-v1';
function saveWorkspace(){if(!user)return;try{sessionStorage.setItem(workspaceKey,JSON.stringify({version:1,userId:user.id,active:current,tabs:[...tabs.values()].map(({kind,name})=>({kind,name}))}));}catch(_){}}
function forgetWorkspace(){try{sessionStorage.removeItem(workspaceKey);}catch(_){}}
function restoreWorkspace(){
 try{const raw=sessionStorage.getItem(workspaceKey);if(!raw||raw.length>10000)return null;const saved=JSON.parse(raw);if(saved.version!==1||saved.userId!==user?.id||!Array.isArray(saved.tabs)){forgetWorkspace();return null;}
  for(const t of saved.tabs.slice(0,9)){if(!t||!['application','module'].includes(t.kind))continue;const registry=t.kind==='application'?applications:modules;if(Object.hasOwn(registry,t.name))ensureTab(t.kind,t.name);}
  return typeof saved.active==='string'&&tabs.has(saved.active)?saved.active:'';
 }catch(_){forgetWorkspace();return null;}
}
function orderedTabKeys(){return [...Object.keys(applications).map(name=>'app:'+name).filter(key=>tabs.has(key)),...[...tabs.keys()].filter(key=>!key.startsWith('app:'))];}
function renderTabs(){
 const focusedKey=document.activeElement?.dataset?.tabKey;
 $('openTabs').replaceChildren();$('workspaceTabs').hidden=!user;
 $('homeTab').setAttribute('aria-selected',String(!current));$('homeTab').tabIndex=current?-1:0;
 const slots=[...Object.entries(applications).map(([name,app])=>['app:'+name,tabs.get('app:'+name)||{kind:'application',name,title:app.name,frame:null}]),...[...tabs.entries()].filter(([,tab])=>tab.kind==='module')];
 for(const [key,tab] of slots){
  const item=document.createElement('div');item.className='workspace-tab'+(key===current?' active':'')+(tab.frame?'':' unopened');item.dataset.kind=tab.kind;item.setAttribute('role','presentation');
  const state=tab.frame?(key===current?'active':'background'):'closed',status=state==='active'?'Aktywna':state==='background'?'W tle':'Zamknięta';item.dataset.state=state;
  const button=document.createElement('button');button.type='button';button.className='workspace-tab-select';button.title=tab.title+' — '+status;button.setAttribute('aria-label',button.title);
  const name=document.createElement('span');name.className='workspace-tab-name';name.textContent=tab.title;
  const marker=document.createElement('small');marker.className='workspace-tab-status';marker.setAttribute('aria-hidden','true');button.append(name,marker);button.setAttribute('role','tab');button.setAttribute('aria-selected',String(key===current));if(tab.frame)button.setAttribute('aria-controls',tab.frame.id);button.tabIndex=key===current?0:-1;button.dataset.tabKey=key;button.onclick=()=>openTarget(tab.kind,tab.name);
  const close=document.createElement('button');close.type='button';close.className='workspace-tab-close';close.textContent='×';close.setAttribute('aria-label','Zamknij zakładkę '+tab.title);close.onclick=()=>closeTab(key);
  item.append(button);if(tab.frame)item.append(close);$('openTabs').append(item);
 }
 $('openTabs').querySelector('.workspace-tab.active')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 if(focusedKey)$('workspaceTabs').querySelector('[data-tab-key="'+focusedKey+'"]')?.focus();
}
function clearModule(){forgetWorkspace();epoch++;for(const tab of tabs.values())tab.frame.remove();tabs.clear();returnTabs.clear();frame=null;current='';$('frameHost').replaceChildren();$('workspace').hidden=true;$('dashboard').hidden=false;$('closeModule').hidden=true;$('backContext').hidden=true;$('moduleTitle').textContent='';renderTabs();}
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
 const source=tabs.get(returnTabs.get(key));$('backContext').hidden=!source;if(source)$('backContext').textContent='← Wróć do '+source.title;
 const button=[...$('workspaceTabs').querySelectorAll('[data-tab-key]')].find(el=>el.dataset.tabKey===key);button?.scrollIntoView?.({block:'nearest',inline:'nearest'});
 if(push)history.pushState(null,'',locationFor(tab));window.scrollTo({top:0,behavior:'auto'});
 tab.frame.contentWindow?.postMessage?.({type:'robisie-pack-activated'},location.origin);saveWorkspace();
}
function ensureTab(kind,name){
 const key=(kind==='application'?'app:':'')+name;
 if(!tabs.has(key)){
  const target=document.createElement('iframe'),title=kind==='application'?applications[name].name:modules[name];
  target.id='pack-frame-'+key.replace(':','-');target.title=title;target.setAttribute('role','tabpanel');target.hidden=true;
  target.src=kind==='application'?applications[name].url:name==='calendar'?'/pack/calendar.html?v=123':'/pack/module.html?module='+name+'&v=142';
  target.setAttribute('allow',kind==='application'?'camera; microphone; geolocation; clipboard-write; web-share':'clipboard-write; web-share');target.onload=()=>fitFrame(target);
  tabs.set(key,{kind,name,title,frame:target});$('frameHost').append(target);
 }
 return key;
}
async function openTarget(kind,name,push=true){
 const source=kind==='application'?applications:modules;if(!Object.hasOwn(source,name))return;
 try{if(!await verify())return;}catch(error){gate(error.message);return;}
 activate(ensureTab(kind,name),push);
}
const openModule=(name,push=true)=>openTarget('module',name,push),openApplication=(name,push=true)=>openTarget('application',name,push);
function closeTab(key){
 const tab=tabs.get(key);if(!tab)return;const keys=orderedTabKeys(),index=keys.indexOf(key);tab.frame.remove();tabs.delete(key);returnTabs.delete(key);for(const [destination,source] of returnTabs)if(source===key)returnTabs.delete(destination);
 if(current===key){const next=keys[index-1]||keys[index+1];if(next)activate(next);else home();}else{renderTabs();saveWorkspace();}
}
function fitFrame(target){
 try{
  const doc=target.contentDocument;if(!doc)return;
  doc.documentElement.classList.add('robisie-pack-frame');
  doc.documentElement.classList.toggle('pack-robisie-wide',doc.location.pathname.startsWith('/app/robisie/'));
  if(!doc.getElementById('robisiePackFrameStyle')){
   const link=doc.createElement('link');link.id='robisiePackFrameStyle';link.rel='stylesheet';link.href='/pack/frame.css?v=125';doc.head.append(link);
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
   doc.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a||a.hasAttribute('download')||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const url=new URL(a.href,doc.location.href);if(url.origin!==location.origin)return;if(url.pathname==='/pack/'){event.preventDefault();const destination=url.searchParams.get('module');if(destination&&Object.hasOwn(modules,destination)){const source=current;void openModule(destination).then(()=>{if(source&&source!==current){returnTabs.set(current,source);activate(current,false);}});}else home();}else if(applicationFor(url)&&a.dataset.action!=='stage-invoice'){event.preventDefault();event.stopImmediatePropagation();void openApplicationLink(url);}},true);
  }
 }catch(error){console.warn('Robisię Pack: nie udało się dopasować widoku aplikacji.',error);}
}
function applicationFor(url){if(url.origin!==location.origin)return '';return {'/bill/':'bill','/bill/index.html':'bill','/app/robisie/':'robisie','/app/robisie/index.html':'robisie','/app/':'cleanfleet','/app/index.html':'cleanfleet'}[url.pathname]||'';}
async function openApplicationLink(url){
 const name=applicationFor(url);if(!name)return;
 const source=current,key='app:'+name,existing=tabs.get(key);
 if(!existing){ensureTab('application',name);tabs.get(key).frame.src=url.href;}
 if(source&&source!==key){if(returnTabs.get(source)===key)returnTabs.delete(source);returnTabs.set(key,source);}
 activate(key);
 if(existing&&name!=='cleanfleet')existing.frame.contentWindow?.postMessage({type:'robisie-pack-navigate',url:url.href},location.origin);
}
function home(push=true){
 current='';frame=null;for(const tab of tabs.values())tab.frame.hidden=true;
 $('workspace').hidden=true;$('dashboard').hidden=false;$('closeModule').hidden=true;$('moduleTitle').textContent='';renderTabs();
 $('backContext').hidden=true;
 if(push)history.pushState(null,'','/pack/');window.scrollTo({top:0,behavior:'auto'});saveWorkspace();
}
$('loginForm').onsubmit=async event=>{event.preventDefault();const button=$('signIn');button.disabled=true;$('loginError').textContent='';const password=$('password').value;$('password').value='';document.activeElement?.blur();try{const result=await db.auth.signInWithPassword({email:$('email').value.trim(),password});if(result.error)throw Error('Nieprawidłowy e-mail lub hasło.');if(await verify()){const url=new URL(location.href);if(url.searchParams.get('module'))await openModule(url.searchParams.get('module'));else if(url.searchParams.get('application'))await openApplication(url.searchParams.get('application'));}}catch(error){gate();$('loginError').textContent=error.message;}finally{button.disabled=false;}};
$('backContext').onclick=()=>{const source=returnTabs.get(current);if(source&&tabs.has(source)){returnTabs.delete(current);if(returnTabs.get(source)===current)returnTabs.delete(source);activate(source);}};
$('logout').onclick=async()=>{gate('Wylogowano.');const {error}=await db.auth.signOut();if(error)$('loginError').textContent='Nie udało się zakończyć sesji na serwerze. Spróbuj ponownie.';};
document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openApplication(b.dataset.app));$('closeModule').onclick=()=>home();$('homeTab').onclick=()=>home();$('homeLogo').onclick=event=>{event.preventDefault();home();};document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>openModule(b.dataset.module));
$('workspaceTabs').onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!event.target.matches('[role=tab]'))return;event.preventDefault();const items=[$('homeTab'),...$('workspaceTabs').querySelectorAll('[data-tab-key]')],index=items.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowRight'?1:items.length-1))%items.length;const button=items[next],key=button.dataset.tabKey;if(key){const focus=()=>$('workspaceTabs').querySelector('[data-tab-key="'+key+'"]')?.focus();if(tabs.has(key)){activate(key);focus();}else void openApplication(key.slice(4)).then(focus);}else{home();$('homeTab').focus();}};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||!user||leaving)return;const entry=[...tabs.entries()].find(([,t])=>event.source===t.frame.contentWindow);if(!entry)return;
 if(event.data?.type==='robisie-pack-open-url'){try{const url=new URL(event.data.url,location.href);if(applicationFor(url))void openApplicationLink(url);}catch{}}
 if(event.data?.type==='robisie-pack-close')closeTab(entry[0]);
 if(event.data?.type==='robisie-pack-home')home();
 if(event.data?.type==='robisie-pack-open'&&Object.hasOwn(modules,event.data.module))openModule(event.data.module);
 if(event.data?.type==='robisie-pack-denied')gate(event.data.message||'Brak dostępu.');
});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||user&&session&&session.user.id!==user.id)gate('Sesja została zakończona. Zaloguj się ponownie.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)verify().catch(error=>gate(error.message));});
window.addEventListener('pagehide',()=>{saveWorkspace();leaving=true;});
window.addEventListener('pageshow',event=>{leaving=false;if(event.persisted&&user){$('panel').hidden=true;verify().catch(error=>gate(error.message));}});
window.addEventListener('resize',()=>{$('openTabs').querySelector('.workspace-tab.active')?.scrollIntoView?.({block:'nearest',inline:'nearest'});});
window.addEventListener('popstate',()=>{const url=new URL(location.href),module=url.searchParams.get('module'),app=url.searchParams.get('application');if(module)openModule(module,false);else if(app)openApplication(app,false);else home(false);});
try{if(await verify()){const restored=restoreWorkspace(),url=new URL(location.href),module=url.searchParams.get('module'),app=url.searchParams.get('application');if(module&&Object.hasOwn(modules,module))activate(ensureTab('module',module),false);else if(app&&Object.hasOwn(applications,app))activate(ensureTab('application',app),false);else if(restored)activate(restored,false);else home(false);}}catch(error){gate(error.message);}
