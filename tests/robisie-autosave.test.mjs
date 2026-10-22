import * as Completion from '../app/robisie/completion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as C from '../app/robisie/core.js';
import * as PDF from '../app/robisie/pdf.js';
import * as Auto from '../app/robisie/autosave.js';
import {changedFields} from '../app/robisie/api.js';
const clone=structuredClone;
const source=await fs.readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');
function fixture(){const settings={catalog:[],markup:35,company:{name:'Firma'},shops:['Castorama']};return {row:{id:'project',contract_number:'UUR-RS/2026/10/001',revision:1,payload:C.captureCatalog(settings,C.newProject('Schody','Inwestor'))},settings:{revision:1,payload:settings},calls:[],storage:new Map(),fail:false,delay:null};}
async function openApp(db,selected=true){
 const nodes=new Map(),events=new Map(),timers=new Set();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',style:{},dataset:{},open:false,isConnected:true,querySelector:node,querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;},options:[{value:"szt."}],classList:{toggle(){}}});return nodes.get(key);};
 const context=vm.createContext({console,crypto,URL,structuredClone,FormData:class extends Map{constructor(fields){super(Object.entries(fields));}getAll(key){return this.get(key)||[];}},setTimeout(fn,ms){const id=setTimeout(fn,ms);timers.add(id);return id;},clearTimeout,confirm:()=>true,localStorage:{getItem:key=>db.storage.get(key)||null,setItem:(key,value)=>db.storage.set(key,value),removeItem:key=>db.storage.delete(key)},fetch:async()=>({ok:true,json:async()=>[]}),window:{rsShowDojazdy:options=>{db.tripOptions=options;},location:{href:'https://cleanfleet.pl/app/robisie/'},scrollY:0,scrollTo(){},addEventListener(type,fn){events.set('window:'+type,fn);}},document:{body:{style:{}},documentElement:{style:{}},querySelector:node,querySelectorAll:()=>[],addEventListener(type,fn){events.set(type,fn);}}});
 const api={getSession:()=>({user:{id:'owner'}}),restoreSession:()=>null,rpc:async()=>true,projects:async()=>[clone(db.row)],settings:async()=>[clone(db.settings)],saveProject:async(row,payload)=>{db.calls.push({scope:'project',revision:row.revision,payload:clone(payload)});if(db.delay){const wait=db.delay;db.delay=null;await wait;}if(db.fail)throw new Error('Brak sieci');if(row.revision!==db.row.revision)throw new Error('RS_CONFLICT');const patch=changedFields(row.payload,payload),stored=clone(db.row.payload);delete stored._undo;for(const key of patch.p_remove_keys)delete stored[key];Object.assign(stored,clone(patch.p_fields));if(payload._undo)stored._undo=clone(payload._undo);assert.deepEqual(stored,clone(payload),'Differential RPC must persist every edited field');db.row={...db.row,payload:stored,revision:db.row.revision+1};return clone(db.row);},saveSettings:async(payload,revision)=>{db.calls.push({scope:'settings',revision,payload:clone(payload)});if(db.fail)throw new Error('Brak sieci');if(revision!==db.settings.revision)throw new Error('RS_CONFLICT');db.settings={payload:clone(payload),revision:revision+1};return clone(db.settings);}};
 const module=new vm.SourceTextModule(source+`\nexport function setup(row,settings,choose){all=[structuredClone(row)];selected=choose?structuredClone(row):null;config=structuredClone(settings);configBaseline=structuredClone(config);view=choose?'purchases':'settings';projectDirty=settingsDirty=dirty=false;render();} export {flushChanges,undoChanges,load,purchaseDialog,receiptDialog,persistCatalog,tripDialog,lineDialog,removeTrip};export const data=()=>selected;export const settingsData=()=>config;export const isDirty=()=>dirty;`,{context});
 await module.link(spec=>{const values=spec.includes('completion.js')?Completion:spec.includes('autosave')?Auto:spec.includes('core')?C:spec.includes('pdf')?PDF:api;return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});});await module.evaluate();await new Promise(resolve=>setImmediate(resolve));module.namespace.setup(db.row,db.settings,selected);
 return {app:module.namespace,node,events,input(field,value,scope='field'){events.get('input')({target:{type:'text',value,dataset:{[scope]:field}}});},close(){for(const id of timers)clearTimeout(id);},async submit(fields){await node('#modal-form').onsubmit({preventDefault(){},target:fields});}};
}

