const test=require('node:test'),assert=require('node:assert/strict');
const {attachFiles,attachmentFiles,removeAttachment}=require('../app/accounting-reconcile.js');
const {build}=require('../app/accounting-package.js'),Zip=require('../app/vendor/jszip-3.10.1.min.js');
const pdf=(name='invoice.pdf',body='%PDF-1.7\noriginal invoice')=>new File([body],name,{type:'application/pdf'});
test('PDF attachment is associated with payment and deduplicated by content across payments',async()=>{
 const store=new Map(),a={id:'a'},b={id:'b'};await attachFiles(store,a,[pdf()]);await attachFiles(store,b,[pdf('copy.pdf')]);assert.equal(a.reviewStatus,'outside_ksef');assert.equal(attachmentFiles(store).length,1);const hash=store.get('a')[0].hash;removeAttachment(store,a,hash);assert.equal(a.reviewStatus,'needs_document');assert.equal(attachmentFiles(store).length,1);removeAttachment(store,b,hash);assert.equal(attachmentFiles(store).length,0);
});
test('invalid batches and stale review never store partial attachments',async()=>{
 const store=new Map(),row={id:'a'};await assert.rejects(attachFiles(store,row,[pdf(),pdf('bad.pdf','not pdf')]),/nagłówka/);assert.equal(store.size,0);await assert.rejects(attachFiles(store,row,[pdf()],()=>false),/Kontrola zmieniona/);assert.equal(store.size,0);await assert.rejects(attachFiles(store,row,[{name:'big.pdf',size:21*1024*1024}]),/20 MB/);
});
test('external purchase PDFs retain bytes in purchase folder alongside nested KSeF PDFs',async()=>{
 const z=new Zip();z.file('ksef.pdf','KSeF source');const blob=new Blob([await z.generateAsync({type:'uint8array'})]);const result=await build({month:'2026-08',ksef:{purchases:{month:'2026-08',count:1,format:'pdf',blob}},purchaseFiles:[pdf(),pdf('INVOICE.pdf','%PDF-1.7\nsecond invoice')]},Zip);const archive=await Zip.loadAsync(result.bytes,{checkCRC32:true});assert.equal(result.counts.externalPurchases,2);assert.equal(await archive.file('8 SIERPIEŃ/faktury zakupowe/invoice.pdf').async('string'),'%PDF-1.7\noriginal invoice');assert.equal(await archive.file('8 SIERPIEŃ/faktury zakupowe/INVOICE (2).pdf').async('string'),'%PDF-1.7\nsecond invoice');assert.ok(archive.file('8 SIERPIEŃ/faktury zakupowe/KSEF/ksef.pdf'));
});
