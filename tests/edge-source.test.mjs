import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {edgeSource} from '../scripts/edge-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

test('Bill deployment includes the current Robisie calculations and all cross-function dependencies',async()=>{
 const bundle=await edgeSource(root,'cleanfleet-bill'),files=new Map(bundle.files.map(f=>[f.name,f.content]));
 for(const name of ['app/robisie/core.js','app/robisie/billing.js','supabase/functions/cleanfleet-bill/invoice.js','supabase/functions/_shared/bill-bank-match.js','supabase/functions/pack-bank-mail/engine.js']){
  assert.equal(files.get(name),await readFile(path.join(root,name),'utf8'),name);
 }
 assert.equal(files.get('supabase/functions/cleanfleet-bill/invoice.js'),await readFile(path.join(root,'bill/core.js'),'utf8'));
});
test('bank importer bundles the same invoice calculator as BILL',async()=>{
 const path='supabase/functions/cleanfleet-bill/invoice.js';
 const bundles=await Promise.all(['cleanfleet-bill','pack-bank-mail'].map(name=>edgeSource(root,name)));
 const [bill,bank]=bundles.map(bundle=>bundle.files.find(file=>file.name===path)?.content);
 assert.ok(bank);
 assert.equal(bank,bill);
 const {invoiceAmount}=await import('data:text/javascript;base64,'+Buffer.from(bank).toString('base64'));
 const invoice={lines:[{qty:'1',price:'1000.00'}]};
 assert.equal(invoiceAmount({...invoice,globalDiscount:'10'}),90000);
 assert.equal(invoiceAmount({...invoice,documentType:'advance',advanceAmount:'250'}),25000);
 assert.equal(invoiceAmount({...invoice,documentType:'final',advances:[{amount:'250'}]}),75000);
});
test('dependency collection follows side effects, re-exports, dynamic imports and cycles, ignoring remote packages',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'edge-source-'));
 try{
  await mkdir(path.join(root,'supabase/functions/test'),{recursive:true});
  for(const [name,content]of Object.entries({'index.ts':"import './side.js';\nimport {value} from './value.js';\nexport {other} from './other.js';\nimport {x} from 'npm:example@1';\nconst load=()=>import('./dynamic.js');",'side.js':"import './index.ts';",'value.js':'export const value=1;','other.js':'export const other=2;','dynamic.js':'export default 3;'}))await writeFile(path.join(root,'supabase/functions/test',name),content);
  const bundle=await edgeSource(root,'test');assert.equal(bundle.files.length,5);
 }finally{await rm(root,{recursive:true,force:true});}
});
