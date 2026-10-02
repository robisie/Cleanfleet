(function(root){
'use strict';
let loading=null;
function check(signal){if(signal?.aborted)throw new DOMException('Anulowano','AbortError');}
async function renderer(){
 if(root.CFKsefRenderer?.generateInvoice)return root.CFKsefRenderer;
 if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/app/vendor/ksef-renderer-1.1.40.js';script.onload=()=>root.CFKsefRenderer?.generateInvoice?resolve(root.CFKsefRenderer):reject(new Error('Generator PDF jest niedostępny.'));script.onerror=()=>{script.remove();reject(new Error('Nie udało się wczytać generatora PDF. Spróbuj ponownie.'));};document.head.appendChild(script);}).catch(error=>{loading=null;throw error;});
 return loading;
}
function xmlText(bytes){let encoding='utf-8';if((bytes[0]===255&&bytes[1]===254)||(bytes[0]===60&&bytes[1]===0))encoding='utf-16le';if((bytes[0]===254&&bytes[1]===255)||(bytes[0]===0&&bytes[1]===60))encoding='utf-16be';return new TextDecoder(encoding,{fatal:true}).decode(bytes);}
function invoiceData(bytes,name){
 const doc=new DOMParser().parseFromString(xmlText(bytes),'application/xml');
 if(doc.doctype || doc.getElementsByTagName('parsererror').length || doc.documentElement?.localName!=='Faktura')throw new Error(name+': niepoprawny XML faktury.');
 const get=(parent,tag)=>Array.from(parent?.children || []).find(node=>node.localName===tag);
 const text=(parent,tag)=>get(parent,tag)?.textContent?.trim() || '';
 const header=get(doc.documentElement,'Naglowek'),fa=get(doc.documentElement,'Fa');
 if(!['FA (1)','FA (2)','FA (3)'].includes(get(header,'KodFormularza')?.getAttribute('kodSystemowy')))throw new Error(name+': nieobsługiwany format faktury.');
 const nip=text(get(get(doc.documentElement,'Podmiot1'),'DaneIdentyfikacyjne'),'NIP'),date=text(fa,'P_1');
 if(!/^\d{10}$/.test(nip) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !text(fa,'P_2'))throw new Error(name+': brakuje danych identyfikacyjnych faktury.');
 const nrKSeF=name.split(/[\\/]/).at(-1).match(/^(\d{10}-\d{8}-[0-9a-f]{12}-[0-9a-f]{2})\.xml$/i)?.[1] || '';
 const payment=get(fa,'Platnosc'),accounts=Array.from(payment?.children || []).filter(node=>['RachunekBankowy','RachunekBankowyFaktora'].includes(node.localName)).map(node=>text(node,'NrRB')).filter(Boolean);
 return {nip,date,nrKSeF,number:text(fa,'P_2'),seller:text(get(get(doc.documentElement,'Podmiot1'),'DaneIdentyfikacyjne'),'Nazwa'),gross:text(fa,'P_15'),currency:text(fa,'KodWaluty'),type:text(fa,'RodzajFaktury'),accounts};
}
async function convert({archive,count,signal,environment='production',onProgress=()=>{},onInvoice=()=>{}},render){
 check(signal);if(!Number.isInteger(count)||count<0)throw new Error('Niepoprawna liczba faktur KSeF.');
 const files=Object.values(archive.files).filter(file=>!file.dir && /\.xml$/i.test(file.name));if(files.length!==count)throw new Error('Liczba faktur w archiwum KSeF jest niezgodna.');
 const output=new root.JSZip(),names=new Set();let total=0;
 const api=files.length?(render || await renderer()):null;check(signal);
 for(const [index,file] of files.entries()){
  check(signal);onProgress('Tworzenie PDF: '+(index+1)+' z '+count+'…');
  const bytes=await file.async('uint8array');check(signal);if(bytes.byteLength>10*1024*1024)throw new Error(file.name+': faktura przekracza limit 10 MB.');
  const data=invoiceData(bytes,file.name),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const hash=btoa(Array.from(digest,byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const domain=environment==='production'?'https://qr.ksef.mf.gov.pl':'https://qr-test.ksef.mf.gov.pl';
  const qrCode=domain+'/invoice/'+data.nip+'/'+data.date.split('-').reverse().join('-')+'/'+hash;
  const blob=await api.generateInvoice(new File([bytes],file.name,{type:'application/xml'}),{nrKSeF:data.nrKSeF,qrCode},'blob');check(signal);
  if(!(blob instanceof Blob) || blob.size<5 || await blob.slice(0,5).text()!=='%PDF-')throw new Error(file.name+': nie udało się utworzyć PDF.');
  total+=blob.size;if(total>200*1024*1024)throw new Error('PDF-y KSeF przekraczają limit 200 MB.');
  const base=file.name.split(/[\\/]/).at(-1).replace(/\.xml$/i,'').replace(/[\x00-\x1f\x7f<>:"|?*]/g,'_').replace(/^\.+/,'').slice(0,170)||'faktura';let name=base+'.pdf',n=2;while(names.has(name.normalize('NFC').toLowerCase()))name=base+' ('+(n++)+').pdf';names.add(name.normalize('NFC').toLowerCase());output.file(name,await blob.arrayBuffer());onInvoice(data);
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 check(signal);const blob=await output.generateAsync({type:'blob',compression:'STORE'},()=>check(signal));check(signal);return blob;
}
const api={convert,invoiceData};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFKsefPDF=api;
})(typeof window==='object'?window:globalThis);
