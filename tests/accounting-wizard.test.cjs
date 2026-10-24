const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Zip=require('../app/vendor/jszip-3.10.1.min.js'),pack=require('../app/accounting-package.js');
function harness(){
 const nodes=new Map(),downloads=[],calls=[];let failKsef=false,failPassword=false,slowKsef=null;
 const node=()=>({value:'',textContent:'',dataset:{},style:{},hidden:false,disabled:false,classList:{toggle(){},add(){},remove(){}},replaceChildren(){},focus(){},click(){downloads.push(this.download);},remove(){}});
 const source=fs.readFileSync('app/accounting-documents-v1510.js','utf8');
 for(const match of source.matchAll(/id="([^"]+)"/g))nodes.set(match[1],node());
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};get('cfAccountingMonth').value='2026-09';get('cfKsefEnvironment').value='production';get('cfKsefNip').value='6351861297';get('cfAccountingBankNumber').value='9';get('cfAccountingBankEncoding').value='utf-8';
 let selected=1;const checks=[{get checked(){return Boolean(selected)},set checked(v){selected=v?1:0}}];
 const result={rows:[{kind:'review',currency:'PLN',operation:{booked:'2026-09-02',party:'Test <firma>',title:'FV/1',amount:-12000n},reason:'Brak faktury'}],warnings:['Brak historii'],unmatchedInvoices:[],counts:{}};
 const context={AbortController,DOMException,Blob,TextEncoder,crypto,Uint8Array,setTimeout(){},URL:{createObjectURL(){return 'blob:zip'},revokeObjectURL(){}},document:{readyState:'loading',addEventListener(){},getElementById:get,querySelectorAll:()=>checks,createElement:node,body:{appendChild(){}}},window:{cfBackupBridge:{isAdmin:()=>true,getClient:()=>({})},JSZip:Zip,CFAccountingHistory:{load:async()=>({snapshots:[],expected:[]})},CFAccountingDecisions:{load:async()=>({userId:'test',records:[]}),restore(){}},CFAccountingReconcile:{reconcile:()=>result,render(){calls.push('review')},attachmentFiles:()=>[],money:amount=>(Number(amount)/100).toFixed(2)},CFAccountingMail:{isBusy:()=>false,open:async()=>{calls.push('mail-config');return true},search:async()=>{calls.push('mail-search');return true},getState:()=>({selected,found:1}),prepareFiles:async()=>{calls.push('mail-prepare');if(failPassword)throw new Error('Sprawdź hasło PDF');return []},exportFiles:async()=>[],close(){calls.push('mail-close')}},CFAccountingPackage:{build:async data=>{calls.push('zip');assert.match(data.reviewReport,/Wyjaśnienia/);return pack.build(data,Zip)}}}};
 vm.createContext(context);
 const injected=`globalThis.h={wizardBegin,wizardNext,wizardSkip,wizardExit,wizardReport,wizardFindDuplicates,invalidateReview,get:()=>({active:wizardActive,step:wizardStep,busy:wizardBusy}),sources:()=>({bankFiles,bankResults,ksefResults}),setBank:()=>{bankFiles=[{}];bankResults=[{month:'2026-09',filename:'bank.txt',bytes:new Uint8Array([1])}]},setFiles:files=>selectedFiles.organizer=files,setKsef:fn=>startKsef=fn};})();`;
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,injected),context);
 context.h.setKsef(async()=>{calls.push('ksef');if(slowKsef)await slowKsef;if(failKsef){get('cfKsefStatus').textContent='KSeF niedostępny';return false}vm.runInContext("ksefResults={purchases:{month:'2026-09',count:0},sales:{month:'2026-09',count:0}}",context);return true});
 return {h:context.h,nodes,get,calls,downloads,context,result,failKsef:v=>failKsef=v,failPassword:v=>failPassword=v,slowKsef:v=>slowKsef=v};
}
test('wizard drives month → KSeF → bank → mail → review → ZIP and keeps manual sources',async()=>{
 const t=harness();t.h.wizardBegin();assert.equal(t.h.get().step,0);assert(t.get('cfAccountingAllActions').hidden);
 await t.h.wizardNext();assert.equal(t.h.get().step,2);assert(t.get('cfAccountingKsefSource').hidden);assert(!t.get('cfAccountingBankSource').hidden);
 await t.h.wizardNext();assert.equal(t.h.get().step,2);assert.match(t.get('cfAccountingWizardStatus').textContent,/Wybierz pliki CSV/);
 t.h.setBank();await t.h.wizardNext();assert.equal(t.h.get().step,3);assert.deepEqual(t.calls,['ksef','mail-config','mail-search']);
 t.failPassword(true);await t.h.wizardNext();assert.equal(t.h.get().step,3);assert.match(t.get('cfAccountingWizardStatus').textContent,/hasło PDF/);assert.equal(t.h.get().busy,false);
 t.failPassword(false);await t.h.wizardNext();assert.equal(t.h.get().step,4);assert.equal(t.downloads.length,0);
 await t.h.wizardNext();assert.equal(t.h.get().step,5);assert.match(t.get('cfAccountingWizardSummary').textContent,/wymagające uwagi: 1/);
 t.get('cfAccountingWizardNotes').value='FV/1 zostanie dosłana';await t.h.wizardNext();assert.deepEqual(t.downloads,['Dokumenty-2026-09.zip']);assert.match(t.h.wizardReport(),/FV\/1 zostanie dosłana/);
 t.h.wizardExit();assert.equal(t.h.get().active,false);assert.equal(t.get('cfAccountingBankSource').hidden,false);assert.equal(t.get('cfAccountingAllActions').hidden,false);assert.equal(t.h.sources().bankFiles.length,1);
});
test('failed KSeF stays retryable, skip is explicit, stale review blocks export',async()=>{
 const t=harness();t.h.wizardBegin();t.failKsef(true);await t.h.wizardNext();assert.equal(t.h.get().step,1);assert.match(t.get('cfAccountingWizardStatus').textContent,/niedostępny/);
 t.failKsef(false);await t.h.wizardNext();await t.h.wizardSkip();assert.equal(t.h.get().step,3);await t.h.wizardSkip();assert.equal(t.h.get().step,4);await t.h.wizardNext();assert.equal(t.h.get().step,5);assert.match(t.h.wizardReport(),/mBank CSV, Poczta/);
 t.h.invalidateReview();await t.h.wizardNext();assert.equal(t.h.get().step,4);assert.equal(t.downloads.length,0);assert.match(t.get('cfAccountingWizardStatus').textContent,/Dane zmieniły/);
});
test('leaving a running wizard prevents late KSeF completion from changing its step',async()=>{
 const t=harness();let resolve;t.slowKsef(new Promise(r=>resolve=r));t.h.wizardBegin();const pending=t.h.wizardNext();await new Promise(r=>setImmediate(r));assert(t.h.get().busy);t.h.wizardExit();resolve();await pending;assert.equal(t.h.get().active,false);assert.equal(t.h.get().step,1);assert.equal(t.h.get().busy,false);assert(!t.get('cfAccountingInputs').disabled);
});
test('duplicate inspection compares bytes rather than filenames and never drops a file',async()=>{
 const t=harness();const files=[{name:'one.pdf',arrayBuffer:async()=>new TextEncoder().encode('same').buffer},{name:'different-name.pdf',arrayBuffer:async()=>new TextEncoder().encode('same').buffer},{name:'one.pdf',arrayBuffer:async()=>new TextEncoder().encode('different').buffer}];t.h.setFiles(files);
 const duplicates=await t.h.wizardFindDuplicates(new AbortController().signal);assert.equal(duplicates.length,1);assert.match(duplicates[0],/different-name.pdf.*one.pdf/);
 const controller=new AbortController();controller.abort();await assert.rejects(t.h.wizardFindDuplicates(controller.signal),{name:'AbortError'});
});
test('monthly package optionally contains the exact review report',async()=>{
 const text='Miesiąc 2026-09\nDo wyjaśnienia: dokument FV/1';const result=await pack.build({month:'2026-09',reviewReport:text},Zip);const zip=await Zip.loadAsync(result.bytes);assert.equal(await zip.file('9 WRZESIEŃ/Kontrola-dokumentow.txt').async('string'),text);
});
