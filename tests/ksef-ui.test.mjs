import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {b64,hash} from '../supabase/functions/cleanfleet-ksef/core.js';
test('browser flow clears token, verifies parts and enables separate downloads',async()=>{
  const elements=new Map();
  for(const id of ['cfKsefNip','cfKsefToken','cfKsefEnvironment','cfKsefStart','cfKsefSave','cfKsefCancel','cfKsefStatus','cfKsefpurchases','cfKsefsales','cfAccountingMonth'])elements.set(id,{value:'',hidden:true,disabled:false,dataset:{saved:'false'}});
  elements.get('cfKsefNip').value='5260250995';elements.get('cfKsefToken').value='token';elements.get('cfKsefEnvironment').value='production';elements.get('cfAccountingMonth').value='2024-02';
  const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(16));
  const aes=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']);
  const plain=new TextEncoder().encode('mock archive');
  const encrypted=await crypto.subtle.encrypt({name:'AES-CBC',iv},aes,plain);
  let corrupt=false,tokenSeen=false,saved=null,savedStart=false;
  const context={crypto,Uint8Array,TextEncoder,AbortController,DOMException,Blob,atob,btoa,setTimeout,clearTimeout,URL,CF_SUPABASE_URL:'https://example.supabase.co',CF_SUPABASE_KEY:'publishable',
    document:{readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id)},
    window:{cfBackupBridge:{isAdmin:()=>true,getClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'jwt'}}})}})},JSZip:{loadAsync:async()=>({files:{'invoice.xml':{name:'invoice.xml',dir:false}}})}},
    fetch:async(url,options)=>{
      assert.equal(options.headers.Authorization,'Bearer jwt');assert.equal(options.headers.apikey,'publishable');
      const body=JSON.parse(options.body);
      if(body.action==='credentials')return Response.json(saved || {configured:false,nip:'',environment:body.environment});
      if(body.action==='save-credentials'){assert.equal(body.token,'replacement-token');saved={configured:true,nip:body.nip,environment:body.environment};return Response.json(saved);}
      if(body.action==='start'){if(body.useSaved){savedStart=true;assert.equal(body.token,undefined);assert.equal(elements.get('cfKsefToken').value,'************');}else{tokenSeen=body.token==='token';assert.equal(elements.get('cfKsefToken').value,'');}return Response.json({month:'2024-02',jobs:['purchases','sales'].map(kind=>({kind,ticket:kind,key:b64(key),iv:b64(iv)}))});}
      if(body.action==='status')return Response.json({status:'ready',invoiceCount:1,size:plain.length,parts:[{ticket:'part',partSize:plain.length,partHash:corrupt ? 'wrong':await hash(plain)}]});
      return new Response(encrypted);
    }
  };
  vm.createContext(context);
  const source=readFileSync(new URL('../app/accounting-documents-v1510.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.harness={startKsef,resetKsef,saveKsefCredential,loadKsefCredential,forgetKsefView};})();');
  vm.runInContext(source,context);
  await context.harness.startKsef({preventDefault(){}});
  assert.equal(tokenSeen,true);assert.match(elements.get('cfKsefStatus').textContent,/Gotowe/);
  for(const kind of ['purchases','sales'])assert.equal(elements.get('cfKsef'+kind).disabled,false);
  assert.equal(elements.get('cfAccountingMonth').disabled,false);
  context.harness.resetKsef();assert.equal(elements.get('cfKsefpurchases').hidden,true);
  elements.get('cfKsefToken').value='token';corrupt=true;
  await context.harness.startKsef({preventDefault(){}});
  assert.match(elements.get('cfKsefStatus').textContent,/zweryfikować/);
  assert.equal(elements.get('cfKsefpurchases').hidden,true);
  assert.equal(elements.get('cfAccountingMonth').disabled,false);
  corrupt=false;elements.get('cfKsefToken').value='replacement-token';
  await context.harness.saveKsefCredential();
  assert.equal(elements.get('cfKsefToken').value,'************');
  assert.equal(elements.get('cfKsefToken').dataset.saved,'true');
  context.harness.forgetKsefView();assert.equal(elements.get('cfKsefToken').value,'');
  await context.harness.loadKsefCredential();assert.equal(elements.get('cfKsefToken').value,'************');
  await context.harness.startKsef({preventDefault(){}});
  assert.equal(savedStart,true);assert.match(elements.get('cfKsefStatus').textContent,/Gotowe/);
});
