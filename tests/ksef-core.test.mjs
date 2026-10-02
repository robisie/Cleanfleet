import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, privateDecrypt, constants, createCipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHandler, createStateCodec, monthRange, validNip, b64, unb64, hash, certificateKey, HttpError } from '../supabase/functions/cleanfleet-ksef/core.js';

test('calendar boundaries and NIP validation', () => {
  assert.equal(monthRange('2024-02').to, '2024-02-29T22:59:59.999Z');
  assert.equal(monthRange('2026-12').from, '2026-11-30T23:00:00.000Z');
  assert.throws(()=>monthRange('2026-13'));
  assert.equal(validNip('5260250995'),true);
  assert.equal(validNip('5260250996'),false);
});
test('encrypted tickets reject tampering, another user and expiration',async()=>{
  const codec=createStateCodec('server-only-test-secret');
  const ticket=await codec.seal({userId:'admin',scope:'export',expires:Date.now()+60000,accessToken:'secret'});
  assert.equal((await codec.open(ticket,'admin','export')).accessToken,'secret');
  await assert.rejects(codec.open(ticket,'other','export'));
  await assert.rejects(codec.open(ticket,'admin','part'));
  await assert.rejects(codec.open(ticket.slice(0,30)+(ticket[30]==='A'?'B':'A')+ticket.slice(31),'admin','export'));
  await assert.rejects(codec.open(await codec.seal({userId:'admin',scope:'export',expires:1}),'admin','export'));
});
test('saved credentials persist encrypted, replace atomically and stay isolated by owner/environment',async()=>{
  const rows=new Map();
  const credentialStore={get:async(uid,env)=>rows.get(uid+env)||null,set:async(uid,env,value)=>{rows.set(uid+env,value);}};
  const handler=createHandler({secret:'test-server-key',credentialStore,authorize:async req=>req.headers.get('test-owner'),fetchImpl:async()=>{throw new Error('No KSeF requests expected');}});
  const call=(body,owner='alice')=>handler(new Request('https://edge.example',{method:'POST',headers:{'test-owner':owner},body:JSON.stringify(body)}));
  const save={action:'save-credentials',environment:'production',nip:'5260250995',token:'first-secret',userId:'bob'};
  const response=await(await call(save)).json();
  assert.deepEqual(response,{configured:true,nip:'5260250995',environment:'production'});
  const first=rows.get('aliceproduction').ciphertext;assert.ok(!first.includes('first-secret'));
  const cipher=createStateCodec('test-server-key','saved-credentials-v1');
  assert.equal((await cipher.open(first,'alice','credential')).token,'first-secret');
  assert.equal((await(await call({action:'credentials',environment:'production'},'bob')).json()).configured,false);
  assert.equal((await(await call({action:'credentials',environment:'test'})).json()).configured,false);
  await assert.rejects(cipher.open(first,'bob','credential'));
  await assert.rejects(createStateCodec('test-server-key').open(first,'alice','credential'));
  await call({...save,token:'replacement-secret'});
  const second=rows.get('aliceproduction').ciphertext;
  assert.notEqual(second,first);assert.equal((await cipher.open(second,'alice','credential')).token,'replacement-secret');
  assert.equal((await call({...save,token:''})).status,400);
  assert.equal(rows.get('aliceproduction').ciphertext,second);
});
test('X509 certificate extracts RSA public key',async()=>{
  const dir=mkdtempSync(tmpdir()+'/cf-ksef-');
  try {
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-keyout',dir+'/key.pem','-out',dir+'/cert.der','-outform','DER','-days','1','-nodes','-subj','/CN=test'],{stdio:'ignore'});
    const key=await certificateKey(readFileSync(dir+'/cert.der').toString('base64'));
    const encrypted=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,new TextEncoder().encode('proof'));
    assert.equal(privateDecrypt({key:readFileSync(dir+'/key.pem'),oaepHash:'sha256'},Buffer.from(encrypted)).toString(),'proof');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('full export: correct auth encryption, filters, encrypted transfer and rejection gates',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const decrypt=value=>privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(value,'base64'));
  const cert=publicKey.export({type:'spki',format:'der'}).toString('base64');
  const jobs=[]; let truncated=false, corrupt=false, rateLimit=false, calls=0;
  const plain=Buffer.from('sample ZIP bytes');
  const fetchImpl=async(url,options={})=>{
    calls++; const body=options.body ? JSON.parse(options.body):null;
    const ok=value=>Response.json(value);
    if(url.endsWith('/security/public-key-certificates')) return ok([{certificate:cert,publicKeyId:'key-id',validFrom:'2020-01-01',validTo:'2099-01-01',usage:['KsefTokenEncryption','SymmetricKeyEncryption']}]);
    if(url.endsWith('/auth/challenge'))return ok({challenge:'challenge',timestampMs:12345});
    if(url.endsWith('/auth/ksef-token')){
      assert.equal(decrypt(body.encryptedToken).toString(),'raw-token|12345');
      assert.deepEqual(body.contextIdentifier,{type:'Nip',value:'5260250995'});
      return ok({referenceNumber:'auth-ref',authenticationToken:{token:'temp'}});
    }
    if(url.endsWith('/auth/auth-ref'))return ok({status:{code:200}});
    if(url.endsWith('/auth/token/redeem'))return ok({accessToken:{token:'access-secret',validUntil:new Date(Date.now()+3600000).toISOString()}});
    if(url.endsWith('/invoices/exports')){
      assert.equal(options.headers.Authorization,'Bearer access-secret');
      assert.equal(body.onlyMetadata,false); assert.equal(body.compressionType,'Zip');
      assert.equal(body.filters.subjectType,jobs.length ? 'Subject2':'Subject1');
      assert.equal(body.filters.dateRange.to,'2024-02-29T22:59:59.999Z');
      const key=decrypt(body.encryption.encryptedSymmetricKey); assert.equal(key.length,32);
      const cipher=createCipheriv('aes-256-cbc',key,Buffer.from(body.encryption.initializationVector,'base64'));
      const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]); jobs.push(encrypted);
      return ok({referenceNumber:'export-'+jobs.length});
    }
    if(url.includes('/invoices/exports/export-')) {
      if(rateLimit)return new Response('',{status:429,headers:{'Retry-After':'12'}});
      const number=Number(url.split('-').at(-1)); const bytes=jobs[number-1];
      return ok({status:{code:200},package:{invoiceCount:1,size:plain.length,isTruncated:truncated,compressionType:'Zip',parts:[{ordinalNumber:1,method:'GET',url:'https://storage.example/part-'+number,partSize:plain.length,partHash:await hash(plain),encryptedPartSize:bytes.length,encryptedPartHash:await hash(bytes),expirationDate:new Date(Date.now()+600000).toISOString()}]}});
    }
    if(url.startsWith('https://storage.example/')){assert.equal(options.headers,undefined);return new Response(corrupt ? Buffer.alloc(jobs[0].length):jobs[0]);}
    throw new Error('Unexpected URL: '+url);
  };
  const store=new Map();
  const credentialStore={get:async(uid,env)=>store.get(uid+env)||null,set:async(uid,env,value)=>{store.set(uid+env,value);}};
  const handler=createHandler({authorize:async()=> 'admin',secret:'server-secret',credentialStore,fetchImpl,pause:async()=>{}});
  const call=body=>handler(new Request('https://edge.example',{method:'POST',headers:{Origin:'https://cleanfleet.pl'},body:JSON.stringify(body)}));
  assert.equal((await call({action:'save-credentials',nip:'5260250995',token:'raw-token',environment:'production'})).status,200);
  const saved=store.get('adminproduction');assert.ok(!saved.ciphertext.includes('raw-token'));
  const meta=await(await call({action:'credentials',environment:'production'})).json();
  assert.deepEqual(meta,{configured:true,nip:'5260250995',environment:'production'});
  assert.equal((await call({action:'start',nip:'5260250995',useSaved:true,month:'2024-02',environment:'test'})).status,400);
  const started=await (await call({action:'start',nip:'5260250995',useSaved:true,month:'2024-02',environment:'production'})).json();
  assert.equal(started.jobs.length,2); assert.ok(!JSON.stringify(started).includes('access-secret'));
  const statusBody={action:'status',ticket:started.jobs[0].ticket};
  const ready=await(await call(statusBody)).json();assert.equal(ready.status,'ready');
  const response=await call({action:'part',ticket:ready.parts[0].ticket}); assert.equal(response.status,200);
  const aes=await crypto.subtle.importKey('raw',unb64(started.jobs[0].key),'AES-CBC',false,['decrypt']);
  const decrypted=await crypto.subtle.decrypt({name:'AES-CBC',iv:unb64(started.jobs[0].iv)},aes,await response.arrayBuffer());
  assert.deepEqual(Buffer.from(decrypted),plain);
  corrupt=true;assert.equal((await call({action:'part',ticket:ready.parts[0].ticket})).status,502);
  truncated=true;assert.equal((await call(statusBody)).status,422);
  truncated=false;rateLimit=true;const limited=await call(statusBody);assert.equal(limited.status,429);assert.equal((await limited.json()).retryAfter,12);
  const before=calls;
  const blocked=createHandler({authorize:async()=>{throw new HttpError('Denied',403)},secret:'secret',fetchImpl});
  assert.equal((await blocked(new Request('https://edge.example',{method:'POST',body:'{}'}))).status,403);
  assert.equal(calls,before);
  assert.equal((await handler(new Request('https://edge.example',{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'}))).status,403);
});

test('Polish month boundaries exclude April 1 from March and include the first day through DST changes',()=>{
 const march=monthRange('2026-03'),april=monthRange('2026-04'),october=monthRange('2026-10'),november=monthRange('2026-11');
 assert.equal(march.from,'2026-02-28T23:00:00.000Z');assert.equal(march.to,'2026-03-31T21:59:59.999Z');
 assert.equal(april.from,'2026-03-31T22:00:00.000Z');assert.equal(october.from,'2026-09-30T22:00:00.000Z');assert.equal(october.to,'2026-10-31T22:59:59.999Z');
 assert.equal(Date.parse(march.to)+1,Date.parse(april.from));assert.equal(Date.parse(october.to)+1,Date.parse(november.from));
 const firstApril=Date.parse('2026-04-01T00:00:00+02:00');assert.ok(firstApril>Date.parse(march.to));assert.ok(firstApril>=Date.parse(april.from));
 const polish=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'});
 for(let m=1;m<=12;m++){const month='2026-'+String(m).padStart(2,'0'),range=monthRange(month);assert.equal(polish.format(new Date(range.from)),month+'-01');assert.equal(polish.format(new Date(range.to)).slice(0,7),month);}
});
