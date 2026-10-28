export function monthDates(month){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||''))throw Error('Wybierz miesiąc.');const [y,m]=month.split('-').map(Number);return {from:month+'-01',to:month+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')};}
export const counterparty=(row,kind)=>kind==='sales'?{name:row.buyer?.name||'Nabywca bez nazwy',id:row.buyer?.identifier?.value||''}:{name:row.seller?.name||'Sprzedawca bez nazwy',id:row.seller?.nip||''};
export function invoicePdfName(row,kind='purchases',usedNames=new Set()){
 const part=(value,fallback,max)=>{const text=String(value||fallback).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').replace(/\s+/g,' ').trim().replace(/^[. ]+|[. ]+$/g,'');let result='',bytes=0;for(const char of text){bytes+=new TextEncoder().encode(char).length;if(bytes>max)break;result+=char;}return result.replace(/[. ]+$/g,'')||fallback;};
 const name=part(counterparty(row,kind).name,'Kontrahent',100),date=part(row.issueDate,'brak-daty',10),number=part(row.invoiceNumber||row.ksefNumber,'bez-numeru',90),base=name+' - '+date+' - '+number;
 let filename=base+'.pdf',index=2;
 while(usedNames.has(filename.toLocaleLowerCase('pl')))filename=base+' ('+(index++)+').pdf';
 usedNames.add(filename.toLocaleLowerCase('pl'));return filename;
}
export function visibleInvoices(rows,{q='',kind='purchases',sort='Desc',dateType='Issue'}={}){
 const key={Issue:'issueDate',Invoicing:'invoicingDate',PermanentStorage:'permanentStorageDate'}[dateType]||'issueDate';
 return rows.filter(r=>{const p=counterparty(r,kind);return [p.name,p.id,r.invoiceNumber,r.ksefNumber].join(' ').toLocaleLowerCase('pl').includes(q.trim().toLocaleLowerCase('pl'));}).sort((a,b)=>{if(sort==='party')return counterparty(a,kind).name.localeCompare(counterparty(b,kind).name,'pl')||a.ksefNumber.localeCompare(b.ksefNumber);if(sort==='amount')return String(a.currency).localeCompare(String(b.currency))||Number(b.grossAmount)-Number(a.grossAmount)||a.ksefNumber.localeCompare(b.ksefNumber);return (sort==='Asc'?1:-1)*(String(a[key]||'').localeCompare(String(b[key]||''))||a.ksefNumber.localeCompare(b.ksefNumber));});
}
export function mergeInvoices(oldRows,newRows){const map=new Map(oldRows.map(r=>[r.ksefNumber,r]));for(const row of newRows){if(!/^\d{10}-\d{8}-[a-f\d]{12}-[a-f\d]{2}$/i.test(row.ksefNumber||''))throw Error('Nieprawidłowy numer na liście KSeF.');map.set(row.ksefNumber,row);}return [...map.values()];}
export const bytesFromBase64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function digest(bytes){return btoa(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>String.fromCharCode(v)).join(''));}
export async function verifyInvoice(bytes,row){if(bytes.length>10*1024*1024||!bytes.length)throw Error('Nieprawidłowy rozmiar faktury.');if(!row.invoiceHash||await digest(bytes)!==row.invoiceHash)throw Error('Treść faktury nie zgadza się z jej skrótem w KSeF. Odśwież listę i spróbuj ponownie.');return bytes;}
