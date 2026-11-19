const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

test('local photo events never upload; only selected administrator photos are published', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app/photo-cloud-sync.js'), 'utf8');
  const bytes = Buffer.from('selected photo');
  const id = 'photo-one', recordId = 'record-one';
  const row = {id, recordId, kind:'przed', mime:'image/jpeg', blob:new Blob([bytes], {type:'image/jpeg'})};
  const metadata = [];
  const uploads = [];
  const handlers = new Map();
  const select = () => ({
    eq(){ return this; },
    limit(){ return Promise.resolve({data:metadata.length ? [{id:1}] : [], error:null}); },
    then(resolve){ return Promise.resolve({data:metadata, error:null}).then(resolve); }
  });
  const cfSupabase = {
    from(){return {select, insert:async data => {metadata.push(data);return {error:null};}};},
    storage:{from(){return {upload:async (p,blob) => {uploads.push({path:p,size:blob.size});return {error:null};}};}}
  };
  const indexedDB = {open(){
    const request = {result:null};
    queueMicrotask(() => {
      request.result = {close(){},transaction(){
        const tx={objectStore(){return {get(key){
          const req={};
          queueMicrotask(() => {req.result=key===id?row:undefined;req.onsuccess();queueMicrotask(() => tx.oncomplete());});
          return req;
        }};},close(){}};
        return tx;
      }};
      request.onsuccess();
    });
    return request;
  }};
  const context = {
    window:{cfCanEditRecordPhotos:()=>true},
    document:{addEventListener(name,fn){handlers.set(name,fn);},dispatchEvent(){}},
    navigator:{onLine:true},cfSupabase,indexedDB,Blob,crypto:crypto.webcrypto,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}
  };
  vm.runInNewContext(source,context);
  assert.equal(uploads.length,0);
  assert.equal(handlers.size,0);
  const result=await context.window.cfPhotoPublication.publish(recordId,[id]);
  assert.equal(result.sent,1);
  assert.equal(uploads.length,1);
  assert.equal(metadata.length,1);
  assert.equal((await context.window.cfPhotoPublication.published(recordId,[row])).has(id),true);
  const again=await context.window.cfPhotoPublication.publish(recordId,[id]);
  assert.equal(again.existing,1);
  assert.equal(uploads.length,1);
  context.window.cfCanEditRecordPhotos=()=>false;
  await assert.rejects(context.window.cfPhotoPublication.publish(recordId,[id]),/administrator/);
});
