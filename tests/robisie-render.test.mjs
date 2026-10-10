import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as C from '../app/robisie/core.js';
import * as PDF from '../app/robisie/pdf.js';
test('wszystkie moduły renderują dane inwestycji i wspólne numery dokumentów',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('../app/robisie/catalog.json',import.meta.url),'utf8'));
 const radios=catalog.map(x=>({value:x.id,checked:false}));
 let confirmDelete=true,deleteFails=false,confirmation='';let printedHtml='';const deletions=[];const savedSettings=[];const createdProjects=[];const listeners=new Map();const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',style:{},options:[{value:''},{value:'m²'},{value:'__robisie_custom_unit__'}],focus(){},classList:{toggle(){}},isConnected:true,showModal(){},close(){},querySelectorAll:()=>radios});return nodes.get(key);};
 const numericControls=[];
 const context=vm.createContext({console,crypto,structuredClone,URL,FormData:class extends Map{constructor(entries){super(Object.entries(entries));for(const input of node('#modal-form').querySelectorAll())if(input.name)this.set(input.name,input.value);}getAll(key){const v=this.get(key);return Array.isArray(v)?v:v?[v]:[];}},setTimeout,clearTimeout,confirm:message=>{confirmation=message;return confirmDelete;},fetch:async()=>({ok:true,json:async()=>catalog}),window:{scrollY:420,location:{href:'https://cleanfleet.pl/app/robisie/'},open:()=>({document:{write:html=>{printedHtml=html;},close(){}}}),addEventListener(){},scrollTo(){}},document:{body:{style:{position:'',top:'',width:'',overflow:''}},documentElement:{style:{overflow:''}},querySelector:node,querySelectorAll:()=>numericControls,addEventListener(type,fn){listeners.set(type,fn);}}});
 const source=await fs.readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source+'\nexport function testNormalize(){normalizeNumericFields(document);} export async function testSave(){await save();} export function testCommitNumeric(el){return commitNumericInput(el);} export function testConfig(){return config;} export function testServiceDialog(){serviceDialog();} export function testCorrection(){selected=null;view="catalog";dirty=false;catalogCorrectionDialog();} export async function testUndo(){await undoCatalog();} export function testCatalog(){return catalogView();} export function testSelected(row){selected=structuredClone(row);view="catalog";return catalogView();} export function testSummary(){return summaryView();} export function testDashboard(){return dashboard();} export function testPurchaseDialog(){purchaseDialog();} export function testShops(){return shopSuggestions();} export function testPurchases(){return purchasesView();} export function testDirty(){return dirty;} export function testLineDialog(){lineDialog("offer");} export function testOffer(){return p().offer;} export function testPicker(){return servicePicker(config.payload.catalog);} export function testRoomLines(){return roomLines("offer",p().offer);} export function testUnits(current=""){return unitField(current);} export async function testDelete(id){await removeProject(id);} export function testProjects(){return all;} export function testProjectRows(){return projectRows(all);} export function testPdfChooser(){view="overview";dirty=false;pdfDialog();} ' +'\nexport function testRender(row,settings){all=[structuredClone(row)];selected=structuredClone(row);config={payload:settings,revision:1};configBaseline=structuredClone(config);return [...C.MODULES.map(([key])=>key),"catalog","settings"].map(key=>{view=key;return [key,content()];});}',{context});
 await module.link(spec=>{const values=spec.includes('core')?C:spec.includes('pdf')?PDF:{restoreSession:()=>null,projects:async()=>[structuredClone(row)],createProject:async(payload,date)=>{const row={id:'new-project',contract_number:'UUR-RS/2026/10/002',payload:structuredClone(payload),revision:1};createdProjects.push({row,date});return row;},deleteProject:async project=>{deletions.push(structuredClone(project));if(deleteFails)throw new Error('Brak połączenia');return project.id;},saveSettings:async(payload,revision)=>{const row={payload:structuredClone(payload),revision:revision+1};savedSettings.push(row);return row;}};const keys=Object.keys(values);return new vm.SyntheticModule(keys,function(){for(const key of keys)this.setExport(key,values[key]);},{context});});
 await module.evaluate();await new Promise(resolve=>setTimeout(resolve,10));
 const payload=C.newProject('Remont testowy','Inwestor testowy');payload.rooms=[{id:'r',name:'Kuchnia',length:4,width:3,height:2.6}];
 payload.offer=[{id:'l',roomId:'r',serviceId:'a',name:'Malowanie',category:'Ściany',unit:'m²',qty:12,price:100,included:true}];payload.works=structuredClone(payload.offer);payload.works[0].done=true;
 payload.purchases=[{id:'x',date:'2026-10-08',shop:'Test',description:'Materiał',invoice:'FV test',amount:100,charge:110,paid:true}];payload.receipts=[{id:'v',date:'2026-10-08',kind:'work',amount:500}];
 const row={id:'p',contract_number:'UUR-RS/2026/10/001',payload,revision:1};
 const results=module.namespace.testRender(row,{catalog,markup:35,company:{name:'ROBISIĘ-FER sp. z o.o.'}});
 assert.equal(results.length,13);for(const [key,html] of results){assert.ok(html.length>50,key);assert.ok(!html.includes('undefined'),key);assert.ok(!html.includes('NaN'),key);}
 assert.ok(results.find(([key])=>key==='overview')[1].includes('WYM-RS/2026/10/001'));
 assert.ok(results.find(([key])=>key==='contract')[1].includes('OFE-RS/2026/10/001/V1'));
 assert.equal(catalog.length,102); // Arithmetic inputs update actual quotation quantities, prices and discounts.
 assert.ok(results.find(([key])=>key==='offer')[1].includes('data-numeric="true"'));
 const numeric=(value,dataset={},attributes={min:'0'})=>({type:'text',value,dataset:{numeric:'true',...dataset},required:false,validationMessage:'',getAttribute:key=>attributes[key]??null,setCustomValidity(message){this.validationMessage=message;},removeAttribute(){},setAttribute(){},focus(){},blur(){},reportValidity(){}});
 const qty=numeric('25+3+7-2',{line:'l',kind:'offer',prop:'qty'});
 listeners.get('input')({target:qty});assert.equal(module.namespace.testOffer()[0].qty,33);assert.equal(qty.value,'25+3+7-2');
 let enterPrevented=false;listeners.get('keydown')({target:qty,key:'Enter',preventDefault(){enterPrevented=true;}});
 assert.equal(enterPrevented,true);assert.equal(qty.value,'33');assert.equal(module.namespace.testOffer()[0].qty,33);
 qty.value='25+';listeners.get('input')({target:qty});assert.equal(module.namespace.testOffer()[0].qty,33);assert.ok(qty.validationMessage);
 numericControls.push(qty);await assert.rejects(module.namespace.testSave(),/Nieprawidłowe działanie/);qty.closest=()=>({open:false});module.namespace.testNormalize();delete qty.closest;numericControls.length=0;
 qty.value='3,5+2,5';listeners.get('focusout')({target:qty});assert.equal(qty.value,'6');assert.equal(module.namespace.testOffer()[0].qty,6);
 const price=numeric('80+20',{line:'l',kind:'offer',prop:'price'});listeners.get('change')({target:price});assert.equal(price.value,'100');assert.equal(module.namespace.testOffer()[0].price,100);
 const discount=numeric('2+3',{field:'discount'},{min:'0',max:'100'});listeners.get('input')({target:discount});listeners.get('focusout')({target:discount});assert.equal(discount.value,'5');
 discount.value='90+20';listeners.get('input')({target:discount});assert.ok(discount.validationMessage);assert.equal(module.namespace.testCommitNumeric(discount),false);
 module.namespace.testRender(row,{catalog,markup:35,company:{}});

 assert.ok(module.namespace.testProjectRows().includes('data-project-row="true"'));
 assert.ok(module.namespace.testProjectRows().includes(C.money(1200)));
 const finished=structuredClone(row);finished.payload.status='zakonczona';finished.payload.receipts.push({kind:'materials',amount:2000});finished.payload.sourceImport={fileName:'Historyczny plik',sheetNumbers:[1,2],notes:['Notatka']};
 const finishedViews=module.namespace.testRender(finished,{catalog,company:{}});
 assert.ok(module.namespace.testDashboard().includes('Zarobione łącznie'));
 assert.ok(module.namespace.testDashboard().includes('<strong>'+C.money(500)+'</strong>'));
 const overview=finishedViews.find(([key])=>key==='overview')[1];assert.ok(overview.includes('<details class="import-history">'));assert.ok(!overview.includes('<details class="import-history" open'));
 const summaryRow=structuredClone(row);summaryRow.payload.works.push({id:'l2',name:'A praca',category:'Podłogi',unit:'m²',qty:2,price:10,included:true});
 module.namespace.testRender(summaryRow,{catalog,company:{}});
 await listeners.get('click')({target:{closest:()=>({dataset:{action:'summary-sort',key:'qty'}})}});
 let summaryHtml=module.namespace.testSummary();assert.ok(summaryHtml.includes('aria-sort="ascending"'));assert.ok(summaryHtml.indexOf('A praca')<summaryHtml.indexOf('Malowanie'));
 await listeners.get('click')({target:{closest:()=>({dataset:{action:'summary-sort',key:'qty'}})}});
 summaryHtml=module.namespace.testSummary();assert.ok(summaryHtml.includes('aria-sort="descending"'));assert.ok(summaryHtml.indexOf('Malowanie')<summaryHtml.indexOf('A praca'));
 await listeners.get('click')({target:{closest:()=>({dataset:{action:'project-copy',id:'p'}})}});
 assert.equal((node('#dialog').innerHTML.match(/name="copySection"/g)||[]).length,C.COPY_SECTIONS.length);
 await node('#modal-form').onsubmit({preventDefault(){},target:{name:'Nowa inwestycja',investor:'Nowy inwestor',date:'2026-10-09',copySection:['offer']}});
 assert.equal(createdProjects.length,1);assert.equal(createdProjects[0].date,'2026-10-09');assert.equal(createdProjects[0].row.payload.offer.length,1);assert.equal(createdProjects[0].row.payload.rooms.length,1);assert.equal(createdProjects[0].row.payload.receipts.length,0);
 module.namespace.testRender(row,{catalog,markup:35,company:{}});

 const shopRow=structuredClone(row);
 shopRow.payload.purchases=[
  {id:'s1',shop:' Market A ',description:'Zakup pierwszy',amount:100,charge:110,paid:true},
  {id:'s2',shop:'market a',description:'Zakup drugi',amount:200.25,charge:220,paid:false},
  {id:'s3',shop:'Market B & C',description:'Zakup trzeci',amount:50,charge:55,paid:true},
  {id:'s4',shop:'',description:'Zakup bez sklepu',amount:10,charge:10,paid:true}
 ];
 module.namespace.testRender(shopRow,{catalog,markup:35,company:{}});
 let purchases=module.namespace.testPurchases();
 assert.equal((purchases.match(/data-action="purchase-shop"/g)||[]).length,4);
 assert.ok(purchases.includes('Market B &amp; C')&&purchases.includes('Bez sklepu'));
 const shopTiles=purchases.match(/<button[^>]*data-action="purchase-shop"[\s\S]*?<\/button>/g);
 assert.ok(shopTiles.find(tile=>tile.includes('data-all="true"')).includes(C.money(360.25)));
 assert.ok(shopTiles.find(tile=>tile.includes('data-shop="market a"')).includes(C.money(300.25)));
 assert.ok(shopTiles.find(tile=>tile.includes('data-shop="market b &amp; c"')).includes(C.money(50)));
 assert.ok(shopTiles.find(tile=>tile.includes('data-shop=""')&&!tile.includes('data-all')).includes(C.money(10)));

 const filterClick=dataset=>listeners.get('click')({target:{closest:()=>({dataset:{action:'purchase-shop',...dataset}})}});
 await filterClick({shop:'market a'});purchases=module.namespace.testPurchases();
 assert.ok(purchases.includes('Zakup pierwszy')&&purchases.includes('Zakup drugi'));
 assert.ok(!purchases.includes('Zakup trzeci')&&!purchases.includes('Zakup bez sklepu'));
 assert.ok(purchases.includes('Pokazano 2 z 4 zakupów'));
 assert.ok(purchases.includes(C.money(C.purchaseTotals(shopRow.payload).spent)));
 assert.equal(module.namespace.testDirty(),false);
 await filterClick({shop:''});purchases=module.namespace.testPurchases();
 assert.ok(purchases.includes('Zakup bez sklepu')&&!purchases.includes('Zakup pierwszy'));
 await filterClick({all:'true'});purchases=module.namespace.testPurchases();
 assert.ok(purchases.includes('Zakup pierwszy')&&purchases.includes('Zakup trzeci'));
 await filterClick({shop:'market a'});
 await listeners.get('click')({target:{closest:()=>({dataset:{action:'open',id:'p'}})}});
 assert.ok(module.namespace.testPurchases().includes('Zakup trzeci'));
 // Removing or renaming the last purchase in a filtered shop must not leave a stale empty view.
 await filterClick({shop:'market a'});
 module.namespace.testRender(row,{catalog,markup:35,company:{}});
 assert.ok(module.namespace.testPurchases().includes('Materiał'));

 const catalogHtml=results.find(([key])=>key==='catalog')[1];
 const pickerHtml=module.namespace.testPicker();
 const categories=new Set(catalog.map(x=>x.category));
 assert.equal((catalogHtml.match(/<details /g)||[]).length,categories.size);
 assert.equal((pickerHtml.match(/<details /g)||[]).length,categories.size);
 assert.equal((pickerHtml.match(/type="radio"/g)||[]).length,102);
 assert.ok(!pickerHtml.includes('<select'));assert.ok(!pickerHtml.includes('<details class="service-category" open'));
 const groupedRow=structuredClone(row);
 groupedRow.payload.rooms.push({id:'r2',name:'Łazienka',length:2,width:2,height:2.6});
 groupedRow.payload.offer.push({id:'l2',roomId:'r2',name:'Płytki',unit:'m²',qty:4,price:50},{id:'l3',roomId:'',name:'Transport',unit:'kpl',qty:1,price:100});
 module.namespace.testRender(groupedRow,{catalog,markup:35,company:{name:'ROBISIĘ-FER sp. z o.o.'}});
 const groups=module.namespace.testRoomLines().split('</details>').filter(x=>x.trim());
 assert.equal(groups.length,3);assert.ok(groups[0].includes('Kuchnia')&&groups[0].includes('Malowanie')&&!groups[0].includes('Płytki'));
 assert.ok(groups[1].includes('Łazienka')&&groups[1].includes('Płytki')&&!groups[1].includes('Malowanie'));
 assert.ok(groups[2].includes('Cała inwestycja')&&groups[2].includes('Transport'));
 assert.ok(!groups.some(x=>x.includes('<th>Pomieszczenie</th>')));
 const key=JSON.stringify(['p','offer','r']);listeners.get('toggle')({target:{dataset:{roomGroup:key},isConnected:true,open:true}});
 assert.ok(module.namespace.testRoomLines().split('</details>')[0].includes(' open>'));
 listeners.get('toggle')({target:{dataset:{roomGroup:key},isConnected:true,open:false}});
 assert.ok(!module.namespace.testRoomLines().split('</details>')[0].includes(' open>'));
 module.namespace.testLineDialog();
 const chosen=catalog.at(-1);const radio=radios.at(-1);radio.checked=true;radio.onchange();
 assert.equal(node('#f-name').value,chosen.name);
 assert.equal(node('#f-unit').value,chosen.unit||'');
 assert.equal(node('#f-price').value,C.round(chosen.base*1.35));
 await node('#modal-form').onsubmit({preventDefault(){},target:{serviceId:chosen.id,roomId:'r',name:chosen.name,unit:'m²',qty:'3',price:String(node('#f-price').value),days:'0',hours:'0',note:''}});
 const saved=module.namespace.testOffer().at(-1);
 assert.equal(saved.serviceId,chosen.id);assert.equal(saved.category,chosen.category);assert.equal(saved.qty,3);assert.equal(saved.price,C.round(chosen.base*1.35));
 // A submitted modal stores computed numbers and never inserts a line from an invalid expression.
 module.namespace.testLineDialog();
 const formNode=node('#modal-form'),originalQuery=formNode.querySelectorAll;
 const formQty={...numeric('25+',{},{}),name:'qty',required:true},formPrice={...numeric('100+35',{},{}),name:'price',required:true};
 formNode.querySelectorAll=()=>[formQty,formPrice];
 const beforeCount=module.namespace.testOffer().length;
 const expressionForm={serviceId:chosen.id,roomId:'r',name:chosen.name,category:chosen.category,unit:'m²',qty:'25+',price:'100+35',days:'0',hours:'0',note:''};
 await node('#modal-form').onsubmit({preventDefault(){},target:expressionForm});assert.equal(module.namespace.testOffer().length,beforeCount);assert.ok(formQty.validationMessage);
 formQty.value='25+3+7-2';await node('#modal-form').onsubmit({preventDefault(){},target:expressionForm});
 assert.equal(formQty.value,'33');assert.equal(formPrice.value,'135');assert.equal(module.namespace.testOffer().at(-1).qty,33);assert.equal(module.namespace.testOffer().at(-1).price,135);
 formNode.querySelectorAll=originalQuery;

 const unitHtml=module.namespace.testUnits('Godz');
 assert.ok(unitHtml.includes('<select id="f-unit"'));assert.ok(unitHtml.includes('value="Godz" selected'));assert.ok(unitHtml.includes('Dodaj własną…'));
 module.namespace.testLineDialog();
 node('#f-unit').value='__robisie_custom_unit__';node('#f-unit').onchange();
 assert.equal(node('#custom-unit-field').hidden,false);assert.equal(node('#f-customUnit').required,true);
 await node('#modal-form').onsubmit({preventDefault(){},target:{serviceId:chosen.id,roomId:'r',name:chosen.name,unit:'__robisie_custom_unit__',customUnit:'  panel  ',qty:'2',price:'40',days:'0',hours:'0',note:''}});
 assert.equal(savedSettings.length,1);assert.ok(savedSettings[0].payload.units.includes('panel'));
 assert.equal(module.namespace.testOffer().at(-1).unit,'panel');
 assert.ok(module.namespace.testUnits().includes('<option value="panel"'));
 // Reload from the settings returned by persistence: available for a later investment.
 module.namespace.testRender(row,savedSettings[0].payload);
 assert.ok(module.namespace.testUnits().includes('<option value="panel"'));
 module.namespace.testLineDialog();
 await node('#modal-form').onsubmit({preventDefault(){},target:{serviceId:chosen.id,roomId:'r',name:chosen.name,unit:'panel',qty:'1',price:'40',days:'0',hours:'0',note:''}});
 assert.equal(savedSettings.length,1);

 module.namespace.testPurchaseDialog();assert.ok(node('#dialog').innerHTML.includes('list="shop-suggestions"'));assert.ok(node('#dialog').innerHTML.includes('<option value="Test">'));
 await node('#modal-form').onsubmit({preventDefault(){},target:{date:'2026-10-09',shop:' Nowy Sklep ',amount:'10',charge:'12',description:'Testowy zakup',invoice:'',paid:'on'}});
 assert.ok(savedSettings.at(-1).payload.shops.includes('Nowy Sklep'));
 assert.ok(module.namespace.testShops().includes('Nowy Sklep'));
 const persistent=savedSettings.at(-1).payload;
 module.namespace.testRender(row,persistent);assert.ok(module.namespace.testShops().includes('Nowy Sklep'));
 module.namespace.testPdfChooser();
 assert.equal((node('#dialog').innerHTML.match(/name="pdfModule"/g)||[]).length,PDF.MODULES.length);
 await node('#modal-form').onsubmit({preventDefault(){},target:{pdfModule:['data','rooms']}});
 assert.ok(printedHtml.includes('data-module="data"'));assert.ok(printedHtml.includes('data-module="rooms"'));assert.ok(!printedHtml.includes('data-module="offer"'));
 // Shared custom work persists once and is available to the next investment.
 module.namespace.testRender(row,{catalog:structuredClone(catalog),markup:35,company:{}});
 module.namespace.testLineDialog();
 await node('#modal-form').onsubmit({preventDefault(){},target:{serviceId:'__custom__',roomId:'r',category:'Nowa kategoria',name:'Nowa wspólna usługa',unit:'m²',qty:'2',price:'135',days:'0',hours:'0',note:''}});
 const custom=module.namespace.testConfig().payload.catalog.find(item=>item.name==='Nowa wspólna usługa');
 assert.ok(custom);assert.equal(custom.base,100);assert.equal(module.namespace.testOffer().at(-1).serviceId,custom.id);
 const shared=structuredClone(module.namespace.testConfig().payload);
 const captured=C.captureCatalog(shared,row.payload);const existingRow={...row,payload:captured};
 assert.ok(module.namespace.testSelected(existingRow).includes('data-field="markup"'));
 listeners.get('input')({target:numeric('50',{field:'markup'})});
 module.namespace.testLineDialog();
 const selectedRadio=radios[0];selectedRadio.checked=true;selectedRadio.onchange();
 assert.equal(node('#f-price').value,C.round(shared.catalog[0].base*1.5));assert.equal(module.namespace.testConfig().payload.markup,35);
 // Master correction persists with preview, history and undo, retaining old project snapshots.
 module.namespace.testRender(existingRow,shared);module.namespace.testCorrection();
 assert.ok(node('#dialog').innerHTML.includes('Zastosuj do całego cennika'));assert.equal(node('#dialog').className,'correction-modal');assert.ok(node('#dialog').innerHTML.includes('<div class="modal-body">'));assert.equal(context.document.body.style.position,'fixed');assert.equal(context.document.body.style.top,'-420px');assert.equal(context.document.documentElement.style.overflow,'hidden');
 node('#f-percent').value='5';node('#f-percent').oninput();
 assert.ok(node('#correction-preview').innerHTML.includes('Nowa cena bazowa'));
 await node('#modal-form').onsubmit({preventDefault(){},target:{percent:'5',reason:'Test korekty'}});
 assert.equal(context.document.body.style.position,'');assert.equal(context.document.documentElement.style.overflow,'');const correctedConfig=module.namespace.testConfig();assert.equal(correctedConfig.payload.catalog.find(item=>item.id===custom.id).base,105);
 assert.ok(module.namespace.testCatalog().includes('Historia korekt cennika'));
 assert.equal(C.projectCatalog(correctedConfig.payload,captured).find(item=>item.id===custom.id).base,100);
 await module.namespace.testUndo();assert.equal(module.namespace.testConfig().payload.catalog.find(item=>item.id===custom.id).base,100);
 assert.ok(module.namespace.testConfig().payload.catalogCorrections.at(-1).undoneAt);
 module.namespace.testRender(row,shared);module.namespace.testCorrection();node('#dialog').oncancel();assert.equal(context.document.body.style.position,'');assert.equal(context.document.documentElement.style.overflow,'');module.namespace.testCorrection();await listeners.get('click')({target:{closest:()=>({dataset:{action:'close'}})}});assert.equal(context.document.body.style.position,'');
 assert.ok(module.namespace.testProjectRows().includes('data-action="project-delete"'));
 confirmDelete=false;await module.namespace.testDelete('p');assert.equal(deletions.length,0);assert.equal(module.namespace.testProjects().length,1);
 assert.ok(confirmation.includes(row.contract_number)&&confirmation.includes(row.payload.name));
 confirmDelete=true;deleteFails=true;await assert.rejects(module.namespace.testDelete('p'),/Brak połączenia/);assert.equal(module.namespace.testProjects().length,1);
 deleteFails=false;await module.namespace.testDelete('p');assert.equal(module.namespace.testProjects().length,0);assert.equal(deletions.at(-1).revision,1);
});
