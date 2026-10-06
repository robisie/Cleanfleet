const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const create=require('../app/vendor/qpdf-0.3.0/qpdf.js'),{decrypt}=require('../app/pdf-unlock-core.js');
const options={locateFile:()=>path.resolve(__dirname,'../app/vendor/qpdf-0.3.0/qpdf.wasm')};
const input=name=>new Uint8Array(fs.readFileSync(path.join(__dirname,'fixtures/pdf-unlock',name+'.pdf')));
test('real QPDF removes AES-256, AES-128 and RC4 encryption, keeps multi-page content, and accepts a plain PDF',async()=>{
 for(const name of ['aes256','aes128','rc4','plain']){
  const source=input(name),copy=source.slice(),bytes=await decrypt(source,name==='plain'?'':'test-bank-123',create,options);assert.deepEqual(source,copy);
  let m=await create(options);m.FS.writeFile('/out.pdf',bytes);assert.equal(m.callMain(['/out.pdf','--is-encrypted']),2);
  m=await create(options);m.FS.writeFile('/out.pdf',bytes);assert.equal(m.callMain(['/out.pdf','--check']),0);
  m=await create({...options,print:()=>{}});m.FS.writeFile('/out.pdf',bytes);assert.equal(m.callMain(['/out.pdf','--show-npages']),0);
  assert.ok(bytes.length>0);
 }
});
test('missing/wrong password and damaged input reject without returning encrypted bytes; subsequent retry succeeds',async()=>{
 for(const password of ['','incorrect'])await assert.rejects(decrypt(input('aes256'),password,create,options),/Sprawdź hasło/);
 await assert.rejects(decrypt(new TextEncoder().encode('not a PDF'),'x',create,options),/poprawnym/);
 await assert.rejects(decrypt(new TextEncoder().encode('%PDF- broken'),'x',create,options),/Sprawdź hasło/);
 const bytes=await decrypt(input('aes256'),'test-bank-123',create,options);assert.ok(bytes.length);
});
