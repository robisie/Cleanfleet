import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../app/robisie/api.js',import.meta.url),'utf8');
async function api(fetch,session={access_token:'test',expires_at:9999999999},timeout=false){const storage=new Map([['robisie-auth-session-v1',JSON.stringify(session)]]);const context=vm.createContext({fetch,AbortController,structuredClone,clearTimeout,setTimeout:timeout?(fn)=>setTimeout(fn,20):setTimeout,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});const mod=new vm.SourceTextModule(source,{context});await mod.link(()=>{});await mod.evaluate();mod.namespace.restoreSession();return mod.namespace;}
const response=value=>({ok:true,text:async()=>JSON.stringify(value)});
test('Towar uses Robisię session for inventory reads, returns and project allocation',async()=>{
 const calls=[],changed=[],savedProject={id:'p',revision:2,payload:{name:'Remont',purchases:[]}};
 const a=await api(async(url,options)=>{calls.push({url,headers:options.headers,args:JSON.parse(options.body||'{}')});return response(url.endsWith('/rs_allocate_ksef_purchase')?{project:savedProject,link:{ksef_number:'ksef'}}:[]);});
 const integration=a.stockIntegration([{id:'p',payload:{name:'Remont'},contract_number:'UUR/1'}],row=>changed.push(row));
 assert.equal(integration.projects[0].name,'Remont');assert.equal(integration.projects[0].number,'UUR/1');
 await integration.stock();await integration.setReturn({number:'ksef',index:1,quantity:2,revision:3});
 await integration.setUse({number:'ksef',index:1,category:'auto',quantity:1.5,revision:0});
 await integration.setInvoiceUse({number:'ksef',category:'firmowe',indices:[1,2]});
 const link=await integration.assign({project:'p',number:'ksef',xml:'verified',entries:[{index:1,quantity:1}],projectRevision:1});
 assert.equal(link.ksef_number,'ksef');assert.equal(changed[0].revision,2);
 assert.ok(calls[0].url.endsWith('/rs_ksef_stock'));assert.deepEqual(calls[1].args,{p_number:'ksef',p_index:1,p_quantity:2,p_revision:3});
 assert.ok(calls[2].url.endsWith('/rs_ksef_set_use'));assert.deepEqual(calls[2].args,{p_number:'ksef',p_index:1,p_category:'auto',p_quantity:1.5,p_revision:0});
 assert.ok(calls[3].url.endsWith('/rs_ksef_set_invoice_use'));assert.deepEqual(calls[3].args,{p_number:'ksef',p_category:'firmowe',p_expected_indices:[1,2]});
 assert.equal(calls[4].args.p_project,'p');assert.equal(calls[4].args.p_entries[0].quantity,1);
 assert.equal(typeof integration.cfContext,'function');assert.equal(typeof integration.cfCompanies,'function');assert.equal(typeof integration.cfSave,'function');
 assert.ok(calls.every(c=>c.headers.Authorization==='Bearer test'));
});
test('leaving Towar cancels a KSeF request using the Robisię transport',async()=>{
 let cancelled=false;const a=await api((url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled=true;reject(new Error('aborted'));},{once:true})));
 const controller=new AbortController(),pending=a.ksefCall({action:'ksef-list'},{signal:controller.signal});controller.abort();await assert.rejects(pending,/aborted/);assert.equal(cancelled,true);
});
test('quantity editor submits amounts, quantities and the document version in one transaction',async()=>{
 let args,url;const a=await api(async(u,o)=>{url=u;args=JSON.parse(o.body);return response({project:{id:'p',revision:3,payload:{}}});});
 const payload={purchases:[{id:'buy',sourceKsefNumber:'number',amount:180,charge:220}]},link={ksef_number:'number',document:{selectedQuantities:[{index:1,quantity:2,gross:200}]}},entries=[{index:1,quantity:1.5,gross:150}];
 const row=await a.savePurchaseAllocation({id:'p',revision:2},payload,link,entries,null);
 assert.ok(url.endsWith('/rs_allocate_ksef_purchase'));assert.equal(row.revision,3);assert.deepEqual(args,{p_project:'p',p_number:'number',p_xml:null,p_entries:entries,p_revision:2,p_expected_document:link.document,p_payload:payload});
});
test('lost quantity-save response is confirmed by reading the whole saved project',async()=>{
 const entries=[{index:1,quantity:2,gross:200}],payload={purchases:[{id:'buy',sourceKsefNumber:'number',selectedKsefQuantities:entries,amount:180,charge:220,description:'Farba 2 szt.'}]},calls=[];
 const a=await api(async(u,o={})=>{calls.push(o.method||'GET');if(o.method==='POST')throw new TypeError('lost response');return response([{id:'p',revision:3,payload}]);});
 const row=await a.savePurchaseAllocation({id:'p',revision:2},payload,{ksef_number:'number',document:{}},entries,null);assert.equal(row.revision,3);assert.deepEqual(calls,['POST','GET']);
});
test('completion submits only the saved revision and does not add earnings',async()=>{
 let url,args;const a=await api(async(u,o)=>{url=u;args=JSON.parse(o.body);return response({id:'p',revision:8,payload:{status:'zakonczona'}});});
 const row=await a.finishProject({id:'p',revision:7});
 assert.ok(url.endsWith('/rs_finish_project'));
 assert.deepEqual(args,{p_id:'p',p_revision:7});assert.equal(row.payload.status,'zakonczona');
});
test('small edit sends only changed fields and reconstructs the confirmed full project from metadata',async()=>{
 let args,url;const a=await api(async(u,o)=>{url=u;args=JSON.parse(o.body);return response({id:'p',revision:2,updated_at:'now'});});
 const before={name:'A',catalog:'x'.repeat(100000),works:[{id:'l',qty:2}]},after={...before,name:'B',_undo:{savedAt:'stamp',payload:before}};
 const row=await a.saveProject({id:'p',contract_number:'UUR',revision:1,payload:before},after);assert.ok(url.endsWith('/rs_save_project_fast'));assert.deepEqual(JSON.parse(JSON.stringify(args.p_fields)),{name:'B'});assert.ok(JSON.stringify(args).length<250);assert.equal(row.revision,2);assert.equal(row.contract_number,'UUR');assert.deepEqual(row.payload,after);
});
test('field removals and settings updates do not resend unchanged catalog or full undo',async()=>{
 let args;const a=await api(async(u,o)=>{args=JSON.parse(o.body);return response({revision:3});});const before={company:{name:'A'},catalog:'big',obsolete:1},after={company:{name:'B'},catalog:'big'};
 await a.saveSettings(after,2,before);assert.deepEqual(args.p_fields,{company:{name:'B'}});assert.deepEqual(args.p_remove_keys,['obsolete']);assert.equal(args.p_undo_saved_at,null);
});
test('lost write response is confirmed with one read instead of duplicate write',async()=>{
 const calls=[],payload={name:'B'},before={id:'p',revision:1,payload:{name:'A'}};const a=await api(async(u,o)=>{calls.push(o.method||'GET');if(o.method==='POST')throw new TypeError('Disconnected');return response([{id:'p',revision:2,payload}]);});const row=await a.saveProject(before,payload);assert.equal(row.revision,2);assert.deepEqual(calls,['POST','GET']);
});
test('timeout frees the request; unmatched server state is never accepted as saved',async()=>{
 const a=await api(async(u,o)=>o.method==='POST'?new Promise(()=>{}):response([{id:'p',revision:2,payload:{name:'OTHER'}}]),undefined,true);await assert.rejects(a.saveProject({id:'p',revision:1,payload:{name:'A'}},{name:'B'}));
});
test('concurrent requests share one token refresh',async()=>{
 let refresh=0;const a=await api(async(u)=>{if(u.includes('/auth/')){refresh++;await new Promise(resolve=>setTimeout(resolve,10));return response({access_token:'new',expires_in:3600});}return response([]);},{access_token:'old',refresh_token:'refresh',expires_at:1});await Promise.all([a.projects(),a.settings()]);assert.equal(refresh,1);
});
test('investment invoice list merges external KSeF documents without duplicating Bill invoices',async()=>{
 const existing={id:'bill',ksef_number:'K1'},external={id:'external',ksef_number:'K2',originKind:'sales'},purchase={id:'purchase',ksef_number:'K3',originKind:'purchases'};
 const a=await api(async u=>response(u.includes('rs_ksef_links')?[{document:{id:'duplicate',ksef_number:'K1'}},{document:external},{document:purchase}]:[existing]));
 const rows=await a.stageInvoices('project');assert.deepEqual(Array.from(rows,r=>r.id),['bill','external','purchase']);
});
test('purchase form sends selection, form snapshot and revision together',async()=>{
 let body,url;const payload={purchases:[{id:'item',amount:54,selectedKsefRows:[2]}]},a=await api(async(u,o)=>{url=u;body=JSON.parse(o.body);return response({id:'p',revision:4,payload});});
 await a.savePurchaseKsef({id:'p',revision:2},payload,{ksef_number:'number',document:{selectedIndices:[1,3]}},[2],'<Faktura/>');
 assert.ok(url.endsWith('/rs_save_purchase_ksef_form'));assert.equal(body.p_revision,2);assert.deepEqual(body.p_indices,[2]);assert.deepEqual(body.p_expected_indices,[1,3]);assert.deepEqual(body.p_payload,payload);
});
test('lost purchase form response is confirmed with a read, without repeating the write',async()=>{
 const payload={purchases:[{id:'item',amount:54,selectedKsefRows:[2]}]},calls=[];
 const a=await api(async(u,o)=>{calls.push(o.method||'GET');if(o.method==='POST')throw new TypeError('Disconnected');return response([{id:'p',revision:4,payload}]);});
 const row=await a.savePurchaseKsef({id:'p',revision:2},payload,{ksef_number:'number',document:{selectedIndices:[1]}},[2],'<Faktura/>');assert.equal(row.revision,4);assert.deepEqual(calls,['POST','GET']);
});
test('combined KSeF item and payment save uses the settlement transaction',async()=>{
 let url,body;const payload={purchases:[{id:'item',amount:54,paidAmount:10,invoicePayments:{sales:20},receiptPayments:{advance:24}}]};
 const a=await api(async(u,o)=>{url=u;body=JSON.parse(o.body);return response({id:'p',revision:4,payload});});
 await a.savePurchaseSettlement({id:'p',revision:2},payload,{ksef_number:'number',document:{selectedIndices:[1,3]}},[2],'<Faktura/>');
 assert.ok(url.endsWith('/rs_save_purchase_ksef_settlement'));assert.deepEqual(body.p_payload,payload);assert.deepEqual(body.p_expected_indices,[1,3]);
});

