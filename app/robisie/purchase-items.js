import {round,number} from './core.js?v=1.0.67';
export function cachedPreview(link){
 const items=link.items;if(!Array.isArray(items)||!items.length||!items.every(x=>Number.isInteger(x.index)&&x.index>0))return null;
 const gross=Number(link.document.grossAmount),currency=link.document.payload.currency;
 const known=items.every(x=>typeof x.gross==='number'&&Number.isFinite(x.gross));
 const reconciled=known&&round(items.reduce((s,x)=>s+x.gross,0))===round(gross);
 const canSelect=currency==='PLN'&&!link.document.referenceOnly&&reconciled;
 return {items,gross,currency,canSelect,warning:canSelect?'':'Brak jednoznacznej kwoty brutto części pozycji. Można rozliczyć całą fakturę.'};
}
export function itemSelection(preview,chosen){
 const all=preview.items.map(x=>x.index),indices=chosen==null?all:[...chosen].sort((a,b)=>a-b);
 if(new Set(indices).size!==indices.length||indices.some(x=>!all.includes(x)))throw Error('Nieprawidłowy wybór pozycji.');
 if(!preview.canSelect&&indices.length!==all.length)throw Error('Ta faktura wymaga rozliczenia w całości.');
 const items=preview.items.filter(x=>indices.includes(x.index));
 const total=indices.length===all.length?number(preview.gross):round(items.reduce((s,x)=>s+Math.round(number(x.gross)*100),0)/100);
 if(preview.canSelect&&(!indices.length||total<0||total>number(preview.gross)+.001))throw Error('Wybierz pozycje o łącznej kwocie mieszczącej się w wartości faktury.');
 return {indices,items,total,description:items.map(x=>[x.name,x.quantity,x.unit].filter(v=>v!=null&&v!=='').join(' ')).join('; ')};
}
// Recover a source reference only from an invoice already assigned to this project.
// Reset settlements can leave the original purchase without its KSeF metadata.
export function restoreSource(project,id,links,projectId){
 const item=project.purchases.find(p=>p.id===id);
 if(!item||item.sourceKsefNumber||!item.invoice||!item.supplierNip)return null;
 const same=project.purchases.filter(p=>p.invoice===item.invoice&&p.supplierNip===item.supplierNip);
 if(same.length!==1)return null;
 const matches=links.filter(l=>l.project_id===projectId&&l.kind==='purchases'&&!l.document.referenceOnly&&l.document.number===item.invoice&&l.ksef_number.slice(0,10)===item.supplierNip);
 if(matches.length!==1)return null;
 const link=matches[0],preview=cachedPreview(link);if(!preview)return null;
 const selection=itemSelection(preview,link.document.selectedIndices??null);
 if(round(item.amount)!==round(selection.total)||round(link.document.importedAmount??selection.total)!==round(selection.total))return null;
 if(project.purchases.some(p=>p.id!==id&&p.sourceKsefNumber===link.ksef_number))return null;
 const next=structuredClone(project),purchase=next.purchases.find(p=>p.id===id);
 Object.assign(purchase,{sourceKsefNumber:link.ksef_number,selectedKsefRows:selection.indices,invoiceItems:selection.items,invoiceGrossAmount:preview.gross});
 return next;
}
