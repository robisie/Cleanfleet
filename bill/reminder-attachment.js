export const MAX_REMINDER_PDF_BYTES=4*1024*1024;
export const MAX_REMINDER_PDF_BASE64=4*Math.ceil(MAX_REMINDER_PDF_BYTES/3);

export function reminderPdfName(number){
 const safe=String(number||'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,120);
 return safe?'Faktura_'+safe+'.pdf':'';
}

export function invoiceMailAttachment(value,row){
 const filename=reminderPdfName(row.number);
 if(!value||!filename||!row.updated_at||value.invoiceId!==row.id||value.version!==row.updated_at)return null;
 const {pdf}=value;
 if(typeof pdf!=='string'||pdf.length>MAX_REMINDER_PDF_BASE64)return null;
 try{
  const bytes=atob(pdf);
  if(bytes.length>MAX_REMINDER_PDF_BYTES||!bytes.startsWith('%PDF-')||!bytes.trimEnd().endsWith('%%EOF'))return null;
  return {filename,content:pdf,encoding:'base64',contentType:'application/pdf'};
 }catch{
  return null;
 }
}
