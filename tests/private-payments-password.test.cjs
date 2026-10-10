const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/priv/ui.js','utf8');
const reader=source.slice(source.indexOf('async function readPdf('),source.indexOf('\nasync function preview('));
function harness(protectedPdf,passwords,initialPassword=''){let promptCount=0,destroyCount=0;const reasons=[];const doc={numPages:1,getPage:async()=>({getTextContent:async()=>({items:[]})}),destroy:async()=>destroyCount++};
 const context={Uint8Array,Promise,Error,notice(){},P:{rowsFromItems:i=>i,parsePages:()=>({ok:true})},requestPdfPassword:async(name,incorrect)=>{promptCount++;reasons.push({name,incorrect});const result=passwords.shift();if(result instanceof Error)throw result;return result;},pdfLib:{GlobalWorkerOptions:{},PasswordResponses:{INCORRECT_PASSWORD:2},getDocument(options){let resolve;const task={promise:new Promise(r=>resolve=r),destroy:async()=>destroyCount++};queueMicrotask(()=>{if(!protectedPdf||options.password==='correct')resolve(doc);else{const update=value=>{if(value==='correct')resolve(doc);else queueMicrotask(()=>task.onPassword(update,2));};task.onPassword(update,options.password?2:1);}});return task;}}};vm.createContext(context);vm.runInContext(reader,context);return {read:()=>context.readPdf({name:'Bank.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(2)},initialPassword),prompts:()=>promptCount,reasons,destroys:()=>destroyCount};}
test('encrypted file asks again after wrong password then reads',async()=>{const h=harness(true,['wrong','correct']);assert.equal((await h.read()).ok,true);assert.equal(h.prompts(),2);assert.equal(h.reasons[0].incorrect,false);assert.equal(h.reasons[1].incorrect,true);assert.equal(h.destroys(),1);});
test('cancel aborts waiting reader without hanging or importing data',async()=>{const h=harness(true,[Error('Anulowano odczyt wyciągu.')]);await assert.rejects(h.read(),/Anulowano/);assert.ok(h.destroys()>=1);});
test('plaintext file reads without password prompt',async()=>{const h=harness(false,[]);assert.equal((await h.read()).ok,true);assert.equal(h.prompts(),0);});
test('password dialog clears entered password and supports cancellation',async()=>{
 const fn=source.slice(source.indexOf('function requestPdfPassword('),source.indexOf('\nasync function readPdf('));
 const controls=new Map();const context={Promise,Error,key:{},state:{},passwordPromptCancel:null,escape:s=>s,modal(){for(const id of ['pdfPassword','pdfPasswordForm','cancelPdfPassword','modal','modalBody','modalFoot'])controls.set(id,{value:'',focus(){},close(){},replaceChildren(){}});},$:id=>controls.get(id)};vm.createContext(context);vm.runInContext(fn,context);
 const pending=context.requestPdfPassword('Bank.pdf');controls.get('pdfPassword').value='bank-secret';controls.get('pdfPasswordForm').onsubmit({preventDefault(){}});assert.equal(await pending,'bank-secret');assert.equal(controls.get('pdfPassword').value,'');assert.equal(context.passwordPromptCancel,null);
 const cancelled=context.requestPdfPassword('Bank.pdf');context.passwordPromptCancel();await assert.rejects(cancelled,/Anulowano/);assert.equal(controls.get('pdfPassword').value,'');
 context.key=null;await assert.rejects(context.requestPdfPassword('Bank.pdf'),/zablokowane/);
});

test('password supplied at file selection opens protected PDF without an extra dialog',async()=>{
 const h=harness(true,[],'correct');assert.equal((await h.read()).ok,true);assert.equal(h.prompts(),0);assert.equal(h.destroys(),1);
});
test('wrong supplied password asks for correction and still imports',async()=>{
 const h=harness(true,['correct'],'wrong');assert.equal((await h.read()).ok,true);assert.equal(h.prompts(),1);assert.equal(h.reasons[0].incorrect,true);
});
test('optional supplied password does not prevent reading a plain PDF',async()=>{
 const h=harness(false,[],'correct');assert.equal((await h.read()).ok,true);assert.equal(h.prompts(),0);
});
test('selection form passes password only to reader, clears input and retains import mode',()=>{
 const selection=source.slice(source.indexOf("function choosePdf(mode="),source.indexOf('\nfunction handlePdfFiles('));
 const controls=new Map(),calls=[];
 const c=vm.createContext({busy:false,importInFlight:false,key:{},state:{rules:[{}]},importMode:'history',modal(title,body){for(const id of ['statementImportForm','statementPdf','statementPassword'])controls.set(id,{value:'',files:[]});},$:id=>controls.get(id),close(){},handlePdfFiles(...args){calls.push(args);}});
 vm.runInContext(selection,c);c.choosePdf();const file={name:'protected.pdf'};controls.get('statementPdf').files=[file];controls.get('statementPassword').value='ephemeral';controls.get('statementImportForm').onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0][0][0],file);assert.equal(calls[0][1],'history');assert.equal(calls[0][2],'ephemeral');assert.equal(controls.get('statementPassword').value,'');assert.equal(controls.get('statementPdf').value,'');
 c.showContractorUpload();assert.equal(c.importMode,'contractors');
 c.key=null;c.choosePdf();assert.equal(calls.length,1);
});