test('confirmed purchase saves immediately; reload retains it and undo restores the prior database state',async()=>{
 const db=fixture(),ui=await openApp(db);ui.app.purchaseDialog();await ui.submit({date:'2026-10-11',shop:'Castorama',amount:'2398',charge:'2398',description:'Schody',invoice:'FV',paid:'on',paidAmount:'1900'});
 assert.equal(db.row.payload.purchases.length,1);assert.equal(db.row.payload.purchases[0].paidAmount,1900);assert.equal(ui.app.isDirty(),false);assert.equal(db.row.payload._undo.payload.purchases.length,0);assert.equal(db.row.payload._undo.payload._undo,undefined);assert.ok(![...db.storage.keys()].some(key=>key.startsWith('robisie-autosave')));
 ui.close();const reopened=await openApp(db);await reopened.app.undoChanges();assert.equal(db.row.payload.purchases.length,0);assert.equal(db.row.payload._undo,undefined);assert.equal(C.purchaseTotals(db.row.payload).advances,0);reopened.close();
});

test('direct fields save after typing stops without replacing the active form',async()=>{
 const db=fixture(),ui=await openApp(db),html=ui.node('#app').innerHTML;ui.input('name','Nowa nazwa');assert.equal(ui.app.isDirty(),true);
 await new Promise(resolve=>setTimeout(resolve,850));assert.equal(db.row.payload.name,'Nowa nazwa');assert.equal(ui.app.isDirty(),false);assert.equal(ui.node('#app').innerHTML,html);assert.equal(ui.node('#save-state').textContent,'Dane zapisane w bazie');ui.close();
});

test('edits made during a pending request are retained and serial saves use the updated revision',async()=>{
 const db=fixture(),ui=await openApp(db);let release;db.delay=new Promise(resolve=>{release=resolve;});ui.input('name','Pierwsza');const first=ui.app.flushChanges({normalize:false});await new Promise(resolve=>setImmediate(resolve));ui.input('name','Druga');release();await first;assert.equal(ui.app.data().payload.name,'Druga');await ui.app.flushChanges({normalize:false});assert.equal(db.row.payload.name,'Druga');assert.deepEqual(db.calls.map(call=>call.revision),[1,2]);assert.equal(db.row.payload._undo.payload.name,'Pierwsza');await ui.app.undoChanges();assert.equal(db.row.payload.name,'Pierwsza');ui.close();
});

test('offline confirmed purchase survives a reload and is retried once without duplication',async()=>{
 const db=fixture();db.fail=true;const ui=await openApp(db);ui.app.purchaseDialog();await ui.submit({date:'2026-10-11',shop:'Castorama',amount:'100',charge:'100',description:'Materiały',invoice:'',paid:'on',paidAmount:'40'});
 assert.equal(ui.app.isDirty(),true);assert.equal(db.row.payload.purchases.length,0);assert.equal(ui.app.data().payload.purchases.length,1);assert.ok(db.storage.has('robisie-autosave-drafts-v1:owner'));ui.close();db.fail=false;
 const reopened=await openApp(db);await reopened.app.load();assert.equal(reopened.app.data().payload.purchases.length,1);await reopened.app.flushChanges({normalize:false});assert.equal(db.row.payload.purchases.length,1);assert.equal(db.row.payload.purchases[0].paidAmount,40);assert.equal(reopened.app.isDirty(),false);reopened.close();
});

test('company and catalog settings auto-save and can be undone after reopening',async()=>{
 const db=fixture(),ui=await openApp(db,false);ui.input('name','Nowa firma','company');await ui.app.flushChanges({normalize:false});assert.equal(db.settings.payload.company.name,'Nowa firma');assert.equal(db.calls.length,1);assert.equal(db.calls[0].scope,'settings');ui.close();
 const reopened=await openApp(db,false);await reopened.app.undoChanges();assert.equal(db.settings.payload.company.name,'Firma');assert.equal(db.settings.payload._undo,undefined);assert.equal(db.row.revision,1);reopened.close();
});

