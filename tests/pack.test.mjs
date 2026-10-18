import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {administrator,modules,applications} from '../pack/auth.js';
const root=new URL('../',import.meta.url),read=path=>fs.readFileSync(new URL(path,root),'utf8');
test('Pack authorizes only a server-verified admin, never a stored role claim',async()=>{
 let rpcCalls=0;const db=(user,role,error=null)=>({auth:{getUser:async()=>({data:{user},error})},rpc:async()=>{rpcCalls++;return {data:role};}});
 assert.equal(await administrator(db(null,true)),null);assert.equal(rpcCalls,0);
 await assert.rejects(administrator(db({id:'employee',user_metadata:{role:'admin'}},false)),/tylko dla administratora/);
 assert.equal((await administrator(db({id:'admin'},true))).id,'admin');assert.equal(await administrator(db({id:'admin'},true,new Error('expired'))),null);
});
function element(){return {hidden:false,value:'',textContent:'',innerHTML:'',dataset:{},children:[],classList:{add(){},remove(){},toggle(){}},append(...els){this.children.push(...els);},replaceChildren(){this.children=[];},setAttribute(){},remove(){this.removed=true;},contentWindow:{},querySelectorAll:()=>[],querySelector:()=>null};}
async function panel({allowed=true,userExists=true,query=''}={}){
 const ids=Object.fromEntries(['login','panel','workspace','dashboard','frameHost','moduleTitle','moduleError','loginForm','loginInfo','loginError','userEmail','signIn','email','password','logout','closeModule','tiles','openTabs','workspaceTabs','homeTab','homeLogo'].map(k=>[k,element()])),events={};let authCallback;
 const db={auth:{getUser:async()=>({data:{user:userExists?{id:'u',email:'test@example.invalid'}:null}}),onAuthStateChange:fn=>authCallback=fn,signOut:async()=>({}),signInWithPassword:async()=>({})},rpc:async()=>({data:allowed})};
 const location={href:'https://cleanfleet.pl/pack/'+query,origin:'https://cleanfleet.pl'},window={addEventListener:(name,fn)=>events[name]=fn,scrollTo(){}};
 const c=vm.createContext({document:{getElementById:id=>ids[id],querySelectorAll:()=>[],createElement:()=>element(),addEventListener(){}},client:()=>db,administrator,modules,applications,mountTiles:()=>()=>{},location,URL,history:{replaceState(){},pushState(){}},window,console});
 await vm.runInContext('(async()=>{'+read('pack/app.js').replace(/^import .*\n/gm,'')+';window.testOpenModule=openModule;window.testOpenApplication=openApplication;window.testCloseTab=closeTab;window.testHome=home;})()',c);
 return {db,ids,events,signOut:()=>authCallback('SIGNED_OUT'),open:async name=>{await vm.runInContext('0',c);},c};
}
test('signed-out and employee sessions show gate without creating any module frame',async()=>{
 for(const options of [{allowed:false},{userExists:false}]){const p=await panel({...options,query:'?module=finances'});assert.equal(p.ids.panel.hidden,true);assert.equal(p.ids.login.hidden,false);assert.equal(p.ids.frameHost.children.length,0);}
});
test('admin deep link opens correct standalone module; forged messages cannot close it; logout removes it',async()=>{
 const p=await panel({query:'?module=finances'});assert.equal(p.ids.panel.hidden,false);assert.equal(p.ids.frameHost.children.length,1);const frame=p.ids.frameHost.children[0];assert.match(frame.src,/\/pack\/module.html\?module=finances/);assert(!frame.src.startsWith('/app/'));
 p.events.message({origin:'https://evil.invalid',source:frame.contentWindow,data:{type:'robisie-pack-close'}});assert.equal(frame.removed,undefined);
 p.events.message({origin:'https://cleanfleet.pl',source:{},data:{type:'robisie-pack-close'}});assert.equal(frame.removed,undefined);
 p.events.message({origin:'https://cleanfleet.pl',source:frame.contentWindow,data:{type:'robisie-pack-close'}});assert.equal(frame.removed,true);assert.equal(p.ids.workspace.hidden,true);
 const q=await panel({query:'?module=taxes'});const other=q.ids.frameHost.children[0];q.signOut();assert.equal(other.removed,true);assert.equal(q.ids.panel.hidden,true);
});
async function moduleHarness({role=true,kind='finances'}={}){
 const ids={moduleStatus:element(),modalRoot:element(),toast:element()},loaded=[],sent=[];let callback;
 const window={CFKsefPreview:{},CFAccountingMail:{reset(){}},CFAccountingDocuments:{open:()=>{window.opened='documents';}},CFFinance:{open:()=>{window.opened='finances';},close(){},lock(){}},cfShowTaxes:async()=>{window.opened='taxes';},cfOpenWebsiteStatsPanel:()=>{window.opened='website';},cfShowReminders:async()=>{window.opened='reminders';}};
 const db={auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:fn=>callback=fn},rpc:async name=>({data:name==='cf_is_admin'?role:[]})};
 const c=vm.createContext({client:()=>db,administrator,modules,apiURL:'https://project.invalid',KEY:'public-key',URL,location:{href:'https://cleanfleet.pl/pack/module.html?module='+kind,origin:'https://cleanfleet.pl'},window,parent:{postMessage:(...args)=>sent.push(args)},document:{getElementById:id=>ids[id],head:{append:script=>{loaded.push(script.src);script.onload();}},createElement:()=>({}),body:{},querySelector:()=>({}),addEventListener(){}},MutationObserver:class{observe(){}disconnect(){}},setTimeout,console});window.addEventListener=()=>{};
 await vm.runInContext('(async()=>{'+read('pack/module.js').replace(/^import .*\n/gm,'')+'})()',c);return {window,loaded,sent,signOut:()=>callback('SIGNED_OUT')};
}
test('module direct URLs reject employees before loading any private module scripts',async()=>{const h=await moduleHarness({role:false});assert.equal(h.loaded.length,0);assert.equal(h.window.cfIsAdmin(),false);assert.equal(h.sent[0][0].type,'robisie-pack-denied');});
test('migrated modules load their own dependencies, open and clear admin authorization on signout',async()=>{
 for(const kind of Object.keys(modules).filter(k=>k!=='calendar')){const h=await moduleHarness({kind});assert.equal(h.window.opened,kind);assert(h.loaded.length>0);assert(!h.loaded.some(src=>src==='/app/'||src.includes('index.html')));assert(h.window.cfIsAdmin());h.signOut();assert.equal(h.window.cfIsAdmin(),false);}
});
test('CleanFleet keeps staff/companies/weather while Pack owns migrated modules and independent app links',()=>{
 const app=read('app/index.html'),sw=read('app/sw.js'),pack=read('pack/index.html');assert(app.includes('cfCompanyUsersCard'));assert(app.includes('cfCompanyPackCard'));for(const id of ['cfCompanyFinancesCard','cfCompanyWebsiteStatsCard','cfCompanyAccountingDocsCard'])assert(!app.includes('id="'+id+'"'));
 assert(!app.includes('function cfShowEarnings('));assert(!app.includes('function cfOpenWebsiteStatsPanel('));assert(!sw.includes('<script src="/app/taxes-v1310.js'));assert(!sw.includes('<script src="/app/calendar-v1203.js'));assert(!sw.includes('<script src="/app/calendar-weather-v1218.js'));assert(!app.includes('id="cfCompanyRemindersCard"'));assert(pack.includes('data-module="calendar"'));assert(pack.includes('data-module="reminders"'));
 for(const name of Object.keys(applications))assert(pack.includes('data-app="'+name+'"'));assert(pack.includes('Bill</h3>'));assert(pack.includes('/assets/cleanfleet-logo.png'));assert(read('pack/earnings.js').includes("from('cf_earning_rules')"));assert(read('app/priv/ui.js').includes("else location.replace('/pack/?module=finances')"));
});

