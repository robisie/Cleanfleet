(function(root){
'use strict';
const TABLE='cf_accounting_invoice_history';
function months(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Niepoprawny miesiąc historii.');const [y,m]=month.split('-').map(Number);return Array.from({length:4},(_,i)=>new Date(Date.UTC(y,m-1-i,1)).toISOString().slice(0,7));}
function scope({month,nip,environment='production'}){months(month);nip=String(nip||'').replace(/\D/g,'');if(!/^\d{10}$/.test(nip)||!['production','test'].includes(environment))throw new Error('Podaj NIP i środowisko KSeF, aby odczytać historię.');return {month,nip,environment};}
function amount(value){
 const text=String(value??'').trim(),match=text.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
 if(!match||match[3]?.slice(2).replace(/0/g,'')||typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER/100))return null;
 const whole=match[2].replace(/^0+(?=\d)/,''),fraction=(match[3]||'').slice(0,2).padEnd(2,'0');
 return (match[1]==='-' && (whole!=='0'||fraction!=='00')?'-':'')+whole+'.'+fraction;
}
function cleanInvoices(invoices,month){
 if(!Array.isArray(invoices)||invoices.length>20000)throw new Error('Niepoprawne dane historii faktur.');const unique=new Map();
 for(const i of invoices){
  const row={};for(const key of ['date','nip','nrKSeF','number','seller','currency','type'])row[key]=String(i[key]??'').trim().slice(0,1000);row.gross=amount(i.gross);row.currency=row.currency.toUpperCase();
  const fields=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date))fields.push('niepoprawna data wystawienia');
  else if(row.date.slice(0,7)!==month)fields.push('data wystawienia '+row.date+' jest spoza miesiąca '+month);
  if(!/^\d{10}$/.test(row.nip))fields.push('brak poprawnego NIP-u sprzedawcy');
  if(!row.number)fields.push('brak numeru faktury');
  if(row.gross===null)fields.push('brak lub niepoprawna kwota brutto');
  if(!/^[A-Z]{3}$/.test(row.currency))fields.push('brak poprawnej waluty');
  if(fields.length)throw new Error('Faktura '+(row.number||row.nrKSeF||'(bez numeru)')+': '+fields.join('; ')+'.');
  row.accounts=(i.accounts||[]).map(a=>String(a).slice(0,100)).slice(0,20);unique.set(row.nrKSeF||JSON.stringify([row.nip,row.number,row.date,row.gross,row.currency]),row);
 }
 const result=[...unique.values()];if(JSON.stringify(result).length>8*1024*1024)throw new Error('Historia miesiąca przekracza limit rozmiaru.');return result;
}
async function archiveMetadata(archive,count,signal){
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
 const files=Object.values(archive.files).filter(file=>!file.dir && /(?:^|\/)_metadata\.json$/i.test(file.name));
 if(!files.length)return null;
 if(files.length!==1)throw new Error('Eksport zawiera kilka zestawień metadanych KSeF.');
 const bytes=await files[0].async('uint8array');if(bytes.length>12*1024*1024)throw new Error('Zestawienie KSeF przekracza limit rozmiaru.');
 let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){throw new Error('Niepoprawne zestawienie metadanych KSeF.');}
 const items=Array.isArray(parsed)?parsed:parsed?.invoices;
 if(!Array.isArray(items)||items.length!==count)throw new Error('Liczba faktur w zestawieniu KSeF jest niezgodna.');
 const seen=new Set(),xmlNumbers=new Set(Object.values(archive.files).filter(file=>!file.dir&&/\.xml$/i.test(file.name)).map(file=>file.name.split(/[\\/]/).at(-1).replace(/\.xml$/i,'').toLowerCase()));
 const invoices=items.map(item=>{
  const nrKSeF=String(item.ksefNumber||'');
  if(!/^\d{10}-\d{8}-[0-9a-f]{12}-[0-9a-f]{2}$/i.test(nrKSeF)||seen.has(nrKSeF.toLowerCase())||!xmlNumbers.has(nrKSeF.toLowerCase()))throw new Error('Zestawienie KSeF nie odpowiada fakturom XML w archiwum.');seen.add(nrKSeF.toLowerCase());
  return {nrKSeF,number:item.invoiceNumber,date:item.issueDate,nip:item.seller?.nip,seller:item.seller?.name||'',gross:item.grossAmount,currency:item.currency,type:item.invoiceType,accounts:[]};
 });
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');return invoices;
}
function mergeMetadata(invoices,metadata){
 if(!metadata)return invoices;
 const source=new Map((invoices||[]).map(i=>[String(i.nrKSeF||'').toLowerCase(),i]));
 return metadata.map(m=>{const xml=source.get(m.nrKSeF.toLowerCase());if(xml && (xml.nip!==m.nip||xml.number!==m.number||xml.date!==m.date))throw new Error('Dane zestawienia KSeF są niezgodne z fakturą '+m.number+'.');return {...m,accounts:xml?.accounts||[]};});
}
async function owner(client){if(!client)throw new Error('Brak połączenia z historią. Odśwież aplikację.');const {data,error}=await client.auth.getUser();if(error||!data?.user?.id)throw new Error('Zaloguj się ponownie, aby zapisać lub odczytać historię.');return data.user.id;}
async function save(client,context,invoices,signal){const s=scope(context),clean=cleanInvoices(invoices,s.month),user_id=await owner(client);const query=client.from(TABLE).upsert({...s,user_id,invoices:clean,invoice_count:clean.length,updated_at:new Date().toISOString()},{onConflict:'user_id,environment,nip,month'});const {error}=await (signal?query.abortSignal(signal):query);if(error)throw new Error('Nie udało się zapisać historii KSeF. '+error.message);return clean.length;}
function yearMonths(month,now=new Date()){months(month);const year=Number(month.slice(0,4));if(year>now.getFullYear())throw new Error('Nie można pobrać historii przyszłego roku.');return Array.from({length:year===now.getFullYear()?now.getMonth()+1:12},(_,i)=>year+'-'+String(i+1).padStart(2,'0'));}
async function load(client,context,signal){return loadMonths(client,context,months(context.month),signal);}
async function loadMonths(client,context,expected,signal){const s=scope(context);if(!Array.isArray(expected)||!expected.length||expected.length>12)throw new Error('Niepoprawny zakres historii.');expected.forEach(months);const user_id=await owner(client);const query=client.from(TABLE).select('month,invoices,invoice_count').eq('user_id',user_id).eq('environment',s.environment).eq('nip',s.nip).in('month',expected);const {data,error}=await (signal?query.abortSignal(signal):query);if(error)throw new Error('Nie udało się odczytać historii KSeF. '+error.message);const snapshots=(data||[]).map(row=>{const invoices=cleanInvoices(row.invoices,row.month);if(invoices.length!==row.invoice_count)throw new Error('Niekompletna historia KSeF. Pobierz ten miesiąc ponownie.');return {...row,invoices};});return {snapshots,expected};}
const api={months,yearMonths,scope,amount,cleanInvoices,archiveMetadata,mergeMetadata,save,load,loadMonths};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFAccountingHistory=api;
})(typeof window==='object'?window:globalThis);
