const test=require('node:test'),assert=require('node:assert/strict');
const Zip=require('../app/vendor/jszip-3.10.1.min.js');
const {build,monthFolder}=require('../app/accounting-package.js');
const month='2026-08',zero=()=>({month,count:0});
async function source(files){const z=new Zip();for(const [name,value] of Object.entries(files))z.file(name,value);return {month,format:'pdf',count:Object.keys(files).filter(n=>n.endsWith('.pdf')).length,blob:new Blob([await z.generateAsync({type:'uint8array'})])};}
test('combined archive preserves every source and exact monthly folders, including empty cash report',async()=>{
 const purchases=await source({'nested/buy.pdf':'<purchase/>',}),sales=await source({'nested/sell.pdf':'<sale/>'});
 const pdf=name=>({name,arrayBuffer:async()=>new TextEncoder().encode('%PDF mock').buffer});
 const result=await build({month,ksef:{purchases,sales},organizerFiles:[pdf('sales.pdf'),pdf('SALES.pdf')],bankResults:[{month,filename:'statement.txt',bytes:new TextEncoder().encode(':20:MT940')}],mailFiles:[{name:'../statement.txt',blob:new Blob(['mail original'])}]},Zip);
 assert.deepEqual(result.counts,{purchases:1,sales:1,organizer:2,externalPurchases:0,bank:1,mail:1});
 const archive=await Zip.loadAsync(result.bytes,{checkCRC32:true}),root='8 SIERPIEŃ/';
 assert.deepEqual(Object.keys(archive.files).sort(),[root,root+'faktury zakupowe/',root+'faktury zakupowe/KSEF/',root+'faktury zakupowe/KSEF/buy.pdf',root+'faktury sprzedażowe/',root+'faktury sprzedażowe/sell.pdf',root+'faktury sprzedażowe/sales.pdf',root+'faktury sprzedażowe/SALES (2).pdf',root+'wyciągi bankowe/',root+'wyciągi bankowe/statement.txt',root+'wyciągi bankowe/statement (2).txt',root+'raport kasowy/'].sort());
 for(const [name,expected] of Object.entries({'faktury zakupowe/KSEF/buy.pdf':'<purchase/>','faktury sprzedażowe/sell.pdf':'<sale/>','faktury sprzedażowe/sales.pdf':'%PDF mock','wyciągi bankowe/statement.txt':':20:MT940','wyciągi bankowe/statement (2).txt':'mail original'}))assert.equal(await archive.file(root+name).async('string'),expected);
 assert.equal(archive.files[root+'raport kasowy/'].dir,true);
});
test('empty month still includes all required folders',async()=>{
 const result=await build({month,ksef:{purchases:zero(),sales:zero()}},Zip);const archive=await Zip.loadAsync(result.bytes);assert.equal(Object.values(archive.files).filter(f=>!f.dir).length,0);assert.ok(archive.files['8 SIERPIEŃ/raport kasowy/']);assert.equal(monthFolder('2026-09'),'9 WRZESIEŃ');
});
test('incomplete, stale or corrupt sources cannot produce a ZIP',async()=>{
 const valid=await source({'a.pdf':'invoice'}),base={month,ksef:{purchases:valid,sales:zero()}};
 await assert.rejects(build({...base,ksef:{purchases:{...valid,count:2},sales:zero()}},Zip),/Liczba faktur/);
 await assert.rejects(build({...base,ksef:{purchases:{...valid,month:'2026-07'},sales:zero()}},Zip),/Brak poprawnego/);
 await assert.rejects(build({...base,bankResults:[{month:'2026-07',filename:'bank.txt',bytes:new Uint8Array()}]},Zip),/wyciąg/);
 await assert.rejects(build({...base,ksef:{purchases:{month,count:1,format:'pdf',blob:new Blob(['corrupt'])},sales:zero()}},Zip));
});
test('cancellation during source loading prevents final archive',async()=>{
 const controller=new AbortController();await assert.rejects(build({month,ksef:{purchases:zero(),sales:zero()},signal:controller.signal,organizerFiles:[{name:'a.pdf',arrayBuffer:async()=>{controller.abort();return new ArrayBuffer(1);}}]},Zip),{name:'AbortError'});
});