test('drafts are isolated by account and undo cannot overwrite a newer revision on another device',async()=>{
 const db=fixture(),ui=await openApp(db);ui.input('name','Zmieniona');await ui.app.flushChanges({normalize:false});db.row.payload.name='Inne urządzenie';db.row.revision++;await assert.rejects(ui.app.undoChanges(),/RS_CONFLICT/);assert.equal(db.row.payload.name,'Inne urządzenie');assert.ok(ui.app.data().payload._undo);ui.close();
 let owner='a';const store=new Auto.DraftStore(()=>({getItem:key=>db.storage.get(key),setItem:(key,value)=>db.storage.set(key,value),removeItem:key=>db.storage.delete(key)}),()=>owner);store.put('project:x',1,{name:'Tajne'});owner='b';assert.deepEqual(store.read(),{});owner='a';assert.equal(store.read()['project:x'].payload.name,'Tajne');
});

test('merging an in-flight settings response preserves a new service and newer typed company details',()=>{
 const before={company:{name:'Stara'},catalog:[],markup:35},saved={company:{name:'Stara'},catalog:[{id:'new'}],markup:35,_undo:{payload:before}},live={company:{name:'Nowa'},catalog:[],markup:50};const merged=Auto.mergeEdits(saved,before,live);assert.equal(merged.company.name,'Nowa');assert.equal(merged.markup,50);assert.deepEqual(merged.catalog,[{id:'new'}]);assert.ok(merged._undo);
});

test('a failed master catalog change is retained locally, recovered, saved and undone',async()=>{
 const db=fixture(),ui=await openApp(db,false);db.fail=true;const desired=clone(db.settings.payload);desired.catalog.push({id:'service',name:'Usługa',category:'Prace',unit:'m²',base:40});await assert.rejects(ui.app.persistCatalog(desired),/Brak sieci/);assert.equal(ui.app.isDirty(),true);assert.equal(db.settings.payload.catalog.length,0);assert.equal(ui.app.settingsData().payload.catalog.length,1);ui.close();db.fail=false;
 const reopened=await openApp(db,false);await reopened.app.load();await reopened.app.flushChanges({normalize:false});assert.equal(db.settings.payload.catalog.length,1);await reopened.app.undoChanges();assert.equal(db.settings.payload.catalog.length,0);reopened.close();
});

test('saved routes persist only in the selected project, survive reload and support undo',async()=>{
 const db=fixture(),ui=await openApp(db);ui.app.tripDialog();assert.equal(db.tripOptions.allowed(),true);
 const trip={name:'Mikołów — inwestycja',points:[{label:'Start',coords:[18.9,50.1]},{label:'Koniec',coords:[19,50]}],meters:30000,consumption:9,price:6.5,back:true};
 await db.tripOptions.onSave(trip);assert.equal(db.row.payload.trips.length,1);assert.equal(db.row.payload.trips[0].cost,17.55);assert.equal(db.settings.revision,1);db.tripOptions.onClose();ui.close();
 const reopened=await openApp(db);assert.equal(reopened.app.data().payload.trips[0].name,trip.name);await reopened.app.undoChanges();assert.equal(db.row.payload.trips.length,0);reopened.close();
});
test('offer route selection sets price and quantity, keeps catalog untouched and survives route removal',async()=>{
 const db=fixture(),ui=await openApp(db);const trip=C.savedTrip({name:'Budowa',points:[{label:'Start',coords:[18.9,50.1]},{label:'Koniec',coords:[19,50]}],meters:30000,consumption:9,price:6.5},'route');
 db.row.payload.trips=[trip];db.row.payload.offer=[{id:'line',serviceId:'dojazd',name:'Dojazd',category:'Logistyczne',unit:'szt.',qty:1,price:35,included:true}];ui.app.setup(db.row,db.settings,true);
 ui.node('#f-name').value='Dojazd';ui.app.lineDialog('offer','line');ui.node('#f-tripId').value='route';ui.node('#f-tripId').onchange();assert.equal(ui.node('#f-price').value,17.55);assert.equal(ui.node('#f-price').readOnly,true);
 await ui.submit({name:ui.node('#f-name').value,category:'Logistyczne',unit:'szt.',qty:'5',price:String(ui.node('#f-price').value),roomId:'',days:'0',hours:'0',note:''});
 const line=db.row.payload.offer[0];assert.equal(line.qty,5);assert.equal(line.price,17.55);assert.equal(C.lineValue(line),87.75);assert.equal(line.travelBasis.id,'route');assert.equal(db.settings.revision,1);assert.equal(db.settings.payload.catalog.length,0);
 await ui.app.removeTrip('route');assert.equal(db.row.payload.trips.length,0);assert.equal(db.row.payload.offer[0].price,17.55);assert.equal(db.row.payload.offer[0].travelBasis.cost,17.55);ui.close();
});

