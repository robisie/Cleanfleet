import {visibleInvoices} from './ksef-data.js?v=1.0.31';

export const isCorrection=row=>/^kor/i.test(row.invoiceType||'');
export const dateKey=type=>({Issue:'issueDate',Invoicing:'invoicingDate',PermanentStorage:'permanentStorageDate'}[type]||'issueDate');

// Match an explicit KSeF reference first. A printed number alone is not unique.
export function relatedGroups(visible,documents,options={}){
 const all=new Map(documents.map(d=>[d.metadata.ksefNumber,{...d.metadata,references:d.references||[]}]));
 for(const row of visible)all.set(row.ksefNumber,{...all.get(row.ksefNumber),...row});
 const graph=new Map([...all.keys()].map(n=>[n,new Set()]));
 for(const row of all.values())for(const ref of row.references||[]){
  let target=ref.ksefNumber&&[...all.values()].find(r=>r.ksefNumber.toUpperCase()===ref.ksefNumber.toUpperCase());
  if(!ref.ksefNumber){const candidates=[...all.values()].filter(r=>!isCorrection(r)&&r.invoiceNumber===ref.number&&r.issueDate===ref.issueDate&&r.seller?.nip===row.seller?.nip);if(candidates.length===1)target=candidates[0];}
  if(!target||target.ksefNumber===row.ksefNumber||target.seller?.nip!==row.seller?.nip)continue;
  graph.get(row.ksefNumber).add(target.ksefNumber);graph.get(target.ksefNumber).add(row.ksefNumber);
 }
 const matching=visibleInvoices(visible,options),seen=new Set(),groups=[];
 for(const candidate of matching){
  if(seen.has(candidate.ksefNumber))continue;
  const component=new Set(),stack=[candidate.ksefNumber];
  while(stack.length){const n=stack.pop();if(component.has(n))continue;component.add(n);for(const next of graph.get(n)||[])stack.push(next);}
  const belongs=row=>options.from&&options.to?String(row[dateKey(options.dateType)]||'').slice(0,10)>=options.from&&String(row[dateKey(options.dateType)]||'').slice(0,10)<=options.to:visible.some(r=>r.ksefNumber===row.ksefNumber);
  const inRange=[...all.values()].filter(r=>component.has(r.ksefNumber)&&belongs(r));
  const originals=visibleInvoices(inRange.filter(r=>!isCorrection(r)),{...options,q:''});
  // Original first only when it belongs to this period. Otherwise anchor on correction.
  const anchor=originals[0]||matching.find(r=>component.has(r.ksefNumber))||candidate;
  const children=visibleInvoices([...component].filter(n=>n!==anchor.ksefNumber).map(n=>all.get(n)),{...options,q:'',sort:'Asc'});
  groups.push({anchor,children:children.map(row=>({...row,outsidePeriod:!belongs(row)}))});
  for(const n of component)seen.add(n);
 }
 return groups;
}

export function historyRanges(from,to){
 const ranges=[];let day=from;
 while(day<=to){const end=new Date(Date.parse(day+'T12:00:00Z')+98*86400000).toISOString().slice(0,10);ranges.push({from:day,to:end>to?to:end});day=new Date(Date.parse(end+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
 return ranges;
}

export const decodeXml=bytes=>new TextDecoder(bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8',{fatal:true}).decode(bytes);
