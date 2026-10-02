const test=require('node:test'),assert=require('node:assert/strict');
const Zip=require('../app/vendor/jszip-3.10.1.min.js');global.JSZip=Zip;
const {convert}=require('../app/ksef-pdf.js');
const xml='<Faktura><Naglowek><KodFormularza kodSystemowy="FA (3)">FA</KodFormularza></Naglowek><Podmiot1><DaneIdentyfikacyjne><NIP>5265877635</NIP></DaneIdentyfikacyjne></Podmiot1><Fa><P_1>2026-03-22</P_1><P_2>FV/Łódź/1</P_2></Fa></Faktura>';
// Browser DOMParser is exercised separately with the real CIRF renderer. This adapter supplies its DOM contract for archive and cancellation tests.
const n=(localName,textContent='',children=[])=>({localName,textContent,children,getAttribute:()=> 'FA (3)'});
global.DOMParser=class{parseFromString(text){return {documentElement:n('Faktura','',[n('Naglowek','',[n('KodFormularza')]),n('Podmiot1','',[n('DaneIdentyfikacyjne','',[n('NIP','5265877635')])]),n('Fa','',[n('P_1','2026-03-22'),n('P_2','FV/Łódź/1')])]),doctype:text.includes('DOCTYPE'),getElementsByTagName:()=>text.includes('<broken')?[{}]:[]};}};
test('XML becomes PDF-only archive with source bytes, real hash QR, KSeF number and collision handling',async()=>{
 const z=new Zip();const name='5265877635-20260322-123456789ABC-AB.xml';z.file('a/'+name,xml);z.file('b/'+name,xml);z.file('metadata.json','{}');const calls=[];
 const blob=await convert({archive:z,count:2,environment:'production'},{generateInvoice:async(file,data,format)=>{calls.push({xml:await file.text(),data,format});return new Blob(['%PDF-1.7 mock'],{type:'application/pdf'});}});
 const result=await Zip.loadAsync(await blob.arrayBuffer());assert.equal(Object.keys(result.files).length,2);assert.ok(result.file(name.replace('.xml','.pdf')));assert.ok(result.file(name.replace('.xml',' (2).pdf')));assert.equal(calls[0].xml,xml);assert.equal(calls[0].data.nrKSeF,name.slice(0,-4));assert.equal(calls[0].format,'blob');
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(xml))).toString('base64url');assert.equal(calls[0].data.qrCode,'https://qr.ksef.mf.gov.pl/invoice/5265877635/22-03-2026/'+hash);
});
test('invalid or incomplete conversion and cancellation produce no PDF archive',async()=>{
 const z=new Zip();z.file('invoice.xml',xml);const renderer={generateInvoice:async()=>new Blob(['not a PDF'])};await assert.rejects(convert({archive:z,count:1},renderer),/utworzyć PDF/);await assert.rejects(convert({archive:z,count:2},renderer),/Liczba faktur/);
 const broken=new Zip();broken.file('bad.xml','<broken');await assert.rejects(convert({archive:broken,count:1},renderer),/niepoprawny XML/);
 const entity=new Zip();entity.file('entity.xml','<!DOCTYPE x>'+xml);await assert.rejects(convert({archive:entity,count:1},renderer),/niepoprawny XML/);
 const controller=new AbortController();await assert.rejects(convert({archive:z,count:1,signal:controller.signal},{generateInvoice:async()=>{controller.abort();return new Blob(['%PDF-1.7']);}}),{name:'AbortError'});
});
