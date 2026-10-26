// Shopping links describe existing purchase lines; they never create costs or payments.
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const qty=n=>Math.round(n*1e6)/1e6;
const num=v=>v==null||v===''?null:Number(String(v).replace(',','.'));
export const normalize=v=>String(v||'').toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9]+/g,' ').trim();
export const unit=v=>{const value=normalize(String(v||'').replace(/²/g,'2').replace(/³/g,'3'));return {szt:'szt',sztuka:'szt',sztuki:'szt',sztuk:'szt',mb:'m',metr:'m',metry:'m',litr:'l',litry:'l',litrow:'l',kilogram:'kg'}[value]||value;};
const key=(id,index)=>JSON.stringify([id,index]);
const list=project=>Array.isArray(project.shoppingList)?project.shoppingList:[];
export function purchaseLines(project){
 const rows=[];
 for(const purchase of project.purchases||[]){
  if(!purchase.sourceKsefNumber&&purchase.documentType!=='invoice')continue;
  if(purchase.ksefCorrections?.length)continue; // A corrected quantity needs review against the original document.
  for(const [position,item] of (Array.isArray(purchase.invoiceItems)?purchase.invoiceItems:[]).entries()){
   const index=Number.isInteger(item.index)?item.index:position+1,selected=purchase.selectedKsefQuantities?.find(e=>e.index===index);
   if(Array.isArray(purchase.selectedKsefRows)&&!purchase.selectedKsefRows.includes(index))continue;
   if(Array.isArray(purchase.selectedKsefQuantities)&&!selected)continue;
   const quantity=num(selected?.quantity??item.quantity),amount=num(selected?.gross??item.gross);
   // Unknown quantities cannot safely fulfill a specific shopping quantity.
   if(!item.name||!Number.isFinite(quantity)||!(quantity>0)||amount!=null&&(!Number.isFinite(amount)||amount<0))continue;
   rows.push({key:key(purchase.id,index),purchaseId:purchase.id,index,name:String(item.name),quantity,unit:String(item.unit||''),amount,date:purchase.date||'',shop:purchase.shop||'',invoice:purchase.invoice||'',ksef:purchase.sourceKsefNumber||''});
  }
 }
 return rows;
}
export function rows(project){
 const sources=purchaseLines(project),used=new Map(),amounts=new Map();for(const item of list(project))for(const link of item.links||[]){const k=key(link.purchaseId,link.index),before=used.get(k)||0,after=qty(before+Number(link.quantity)),source=sources.find(s=>s.key===k);used.set(k,after);if(source?.amount!=null)amounts.set(JSON.stringify([item.id,k]),round(round(source.amount*after/source.quantity)-round(source.amount*before/source.quantity)));}
 return list(project).map(item=>{
  const links=(item.links||[]).map(link=>{const source=sources.find(s=>s.key===key(link.purchaseId,link.index)),valid=!!source&&Number(link.quantity)>0&&used.get(source.key)<=source.quantity+1e-8&&(!item.unit||unit(item.unit)===unit(source.unit));return {...link,source:source||link.snapshot||null,valid,amount:valid&&source.amount!=null?amounts.get(JSON.stringify([item.id,source.key])):null};});
  const valid=links.filter(l=>l.valid),linked=qty(valid.reduce((s,l)=>s+Number(l.quantity),0)),manual=Number(item.boughtQuantity)||0,bought=Math.min(Number(item.quantity),Math.max(manual,linked)),remaining=qty(Math.max(0,Number(item.quantity)-bought));
  return {...item,links,linked,bought,remaining,invalid:links.some(l=>!l.valid),state:remaining<=0?'bought':bought>0?'partial':'needed',name:valid.at(-1)?.source.name||item.name,shop:[...new Set(valid.map(l=>l.source.shop).filter(Boolean))].join(' · ')||item.shop||'',date:valid.map(l=>l.source.date).filter(Boolean).sort().at(-1)||item.boughtDate||'',amount:valid.length&&valid.every(l=>l.amount!=null)?round(valid.reduce((s,l)=>s+l.amount,0)):null};
 });
}
export function available(project,line){const used=list(project).flatMap(i=>i.links||[]).filter(l=>key(l.purchaseId,l.index)===line.key).reduce((s,l)=>s+Number(l.quantity),0);return qty(Math.max(0,line.quantity-used));}
export function score(item,line){
 const names=[item.originalName||item.name,item.name].map(normalize),name=normalize(line.name),words=name.split(' '),tokens=names.flatMap(n=>n.split(' ')).filter(w=>w.length>2);
 const matched=[...new Set(tokens)].filter(w=>words.some(t=>t===w||(t.length>3&&w.length>3&&(t.startsWith(w)||w.startsWith(t)||t.slice(0,4)===w.slice(0,4)))));
 const product=names.includes(name)?1:matched.length/Math.max(1,new Set(tokens).size);if(product<.3||!matched.length&&!names.includes(name))return 0;
 if(item.unit&&line.unit&&unit(item.unit)!==unit(line.unit))return 0;
 const shop=normalize(item.shop),store=normalize(line.shop),same=shop&&store&&(store.includes(shop)||shop.includes(store));return product*.8+(same ? .2 : 0);
}
export function suggestions(project){
 const sources=purchaseLines(project),items=rows(project);return items.flatMap(item=>item.linked>=item.quantity?[]:sources.filter(line=>available(project,line)>0&&!(item.rejectedLinks||[]).some(r=>key(r.purchaseId,r.index)===line.key)).map(line=>({item,line,score:score(item,line)})).filter(r=>r.score>=.3).sort((a,b)=>b.score-a.score).slice(0,3));
}
export function saveItem(project,values,id,makeId=()=>crypto.randomUUID()){
 const next=structuredClone(project),old=list(next).find(x=>x.id===id),name=String(values.name||'').trim(),quantity=num(values.quantity===''||values.quantity==null?1:values.quantity),bought=num(values.boughtQuantity||0),date=String(values.boughtDate||'');
 if(id&&!old)throw Error('Nie znaleziono pozycji. Odśwież listę.');
 if(!name||name.length>300||!(quantity>0)||quantity>1e9||quantity!==qty(quantity)||!Number.isFinite(bought)||bought!==qty(bought)||bought<0||bought>quantity)throw Error('Podaj nazwę, dodatnią ilość oraz poprawną ilość kupioną.');
 if(bought>0&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw Error('Podaj datę zakupu.');
 const item={...old,id:old?.id||makeId(),name,originalName:old?.originalName||name,shop:String(values.shop||'').trim().slice(0,300),quantity,unit:String(values.unit||'').trim().slice(0,30),boughtQuantity:bought,boughtDate:bought>0?date:'',links:old?.links||[]};
 const current=old?rows(project).find(x=>x.id===id):null;if(current?.linked>quantity||current?.links.some(l=>l.valid&&item.unit&&unit(item.unit)!==unit(l.source.unit)))throw Error('Ilość lub jednostka nie pasuje do powiązanych faktur. Najpierw odłącz powiązanie.');
 next.shoppingList=old?list(next).map(x=>x.id===id?item:x):[...list(next),item];return next;
}
export function toggle(project,id,date){const next=structuredClone(project),item=list(next).find(x=>x.id===id);if(!item)throw Error('Nie znaleziono pozycji.');const state=rows(project).find(x=>x.id===id);if(state.linked>=item.quantity)throw Error('Zakup potwierdza faktura. Aby cofnąć, odłącz powiązanie.');item.boughtQuantity=state.state==='bought'?0:item.quantity;item.boughtDate=item.boughtQuantity?date:'';return next;}
export function link(project,id,sourceKey,quantity){
 const next=structuredClone(project),item=list(next).find(x=>x.id===id),line=purchaseLines(next).find(x=>x.key===sourceKey),n=num(quantity),row=rows(next).find(x=>x.id===id);
 if(!item||!line||!(n>0)||n!==qty(n)||n>available(next,line)+1e-8||n>item.quantity-row.linked+1e-8)throw Error('Nieprawidłowa lub niedostępna ilość. Odśwież listę i sprawdź przypisanie faktury.');
 if(item.unit&&unit(item.unit)!==unit(line.unit))throw Error('Jednostki różnią się. Ustaw zgodną jednostkę na liście; ilości nie są przeliczane automatycznie.');
 if(!item.unit)item.unit=line.unit;
 item.rejectedLinks=(item.rejectedLinks||[]).filter(r=>key(r.purchaseId,r.index)!==sourceKey);
 const existing=item.links?.find(l=>l.purchaseId===line.purchaseId&&l.index===line.index);if(existing)existing.quantity=qty(existing.quantity+n);else(item.links||=[]).push({purchaseId:line.purchaseId,index:line.index,quantity:n,snapshot:structuredClone(line)});return next;
}
export function rejectSuggestion(project,id,sourceKey){
 const next=structuredClone(project),item=list(next).find(x=>x.id===id),line=purchaseLines(next).find(x=>x.key===sourceKey);
 if(!item||!line)throw Error('Nie znaleziono propozycji. Odśwież listę.');
 if(!(item.rejectedLinks||[]).some(r=>key(r.purchaseId,r.index)===sourceKey))(item.rejectedLinks||=[]).push({purchaseId:line.purchaseId,index:line.index});
 return next;
}
export function restoreSuggestions(project){const next=structuredClone(project);for(const item of list(next))item.rejectedLinks=[];return next;}
export function unlink(project,id,purchaseId,index,{reject=false}={}){const next=structuredClone(project),item=list(next).find(x=>x.id===id);if(!item)throw Error('Nie znaleziono pozycji.');const linked=(item.links||[]).some(l=>l.purchaseId===purchaseId&&l.index===Number(index));item.links=(item.links||[]).filter(l=>l.purchaseId!==purchaseId||l.index!==Number(index));if(reject&&linked&&!(item.rejectedLinks||[]).some(r=>r.purchaseId===purchaseId&&r.index===Number(index)))(item.rejectedLinks||=[]).push({purchaseId,index:Number(index)});return next;}
export function remove(project,id){const next=structuredClone(project);next.shoppingList=list(next).filter(i=>i.id!==id);return next;}
export function totals(project){const items=rows(project);return {needed:items.filter(x=>x.state==='needed').length,partial:items.filter(x=>x.state==='partial').length,bought:items.filter(x=>x.state==='bought').length,amount:round(items.reduce((s,r)=>s+(r.amount||0),0)),unknown:items.filter(x=>x.linked>0&&x.amount==null).length,invalid:items.filter(x=>x.invalid).length};}
