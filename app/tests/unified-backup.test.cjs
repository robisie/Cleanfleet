const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const JSZip=require('../vendor/jszip-3.10.1.min.js');
const code=fs.readFileSync(require('node:path').join(__dirname,'..','unified-backup.js'),'utf8');
class Zip{
  constructor(){this.files={};}
  file(path,content){if(content===undefined){const entry=this.files[path];return entry?{async:async kind=>{const b=Buffer.from(entry);return kind==='string'?b.toString():b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}}:null;}this.files[path]=Buffer.from(content);return this;}
  async generateAsync(){return this;}
  static async loadAsync(value){return value;}
}
const ctx={crypto:webcrypto,Blob,TextEncoder,URL,console,window:null};ctx.window=ctx;
vm.createContext(ctx);vm.runInContext(code,ctx);
(async()=>{
  const client={functions:{invoke:async()=>({data:{format:'CleanFleet Unified Backup v2',createdAt:'2026-09-29T00:00:00Z',createdBy:'admin',project:'project',tables:{companies:[{id:'firm'}],vehicles:[],wash_record_photos:[]},users:[],objects:[]}})}};
  const {archive,manifest}=await ctx.CFUnifiedBackup.makeArchive(client,Zip);
  assert.equal(manifest.counts.companies,1);
  assert.equal(manifest.entries.length,1);
  assert.equal(manifest.storageFiles,0);
  assert.equal(manifest.localPhotos,0);
  const read=await ctx.CFUnifiedBackup.inspectArchive(archive,Zip);
  assert.equal(read.data.tables.companies[0].id,'firm');
  const real=await ctx.CFUnifiedBackup.makeArchive(client,JSZip);
  const checked=await ctx.CFUnifiedBackup.inspectArchive(real.archive,JSZip);
  assert.equal(checked.data.tables.companies[0].id,'firm');
  assert.equal((await real.archive.arrayBuffer()).byteLength>0,true);
  archive.files['database.json']=Buffer.from('{}');
  await assert.rejects(ctx.CFUnifiedBackup.inspectArchive(archive,Zip),/Uszkodzony plik/);
  console.log('PASS: pojedyncza paczka sprawdza liczby i sumy kontrolne.');
})().catch(e=>{console.error(e);process.exitCode=1});