test('each application opens inside Pack and the Panel button preserves its frame',async()=>{for(const name of Object.keys(applications)){const p=await panel({query:'?application='+name}),frame=p.ids.frameHost.children[0];assert.equal(frame.src,applications[name].url);assert.equal(p.ids.closeModule.hidden,true);p.ids.homeTab.onclick();assert.equal(frame.removed,undefined);assert.equal(frame.hidden,true);assert.equal(p.ids.dashboard.hidden,false);assert.equal(p.ids.closeModule.hidden,true);}});

test('applications and modules get the Pack width stylesheet after each document load',async()=>{
 for(const query of ['?application=cleanfleet','?application=robisie','?application=bill','?module=taxes','?module=finances','?module=documents','?module=website']){
  const p=await panel({query}),frame=p.ids.frameHost.children[0];
  const freshDocument=()=>{const classes=new Set(),links=[];return {classes,links,documentElement:{classList:{add:value=>classes.add(value)}},getElementById:id=>links.find(link=>link.id===id),createElement:()=>({}),head:{append:link=>links.push(link)},addEventListener(){}};};
  frame.contentDocument=freshDocument();frame.onload();assert(frame.contentDocument.classes.has('robisie-pack-frame'));assert.equal(frame.contentDocument.links[0].href,'/pack/frame.css?v=120');
  frame.onload();assert.equal(frame.contentDocument.links.length,1);
  frame.contentDocument=freshDocument();frame.onload();assert.equal(frame.contentDocument.links.length,1);
  p.ids.homeTab.onclick();assert.equal(frame.removed,undefined);assert.equal(frame.hidden,true);assert.equal(p.ids.dashboard.hidden,false);
 }
});

test('separate module/app tabs reuse the original frames and close only the requested tab',async()=>{
 const p=await panel({query:'?module=finances'}),original=p.ids.frameHost.children[0];
 await p.c.window.testOpenApplication('bill');const bill=p.ids.frameHost.children[1];
 await p.c.window.testOpenModule('finances');assert.equal(p.ids.frameHost.children.length,2);assert.equal(original.hidden,false);assert.equal(bill.hidden,true);
 p.c.window.testHome();assert.equal(original.removed,undefined);assert.equal(bill.removed,undefined);assert.equal(p.ids.dashboard.hidden,false);
 p.c.window.testCloseTab('finances');assert.equal(original.removed,true);assert.equal(bill.removed,undefined);
 await p.c.window.testOpenApplication('bill');assert.equal(p.ids.frameHost.children.length,2);p.signOut();assert.equal(bill.removed,true);
});
test('a delayed administrator reply cannot reopen a tab after logout',async()=>{
 const p=await panel();let release;p.db.auth.getUser=()=>new Promise(resolve=>release=resolve);
 const opening=p.c.window.testOpenModule('reminders');p.signOut();release({data:{user:{id:'u'}}});await opening;
 assert.equal(p.ids.panel.hidden,true);assert.equal(p.ids.frameHost.children.length,0);
});
