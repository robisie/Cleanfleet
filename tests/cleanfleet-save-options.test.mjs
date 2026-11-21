import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const defaults=html.slice(html.indexOf('  const DEFAULT_OPTIONS ='),html.indexOf('  // Starter fleet list'));
const helpers=html.slice(html.indexOf('  function cfNormalizeOptions('),html.indexOf('  const CF_SEARCH_HISTORY_KEY'));
const editor=html.slice(html.indexOf('  function cfOpenVehicleEdit('),html.indexOf('  function cfBindFleetBulk('));
function optionsFixture(config){
 const storage=config?.storage||new Map();
 const ctx=vm.createContext({structuredClone,cfActiveCompanyId:'company-a',localStorage:{getItem:key=>{if(config?.blocked)throw Error('Storage blocked');return storage.get(key)||null;},setItem:(key,value)=>{if(config?.blocked)throw Error('Quota exceeded');storage.set(key,value);}}});
 vm.runInContext(defaults+'\nlet options=structuredClone(DEFAULT_OPTIONS);\n'+helpers,ctx);
 return {ctx,storage,run:code=>vm.runInContext(code,ctx)};
}
test('new suggestions save on the first attempt, persist across reloads and ignore case duplicates',()=>{
 const f=optionsFixture();
 f.run("addOptionIfNew('typ','BUS C');addOptionIfNew('marka',' IVECO ');addOptionIfNew('kto_zlecil','Nowa osoba');addOptionIfNew('kto_wykonal','Wykonujący');addOptionIfNew('marka','iveco');");
 const saved=JSON.parse(f.storage.get('cleanfleet-options-v1:company-a'));
 assert.deepEqual(saved.marka.filter(x=>x.toUpperCase()==='IVECO'),['IVECO']);
 f.run('options={};loadOptions();');
 assert.equal(f.run("options.kto_zlecil.includes('Nowa osoba')"),true);
 assert.equal(f.run("options.typ.includes('BUS C')"),true);
});
test('restricted browser storage never stops adding suggestions or loading defaults',()=>{
 const f=optionsFixture({blocked:true});
 assert.doesNotThrow(()=>f.run("loadOptions();addOptionIfNew('marka','IVECO');addOptionIfNew('kto_zlecil','Nowa osoba');"));
 assert.equal(f.run("options.marka.includes('IVECO')"),true);
});
test('company switches isolate suggestions; corrupt or malformed backup values cannot break forms',()=>{
 const f=optionsFixture();
 f.run("addOptionIfNew('kto_zlecil','Tylko firma A');cfActiveCompanyId='company-b';loadOptions();");
 assert.equal(f.run("options.kto_zlecil.includes('Tylko firma A')"),false);
 f.storage.set('cleanfleet-options-v1:company-b','{invalid');assert.doesNotThrow(()=>f.run('loadOptions();'));
 f.run("options={marka:[' Volvo ',null,42,'IVECO','iveco'],typ:'bad'};saveOptions();");
 assert.equal(f.run("options.marka.filter(x=>x.toUpperCase()==='VOLVO').length"),1);
 assert.equal(f.run("options.marka.includes('IVECO')"),true);
 f.run("cfActiveCompanyId='company-a';loadOptions();");
 assert.equal(f.run("options.kto_zlecil.includes('Tylko firma A')"),true);
});
function vehicleFixture({blocked=false,renderFails=false,insertError=null}={}){
 const f=optionsFixture({blocked}),nodes=new Map(),messages=[],writes=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',innerHTML:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},querySelectorAll:()=>[]});return nodes.get(id);};
 Object.assign(f.ctx,{console:{error(){}},AbortController,setTimeout,clearTimeout,registry:{},records:[],invoiceItems:[],cfRemoteVehiclePlates:new Set(),window:{},document:{getElementById:node},normalizePlate:v=>v.trim().toUpperCase(),cfIsAdmin:()=>true,cfIsFleetEmployee:()=>false,escapeHtml:v=>String(v??''),cfBillingCompanyOptions:()=>'',cfBillingCompanyCurrency:()=> 'PLN',showToast:m=>messages.push(m),renderPlateList(){if(renderFails)throw Error('Render failed');},renderAttentionPanel(){},renderRecords(){},cfSetSync(){},cfFormatSyncTime:()=>'',cfLastSync:null,openForm(){},showAllOutstanding(){},cfSupabase:{from(table){assert.equal(table,'vehicles');return {insert(payload){writes.push(payload);return {abortSignal:async()=>({error:insertError})};}};}}});
 vm.runInContext(editor,f.ctx);f.ctx.cfOpenVehicleEdit('',null,'create');
 node('cfVehiclePlate').value='TEST123';node('cfVehicleType').value='NOWY TYP';node('cfVehicleBrand').value='NOWA MARKA';
 return {...f,node,messages,writes,async save(){node('cfVehicleCreateBtn').listeners.click();await new Promise(resolve=>setImmediate(resolve));}};
}
for(const blocked of [false,true])test(`vehicle creation with new suggestions inserts once and closes on first save (storage blocked: ${blocked})`,async()=>{
 const f=vehicleFixture({blocked});await f.save();
 assert.equal(f.writes.length,1);assert.equal(f.ctx.registry.TEST123.marka,'NOWA MARKA');assert.equal(f.node('modalRoot').innerHTML,'');
 assert.match(f.messages.at(-1),/został dodany do bazy/);assert.doesNotMatch(f.messages.at(-1),/Nie udało się dodać/);
});
test('a render failure after vehicle insert reports saved status, while a database rejection remains an error',async()=>{
 const f=vehicleFixture({renderFails:true});await f.save();assert.equal(f.writes.length,1);assert.match(f.messages.at(-1),/został dodany do bazy.*odśwież dane/);assert.equal(f.node('modalRoot').innerHTML,'');
 const rejected=vehicleFixture({insertError:{message:'Permission denied'}});await rejected.save();assert.match(rejected.messages.at(-1),/Nie udało się dodać pojazdu: Permission denied/);assert.equal(rejected.ctx.registry.TEST123,undefined);assert.equal(rejected.node('cfVehicleCreateBtn').disabled,false);
});
test('editing a wash with several new suggestion values saves on the first attempt even with blocked storage',async()=>{
 const f=optionsFixture({blocked:true}),fields=new Map(),messages=[],writes=[];
 const field=(id,value='')=>fields.set(id,{value,checked:false});
 for(const id of ['f_tablica','f_typ','f_marka','f_kto_zlecil','f_data_zlecenia','f_data_zlecenia_do','f_priority','f_uwagi','f_opis_uslugi','f_data_prania','f_kto_wykonal','f_koszt','f_zlecone'])field(id);
 fields.get('f_tablica').value='TEST123';fields.get('f_typ').value='NOWY TYP';fields.get('f_marka').value='NOWA MARKA';fields.get('f_kto_zlecil').value='NOWY ZLECAJĄCY';fields.get('f_kto_wykonal').value='NOWY WYKONAWCA';
 Object.assign(f.ctx,{document:{getElementById:id=>fields.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[]},window:{},editingId:'wash1',records:[{id:'wash1',tablica:'TEST123'}],registry:{TEST123:{}},cfScheduleCounterMode:false,cfCurrentUserId:'admin',cfIsAdmin:()=>true,cfIsFleetEmployee:()=>false,cfCanonicalWashType:v=>v,cfBillingCompanyCurrency:()=> 'PLN',saveRegistry:async()=>writes.push('vehicle'),saveRecords:async()=>writes.push('wash'),renderPlateList(){},renderAttentionPanel(){},renderRecords(){},closeModal(){},showToast:m=>messages.push(m)});
 const start=html.indexOf('  async function submitForm('),end=html.indexOf('\n  }\n',start)+5;
 vm.runInContext(html.slice(start,end),f.ctx);await f.ctx.submitForm();
 assert.deepEqual(writes,['vehicle','wash']);assert.equal(messages.at(-1),'Zapisano zmiany');assert.equal(f.ctx.records[0].marka,'NOWA MARKA');
});

test('repeated clicks do not issue a second insert; real duplicates are still rejected',async()=>{
 const f=vehicleFixture();f.node('cfVehicleCreateBtn').listeners.click();await f.save();assert.equal(f.writes.length,1);
 const duplicate=vehicleFixture();duplicate.ctx.registry.TEST123={marka:'Existing'};await duplicate.save();assert.equal(duplicate.writes.length,0);assert.match(duplicate.messages.at(-1),/już istnieje w bazie/);
});
