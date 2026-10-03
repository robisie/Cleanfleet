const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/priv/ui.js'),'utf8');
function functionSource(name,next){return source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'('));}
function setup(){
 const elements=new Map(),events=[],rules=[{id:'r1',name:'Existing'}];
 const $=name=>{if(!elements.has(name))elements.set(name,{value:'',files:[],disabled:false,insertAdjacentHTML(){}});return elements.get(name);};
 const context={$,state:{rules},structuredClone,readRules:()=>rules,ruleHtml:()=>'',bindRuleActions(){},id:()=>'',today:()=>'',busy:false,importInFlight:false,importMode:'history',modal:(title,body)=>events.push({title,body}),close:()=>events.push({closed:true}),persist:async(next)=>{await Promise.resolve();events.push({saved:next});},action:fn=>fn(),preview:async files=>events.push({files,mode:context.importMode}),choosePdf:()=>{throw Error('Delayed native chooser must not be used');}};
 vm.createContext(context);vm.runInContext(functionSource('editList','showMonth')+functionSource('showContractorUpload','requestPdfPassword'),context);
 return {context,$,events};
}
test('saving the list opens a visible upload step instead of a delayed native chooser',async()=>{
 const {context,$,events}=setup();context.editList();await $('importFromList').onclick();const saved=events.findIndex(e=>e.saved),upload=events.findIndex(e=>e.title==='Dodaj pozycje z wyciągu');assert.ok(saved>=0&&upload>saved);assert.match(events[upload].body,/id="contractorPdf" type="file"/);assert.doesNotMatch(events[upload].body,/hidden/);
 const file={name:'March.pdf'};$('contractorPdf').files=[file];$('contractorPdf').value='March.pdf';$('contractorPdf').onchange();await new Promise(setImmediate);assert.equal($('contractorPdf').value,'');assert.equal(events.find(e=>e.files).mode,'contractors');assert.equal(events.find(e=>e.files).files[0],file);assert.equal($('editList').disabled,false);
});
test('cancelling the file picker keeps the upload step and does not import',async()=>{const {context,$,events}=setup();context.showContractorUpload();$('contractorPdf').onchange();await new Promise(setImmediate);assert.equal(events.some(e=>e.files),false);assert.equal(events.some(e=>e.closed),false);});
