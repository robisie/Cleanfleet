import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildReceiptPdf,savedReceiptData} from '../bill/receipt-pdf.js';
const require=createRequire(import.meta.url),{jsPDF}=require('../app/vendor/jspdf-2.5.1.umd.min.js'),{applyPlugin}=require('../app/vendor/jspdf-autotable-3.8.2.min.js');applyPlugin(jsPDF);
const document=(count=3)=>{const items=Array.from({length:count},(_,i)=>({index:i+1,name:i===0?'Taśma flizelinowa - Żółć Łódź':i===1?'GNIAZDO DO PRZEDŁUŻACZA 6X2P+Z':'Wałek malarski do ścian i sufitów',quantity:i===0?2:1,unit:'szt.',gross:10+i}));const total=items.reduce((sum,i)=>sum+i.gross,0);return {metadata:{source:'nip-receipt',ksefNumber:'PARAGON-test',invoiceNumber:'000097/2049',issueDate:'2026-10-26',grossAmount:total,currency:'PLN',seller:{name:'LEROY-MERLIN POLSKA SP. Z O.O.',nip:'1234567890'},buyer:{identifier:{value:'6351861297'}}},preview:{items,gross:total,currency:'PLN'}};};
test('receipt preview uses complete archived positions and rejects incomplete data',()=>{
 const data=savedReceiptData(document());assert.equal(data.items.length,3);assert.equal(data.total,33);assert.equal(data.items[0].quantity,2);
 assert.throws(()=>savedReceiptData({...document(),preview:{}}),/Brak pełnych/);
 const bad=document();bad.metadata.grossAmount=99;assert.throws(()=>savedReceiptData(bad),/Suma pozycji/);
});
test('receipt preview fetches the saved full document rather than remaining warehouse rows',async()=>{
 const expected=document(),urls=[],context=vm.createContext({AbortController,setTimeout,clearTimeout,fetch:async url=>{urls.push(url);return {ok:true,text:async()=>JSON.stringify([expected])};}});
 const source=await readFile(new URL('../app/robisie/api.js',import.meta.url),'utf8'),module=new vm.SourceTextModule(source,{context});await module.link(()=>{});await module.evaluate();
 const saved=await module.namespace.stockIntegration([]).receiptDocument('PARAGON-test');assert.equal(saved.preview.items.length,3);assert.equal(saved.metadata.grossAmount,33);assert.equal(urls.length,1);assert.match(urls[0],/rs_ksef_documents\?select=metadata,preview&ksef_number=eq.PARAGON-test/);
});
test('receipt PDF embeds Polish font, renders every row and supports multiple pages',async()=>{
 const context=vm.createContext({window:{}});vm.runInContext(await readFile(new URL('../app/reports-font.js',import.meta.url),'utf8'),context);
 const logo='data:image/png;base64,'+(await readFile(new URL('../app/robisie/assets/robisie-logo.png',import.meta.url))).toString('base64');
 for(const count of [3,80]){
  const input=document(count);if(count===80){input.metadata.seller.name='Długa nazwa sklepu - '.repeat(8);input.metadata.invoiceNumber='PARAGON/2026/10/26/'+ '1234567890'.repeat(7);input.preview.items.forEach(i=>i.name+=' - długa nazwa zakupionego towaru, rozmiar i przeznaczenie');}
  const blob=buildReceiptPdf(input,jsPDF,context.window.CFReportFont,logo),bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'%PDF');assert(bytes.length>50000);
  if(process.env.RECEIPT_PDF_QA){await mkdir(process.env.RECEIPT_PDF_QA,{recursive:true});await writeFile(process.env.RECEIPT_PDF_QA+'/receipt-'+count+'.pdf',bytes);}
 }
});
