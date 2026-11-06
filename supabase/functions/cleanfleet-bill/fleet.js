import {decimal,invoiceAmount} from './invoice.js';

// Service-only bridge. Never trusts browser amounts or attachment rows.
export async function fleetPaymentEvidence(db,ids,{legacy=false,userId}={}){
 if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw Error('Nieprawidłowy wybór faktur CleanFleet.');
 if(!ids.length)return [];
 let query=db.from(legacy?'bill_legacy_fleet_payment_links':'bill_fleet_attachments')
  .select(legacy?'invoice_id,cf_invoice_id,bill_invoices!inner(creator_id,number,payload)':'invoice_id,cf_invoice_id');
 if(legacy){
  if(!userId)throw Error('Brak właściciela rozliczenia.');
  query=query.eq('bill_invoices.creator_id',userId);
 }
 const links=await query.in('invoice_id',[...new Set(ids)]);
 if(links.error)throw Error(links.error.message);
 const linkedIds=[...new Set((links.data||[]).map(row=>row.cf_invoice_id).filter(Boolean))];
 if(!linkedIds.length)return [];
 const result=await db.from('invoices').select(legacy?'id,status,invoice_number,invoice_date,amount,currency':'id,status').in('id',linkedIds);
 if(result.error)throw Error(result.error.message);
 const invoices=new Map((result.data||[]).map(row=>[row.id,row]));
 const evidence=[];
 for(const row of links.data||[]){
  const invoice=invoices.get(row.cf_invoice_id);
  if(!invoice)continue;
  if(legacy){
   const bill=row.bill_invoices;
   if(!bill||invoice.invoice_number!==bill.number||invoice.invoice_date!==bill.payload.issueDate||
      invoice.currency!==bill.payload.currency||decimal(invoice.amount)!==invoiceAmount(bill.payload))continue;
  }
  evidence.push({invoice_id:row.invoice_id,paid:invoice.status==='paid'});
 }
 return evidence;
}
export function fleetParty(company,billing){
 const c=billing||company,nip=String((billing?c.tax_id:c.nip)||'').replace(/[\s-]/g,'');
 const country=/^DE/i.test(nip)?'DE':'PL';let address=String(c.address||'').replace(/,?\s*Niemcy\s*$/i,''),city='';
 const m=address.match(country==='DE'?/^(.*?)[,\n ]+(\d{5}\s+.+)$/s:/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(m){address=m[1].trim();city=m[2].trim();}
 return {kind:'company',name:c.name,nip,address,city,country};
}
export function fleetOptions(input={}){return {layout:'vehicle-lines',includeUnassigned:input.includeUnassigned===true};}
export function guardFleetPayload(payload,attachment){
 if(!attachment)return payload;
 if((payload.documentType||'standard')!=='standard')throw Error('Wybrane auta można rozliczyć tylko zwykłą fakturą.');
 if(decimal(payload.globalDiscount||'0')!==0)throw Error('Kwoty aut nie mogą mieć dodatkowych rabatów ani wyrównań.');
 if(payload.lines?.some(l=>Number(String(l.discount||0).replace(',','.'))!==0))throw Error('Kwoty aut nie mogą mieć dodatkowych rabatów ani wyrównań.');
 const cents=attachment.snapshot.reduce((s,r)=>s+Math.round(Number(r.cost)*100),0),cur=attachment.snapshot[0].currency;
 const amountError='Kwota faktury musi odpowiadać wybranym autom. Zmień wybór w CleanFleet.';
 if(attachment.options?.layout==='vehicle-lines'){
  if(payload.correction||payload.currency!==cur||payload.lines?.length!==attachment.snapshot.length||payload.lines.some((l,i)=>Number(l.qty)!==1||Math.round(Number(String(l.price).replace(',','.'))*100)!==Math.round(Number(attachment.snapshot[i].cost)*100)||!String(l.name).endsWith(' — '+attachment.snapshot[i].plate)||!String(l.name).slice(0,-(' — '+attachment.snapshot[i].plate).length).trim()))throw Error('Każda pozycja musi zawierać tablicę i cenę właściwego auta, z ilością 1.');
  if(invoiceAmount(payload)!==cents)throw Error(amountError);
  return {...payload,source:{app:'cleanfleet',id:attachment.company_id,fleetId:attachment.invoice_id,fleetLayout:'vehicle-lines'}};
 }
 if(payload.correction||payload.lines?.length!==1||Number(payload.lines[0].qty)!==1||Math.round(Number(String(payload.lines[0].price).replace(',','.'))*100)!==cents||payload.currency!==cur||invoiceAmount(payload)!==cents)throw Error(amountError);
 return {...payload,source:{app:'cleanfleet',id:attachment.company_id,fleetId:attachment.invoice_id}};
}
export const fleetView=(a,row)=>a.options?.layout==='vehicle-lines'?{noAttachment:true,invoiceId:row.id,number:row.number}:({invoiceId:row.id,number:row.number,status:row.status,buyer:row.payload.buyer,currency:row.payload.currency,period:a.period,rows:a.snapshot.map(r=>({id:r.id,plate:r.plate,type:r.type,date:r.wash_date,cost:r.cost,paid:r.paid,category:r.billing_category})),options:a.options});
