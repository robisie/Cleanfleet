import {round,number} from './core.js?v=1.0.56';
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
