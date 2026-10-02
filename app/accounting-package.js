(function(root){
'use strict';
const MONTHS=['STYCZEŃ','LUTY','MARZEC','KWIECIEŃ','MAJ','CZERWIEC','LIPIEC','SIERPIEŃ','WRZESIEŃ','PAŹDZIERNIK','LISTOPAD','GRUDZIEŃ'];
function monthFolder(month){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || ''))throw new Error('Wybierz miesiąc.');const number=Number(month.slice(5));return number+' '+MONTHS[number-1];}
function safeName(name){return String(name || 'dokument').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f<>:"|?*]/g,'_').replace(/^\.+/,'').slice(0,180) || 'dokument';}
function check(signal){if(signal?.aborted)throw new DOMException('Anulowano','AbortError');}
async function build({month,ksef,organizerFiles=[],bankResults=[],mailFiles=[],signal,onProgress=()=>{}},Zip=root.JSZip){
 if(!Zip)throw new Error('Biblioteka ZIP nie została załadowana.');
 const base=monthFolder(month),zip=new Zip(),names=new Set(),counts={purchases:0,sales:0,organizer:0,bank:0,mail:0};let size=0;
 const folders={purchases:base+'/faktury zakupowe/KSEF',sales:base+'/faktury sprzedażowe',bank:base+'/wyciągi bankowe'};
 [base+'/faktury zakupowe',folders.purchases,folders.sales,folders.bank,base+'/raport kasowy'].forEach(path=>zip.folder(path));
 function add(folder,name,bytes){check(signal);size+=bytes.byteLength;if(size>300*1024*1024)throw new Error('Dokumenty przekraczają limit wspólnej paczki 300 MB.');const original=safeName(name),dot=original.lastIndexOf('.');let next=original,index=2;while(names.has((folder+'/'+next).normalize('NFC').toLowerCase())){next=(dot>0?original.slice(0,dot):original)+' ('+(index++)+')'+(dot>0?original.slice(dot):'');}names.add((folder+'/'+next).normalize('NFC').toLowerCase());zip.file(folder+'/'+next,bytes);}
 for(const kind of ['purchases','sales']){
  check(signal);const result=ksef?.[kind];if(!result)continue;if( result.month!==month || !Number.isInteger(result.count) || result.count<0)throw new Error('Brak poprawnego eksportu '+(kind==='purchases'?'zakupów':'sprzedaży')+' z KSeF za wybrany miesiąc.');
  if(!result.count){if(result.blob)throw new Error('Niezgodny pusty eksport KSeF.');continue;}
  if(!result.blob)throw new Error('Niepełny eksport KSeF.');onProgress('Układanie faktur z KSeF…');
  const archive=await Zip.loadAsync(await result.blob.arrayBuffer(),{checkCRC32:true});check(signal);
  const files=Object.values(archive.files).filter(file=>!file.dir);if(files.filter(file=>/\.xml$/i.test(file.name)).length!==result.count)throw new Error('Liczba faktur w archiwum KSeF jest niezgodna.');
  for(const file of files){check(signal);add(folders[kind],file.name,await file.async('uint8array'));}counts[kind]=result.count;
 }
 for(const file of organizerFiles){check(signal);if(!/\.pdf$/i.test(file.name) && file.type!=='application/pdf')throw new Error('mOrganizer: wybierz pliki PDF.');onProgress('Dołączanie PDF: '+file.name);add(folders.sales,/\.pdf$/i.test(file.name)?file.name:file.name+'.pdf',new Uint8Array(await file.arrayBuffer()));counts.organizer++;}
 for(const result of bankResults){if(!/\.txt$/i.test(result.filename) || result.month!==month)throw new Error('Niepoprawny wyciąg MT940.');add(folders.bank,result.filename,result.bytes);counts.bank++;}
 for(const file of mailFiles){check(signal);add(folders.bank,file.name,new Uint8Array(await file.blob.arrayBuffer()));counts.mail++;}
 check(signal);onProgress('Tworzenie wspólnego ZIP…');const bytes=await zip.generateAsync({type:'uint8array',compression:'STORE'},()=>check(signal));check(signal);return {bytes,counts,root:base};
}
const api={monthFolder,safeName,build};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFAccountingPackage=api;
})(typeof window==='object'?window:globalThis);
