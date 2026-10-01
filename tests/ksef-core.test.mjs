import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, privateDecrypt, constants, createCipheriv } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHandler, createStateCodec, monthRange, validNip, b64, unb64, hash, certificateKey, HttpError } from '../supabase/functions/cleanfleet-ksef/core.js';

test('calendar boundaries and NIP validation', () => {
  assert.equal(monthRange('2024-02').to, '2024-02-29T23:59:59.999Z');
  assert.equal(monthRange('2026-12').from, '2026-12-01T00:00:00.000Z');
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
  await assert.rejects(codec.open(ticket.slice(0,30)+'A'+ticket.slice(31),'admin','export'));
  await assert.rejects(codec.open(await codec.seal({userId:'admin',scope:'export',expires:1}),'admin','export'));
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
      assert.equal(body.filters.dateRange.to,'2024-02-29T23:59:59.999Z');
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
  const handler=createHandler({authorize:async()=> 'admin',secret:'server-secret',fetchImpl,pause:async()=>{}});
  const call=body=>handler(new Request('https://edge.example',{method:'POST',headers:{Origin:'https://cleanfleet.pl'},body:JSON.stringify(body)}));
  const started=await (await call({action:'start',nip:'5260250995',token:'raw-token',month:'2024-02',environment:'production'})).json();
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