test('purchase source recovery reads only purchase invoices assigned to the current investment',async()=>{
 let url;const a=await api(async u=>{url=u;return response([]);});await a.purchaseKsefLinks('project-id');assert.ok(url.includes('rs_ksef_links?select=*'));assert.ok(url.includes('kind=eq.purchases'));assert.ok(url.includes('project_id=eq.project-id'));
});

test('earnings summary reads only the owner and linked Robisie entries and paginates past 500 rows',async()=>{
 const calls=[];const a=await api(async(url,options)=>{calls.push({url,method:options.method||'GET'});return response(url.includes('rs_projects')&&!url.includes('offset=500')?Array.from({length:500},(_,i)=>({id:String(i)})):url.includes('cf_earnings')?[{id:'e',source_robisie_project_id:'p'}]:[]);},{access_token:'test',expires_at:9999999999,user:{id:'owner'}});
 const data=await a.earningsSummaryData();assert.equal(data.projects.length,500);assert.equal(data.earnings.length,1);assert(calls.some(c=>c.url.includes('offset=500')));assert(calls.every(c=>c.method==='GET'));assert(calls.filter(c=>c.url.includes('rs_projects')).every(c=>c.url.includes('owner_id=eq.owner')));assert(calls.filter(c=>c.url.includes('cf_earnings')).every(c=>c.url.includes('created_by=eq.owner')&&c.url.includes('source_robisie_project_id=not.is.null')));
});
test('summary discards data if session ends during its read',async()=>{
 const releases=[];const a=await api(async()=>{await new Promise(r=>releases.push(r));return response([]);},{access_token:'test',expires_at:9999999999,user:{id:'owner'}});const pending=a.earningsSummaryData();a.logout();releases.forEach(r=>r());await assert.rejects(pending,/Sesja zmieniła/);
});
test('receipt import and later row changes use receipt RPCs without requesting KSeF XML',async()=>{
 const calls=[];const row={id:'p',revision:3,payload:{purchases:[]}};
 const a=await api(async(url,options)=>{calls.push({url,args:JSON.parse(options.body)});return response(url.endsWith('/rs_receipt_update_allocation')?row:{project:row});});
 const entries=[{index:2,quantity:1}];await a.importProjectReceipt({hash:'hash',data:{items:[]},entries,project:'p',revision:1});
 const result=await a.savePurchaseAllocation({id:'p',revision:2},row.payload,{ksef_number:'PARAGON-1',document:{sourceReceipt:true}},entries,null);
 assert.equal(result.revision,3);assert.match(calls[0].url,/rs_receipt_import_selected$/);assert.equal(calls[0].args.p_entries[0].index,2);assert.match(calls[1].url,/rs_receipt_update_allocation$/);assert.equal(calls.length,2);assert.equal(calls[1].args.p_number,'PARAGON-1');
});
