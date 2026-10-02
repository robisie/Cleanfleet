const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const history=require('../app/accounting-history.js');
function harness(){
 const elements=new Map();
 for(const id of ['Nip','Token','Environment','Start','Save','Cancel','Status','HistoryYear','HistoryStatus','HistoryRetry','purchases','sales'])elements.set('cfKsef'+id,{value:'',dataset:{saved:'false'},disabled:false,hidden:true});
 elements.set('cfAccountingMonth',{value:'2026-09'});elements.get('cfKsefNip').value='6351861297';elements.get('cfKsefEnvironment').value='production';elements.get('cfKsefToken').value='token';
 const saved=new Map(),calls=[],pdf=new Blob(['pdf']),fail={month:null,saveMonth:null},cancels={month:null};let admin=true;
 const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-02T18:00:00Z']));}};
 const context={Date:FixedDate,AbortController,DOMException,Blob,setTimeout,clearTimeout,document:{readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id)},window:{cfBackupBridge:{isAdmin:()=>admin,getClient:()=>({})},CFAccountingHistory:{...history,yearMonths:month=>history.yearMonths(month,new FixedDate()),loadMonths:async()=>({snapshots:[...saved.keys()].map(month=>({month,updated_at:'2026-10-02T18:43:12.475Z'}))}),save:async(client,scope,invoices,signal)=>{if(signal.aborted)throw new DOMException('Anulowano','AbortError');if(scope.month===fail.saveMonth)throw new Error('zapis odrzucony');saved.set(scope.month,invoices);return invoices.length;}}}};
 vm.createContext(context);
 const source=fs.readFileSync(require.resolve('../app/accounting-documents-v1510.js'),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.harness={startKsef,fillHistoryYear,downloadKsefJob,setFetch:fn=>fetchKsefMonth=fn,cancel:()=>ksefRun?.abort(),getResults:()=>ksefResults};})();');
 vm.runInContext(source,context);
 context.harness.setFetch(async(credentials,signal,historyOnly)=>{
  calls.push({month:credentials.month,historyOnly});
  if(credentials.month===fail.month)throw new Error('KSeF niedostępny');
  if(credentials.month===cancels.month){context.harness.cancel();throw new DOMException('Anulowano','AbortError');}
  return {purchases:{count:1,invoices:[{number:'FV/'+credentials.month}],...(historyOnly?{}:{blob:pdf})},...(historyOnly?{}:{sales:{count:1,blob:pdf}})};
 });
 return {...context.harness,runtime:context,elements,saved,calls,fail,cancels,pdf,token:()=>elements.get('cfKsefToken').value='token',revoke:()=>admin=false};
}
test('year fills missing months, resumes after failure, refreshes current month and keeps monthly ZIP',async()=>{
 const h=harness();await h.startKsef({preventDefault(){}});const current=h.getResults();h.calls.length=0;h.saved.set('2026-01',[]);h.saved.set('2026-02',[]);h.fail.month='2026-05';h.token();await h.fillHistoryYear();
 assert.deepEqual(h.calls.map(c=>c.month),['2026-03','2026-04','2026-05']);assert.ok(h.saved.has('2026-04'));assert.ok(!h.saved.has('2026-05'));assert.match(h.elements.get('cfKsefStatus').textContent,/Nie ukończono.*2026-05/);assert.equal(h.getResults(),current);assert.equal(h.elements.get('cfAccountingMonth').value,'2026-09');
 h.fail.month=null;h.calls.length=0;h.token();await h.fillHistoryYear();assert.deepEqual(h.calls.map(c=>c.month),['2026-05','2026-10']);assert.ok(h.calls.every(c=>c.historyOnly));assert.equal(h.saved.size,10);assert.equal(h.getResults(),current);assert.match(h.elements.get('cfKsefStatus').textContent,/Gotowe.*10 miesięcy/);
 h.calls.length=0;h.token();await h.fillHistoryYear();assert.deepEqual(h.calls.map(c=>c.month),['2026-10']);
});
test('monthly refresh spans year boundary and retains selected PDFs when history fails',async()=>{
 const h=harness();h.elements.get('cfAccountingMonth').value='2026-01';h.fail.month='2025-11';await h.startKsef({preventDefault(){}});
 assert.deepEqual(h.calls.map(c=>c.month),['2026-01','2025-12','2025-11']);assert.deepEqual(h.calls.map(c=>c.historyOnly),[undefined,true,true]);assert.equal(h.getResults().purchases.month,'2026-01');assert.equal(h.getResults().purchases.blob,h.pdf);assert.ok(h.saved.has('2025-12'));assert.match(h.elements.get('cfKsefHistoryStatus').textContent,/Nie odświeżono całej historii/);assert.equal(h.elements.get('cfAccountingMonth').disabled,false);
});
test('year cancellation retains completed snapshots and restores controls; save failure is not marked completed',async()=>{
 const h=harness();h.cancels.month='2026-03';await h.fillHistoryYear();assert.deepEqual([...h.saved.keys()],['2026-01','2026-02']);assert.match(h.elements.get('cfKsefStatus').textContent,/anulowane/);assert.equal(h.elements.get('cfKsefHistoryYear').disabled,false);
 h.cancels.month=null;h.fail.saveMonth='2026-03';h.token();await h.fillHistoryYear();assert.ok(!h.saved.has('2026-03'));assert.match(h.elements.get('cfKsefStatus').textContent,/zapis odrzucony/);
});
test('failed current history save remains visible even when older history refresh succeeds',async()=>{
 const h=harness();h.fail.saveMonth='2026-09';await h.startKsef({preventDefault(){}});assert.ok(!h.saved.has('2026-09'));assert.match(h.elements.get('cfKsefHistoryStatus').textContent,/historia nie została zapisana.*Odświeżono/);assert.equal(h.elements.get('cfKsefHistoryRetry').hidden,false);
});
test('history-only export decrypts and verifies original archive, reads XML without producing PDFs',async()=>{
 const h=harness(),r=h.runtime,bytes=new TextEncoder().encode('verified zip'),key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(16));
 const aes=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']),encrypted=await crypto.subtle.encrypt({name:'AES-CBC',iv},aes,bytes),b64=value=>Buffer.from(value).toString('base64');
 Object.assign(r,{crypto,Uint8Array,atob,btoa,CF_SUPABASE_URL:'https://example.supabase.co',CF_SUPABASE_KEY:'publishable',fetch:async()=>new Response(encrypted)});
 r.window.cfBackupBridge.getClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-jwt'}}})}});
 let parsed=0;r.window.CFKsefPDF={convert:()=>{throw new Error('PDF conversion must not run');},invoiceData:(xml,name)=>{assert.equal(name,'invoice.xml');assert.equal(new TextDecoder().decode(xml),'source xml');parsed++;return {number:'FV/1'};}};
 r.window.JSZip={loadAsync:async plain=>{assert.equal(new TextDecoder().decode(plain),'verified zip');return {files:{'invoice.xml':{dir:false,name:'invoice.xml',async:async()=>new TextEncoder().encode('source xml')}}};}};
 const job={key:b64(key),iv:b64(iv)},ready={invoiceCount:1,size:bytes.length,parts:[{ticket:'test-ticket',partSize:bytes.length,partHash:b64(await crypto.subtle.digest('SHA-256',bytes))}]};
 const result=await h.downloadKsefJob(job,ready,new AbortController().signal,'historia',true);assert.equal(result.count,1);assert.equal(result.blob,undefined);assert.equal(parsed,1);
 ready.parts[0].partHash='bad';await assert.rejects(h.downloadKsefJob(job,ready,new AbortController().signal,'historia',true),/zweryfikować/);assert.equal(parsed,1);
});
