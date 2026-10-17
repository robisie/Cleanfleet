// Service-only bridge. Never trusts browser amounts or attachment rows.
export function fleetParty(company,billing){
 const c=billing||company,nip=String((billing?c.tax_id:c.nip)||'').replace(/[\s-]/g,'');
 const country=/^DE/i.test(nip)?'DE':'PL';let address=String(c.address||'').replace(/,?\s*Niemcy\s*$/i,''),city='';
 const m=address.match(country==='DE'?/^(.*?)[,\n ]+(\d{5}\s+.+)$/s:/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(m){address=m[1].trim();city=m[2].trim();}
 return {kind:'company',name:c.name,nip,address,city,country};
}
export function fleetOptions(input={}){
 const columns=['typ','tablica','data','kwota','rozliczone'].filter(k=>input.columns?.includes(k));
 if(!columns.length)throw Error('Wybierz kolumny załącznika.');
 return {includeUnassigned:input.includeUnassigned===true,columns,service:input.service===true,summary:['personal','heavy','bus'].filter(k=>input.summary?.includes(k))};
}
export function guardFleetPayload(payload,attachment){
 if(!attachment)return payload;
 const cents=attachment.snapshot.reduce((s,r)=>s+Math.round(Number(r.cost)*100),0),cur=attachment.snapshot[0].currency;
 if(payload.correction||payload.lines?.length!==1||Number(payload.lines[0].qty)!==1||Math.round(Number(String(payload.lines[0].price).replace(',','.'))*100)!==cents||payload.currency!==cur)throw Error('Kwota faktury musi odpowiadać wybranym autom. Zmień wybór w CleanFleet.');
 return {...payload,source:{app:'cleanfleet',id:attachment.company_id,fleetId:attachment.invoice_id}};
}
export const fleetView=(a,row)=>({invoiceId:row.id,number:row.number,status:row.status,buyer:row.payload.buyer,currency:row.payload.currency,period:a.period,rows:a.snapshot.map(r=>({id:r.id,plate:r.plate,type:r.type,date:r.wash_date,cost:r.cost,paid:r.paid,category:r.billing_category})),options:a.options});
