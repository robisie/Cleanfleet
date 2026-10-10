const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/priv/ui.js'),'utf8');
function functionSource(name,next){return source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'('));}
function setup(){
 const elements=new Map(),events=[],rules=[{id:'r1',name:'Existing'}];
 const $=name=>{if(!elements.has(name))elements.set(name,{value:'',files:[],disabled:false,insertAdjacentHTML(){}});return elements.get(name);};
 const context={$,state:{rules},structuredClone,readRules:()=>rules,ruleHtml:()=>'',bindRuleActions(){},id:()=>'',today:()=>'',key:{},busy:false,importInFlight:false,importMode:'history',modal:(title,body)=>events.push({title,body}),close:()=>events.push({closed:true}),persist:async(next)=>{await Promise.resolve();events.push({saved:next});},action:fn=>fn(),preview:async(files,password)=>events.push({files,password,mode:context.importMode})};
 vm.createContext(context);vm.runInContext(functionSource('editList','showMonth')+functionSource('choosePdf','requestPdfPassword'),context);
 return {context,$,events};
}
test('saving the list opens a visible upload step instead of a delayed native chooser',async()=>{
 const {context,$,events}=setup();context.editList();await $('importFromList').onclick();const saved=events.findIndex(e=>e.saved),upload=events.findIndex(e=>e.title==='Zaczytaj wyciąg');assert.ok(saved>=0&&upload>saved);assert.match(events[upload].body,/id="statementPdf" type="file"/);assert.doesNotMatch(events[upload].body,/hidden/);
 const file={name:'March.pdf'};$('statementPdf').files=[file];$('statementPdf').value='March.pdf';$('statementPassword').value='bank-secret';$('statementImportForm').onsubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal($('statementPdf').value,'');assert.equal(events.find(e=>e.files).mode,'contractors');assert.equal(events.find(e=>e.files).files[0],file);assert.equal(events.find(e=>e.files).password,'bank-secret');assert.equal($('statementPassword').value,'');assert.equal($('editList').disabled,false);
});
test('cancelling the file picker keeps the upload step and does not import',async()=>{const {context,$,events}=setup();context.showContractorUpload();$('statementImportForm').onsubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(events.some(e=>e.files),false);assert.equal(events.some(e=>e.closed),false);});