test('quick receipt adds material advances and work payments separately, persists once and supports undo',async()=>{
 const db=fixture();db.row.payload.works=[{id:'work',qty:1,price:1000,done:true}];db.row.payload.receipts=[{id:'initial',kind:'materials',amount:200}];const ui=await openApp(db);
 assert.ok(ui.node('#app').innerHTML.includes('class="primary quick-receipt"'));
 await ui.events.get('click')({target:{closest:()=>({dataset:{action:'receipt-add'},isConnected:true})}});assert.ok(ui.node('#dialog').innerHTML.includes('Cel wpłaty'));
 ui.node('#f-kind').value='materials';ui.node('#f-kind').onchange();assert.equal(ui.node('#receipt-stage').hidden,true);assert.equal(ui.node('#f-stageId').disabled,true);
 await ui.submit({date:'2026-10-15',amount:'300',kind:'materials',stageId:'should-be-ignored',note:'Materiały na jutro'});
 assert.equal(db.row.payload.receipts.length,2);assert.equal(db.calls.length,1);assert.equal(db.row.payload.receipts[1].stageId,'');assert.equal(C.purchaseTotals(db.row.payload).advances,500);assert.equal(C.totals(db.row.payload).paid,0);
 ui.app.receiptDialog();ui.node('#f-kind').value='work';ui.node('#f-kind').onchange();assert.equal(ui.node('#receipt-stage').hidden,false);await ui.submit({date:'2026-10-15',amount:'150',kind:'work',note:'Za wykonane prace'});
 assert.equal(C.purchaseTotals(db.row.payload).advances,500);assert.equal(C.totals(db.row.payload).paid,150);assert.equal(C.totals(db.row.payload).workRemaining,850);assert.equal(db.settings.revision,1);ui.close();
 const reopened=await openApp(db);assert.equal(reopened.app.data().payload.receipts.length,3);await reopened.app.undoChanges();assert.equal(C.totals(db.row.payload).paid,0);assert.equal(C.purchaseTotals(db.row.payload).advances,500);reopened.close();
});


test('room layout and completed work edits reach the differential RPC and remain visible after reopening',async()=>{
 const db=fixture(),ui=await openApp(db);const payload=ui.app.data().payload;
 payload.rooms=[{id:'opening',name:'Otwór schodowy'},{id:'attic',name:'Zabudowa na strychu'}];
 payload.works=[{id:'work',name:'Prace',qty:1,price:6432.28,done:true,included:true},{id:'later',name:'Dalsze prace',qty:1,price:1369.44,done:false,included:true}];
 ui.input('name','Schody');await ui.app.flushChanges({normalize:false});assert.equal(C.totals(db.row.payload).works.done,6432.28);assert.equal(C.totals(db.row.payload).works.after,7801.72);assert.equal(db.row.payload.rooms.length,2);ui.close();
 const reopened=await openApp(db);assert.equal(C.totals(reopened.app.data().payload).works.done,6432.28);assert.equal(reopened.app.data().payload.rooms.length,2);reopened.close();
});
