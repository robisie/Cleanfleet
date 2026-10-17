import {totals,round,today,number,lineValue} from './core.js';
const description=stageNumber=>stageNumber?`Usługi remontowe — rozliczenie etapu ${stageNumber}`:'Usługi remontowe';
// Copy the active final calculation. Allocation retains exact source settlement cents.
export function detailedInvoiceSeed(project){
 const p=project.payload,works=(p.works||[]).filter(l=>l.included!==false&&number(l.qty)!==0);
 if(!works.length)throw Error('Kalkulacja końcowa nie ma pozycji do zafakturowania.');
 if(works.length>200)throw Error('Kalkulacja ma ponad 200 pozycji — limit jednej faktury w Bill.');
 if(works.some(l=>number(l.qty)<0||number(l.price)<0))throw Error('Kalkulacja zawiera ujemne ilości lub ceny. Uporządkuj ją przed utworzeniem faktury rozbudowanej.');
 const total=Math.round(totals(p).works.after*100),weights=works.map(l=>l.calculationPrecision==='source'?number(l.qty)*number(l.price):lineValue(l)),sum=weights.reduce((s,v)=>s+v,0);
 if(!(total>0&&sum>0))throw Error('Kalkulacja końcowa musi mieć dodatnią wartość.');
 const allocated=weights.map(w=>Math.floor(total*w/sum)),order=weights.map((w,i)=>({i,f:total*w/sum-allocated[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
 const remainder=total-allocated.reduce((s,v)=>s+v,0);
 for(let n=0;n<remainder;n++)allocated[order[n%order.length].i]++;
 const lines=works.map((l,i)=>{
  const qty=number(l.qty).toFixed(3).replace(/\.?0+$/,''),price=round(l.price).toFixed(2),base=Math.round(Number(qty)*Number(price)*100),discount=base-allocated[i];
  if(!Number(qty)||!l.name||!l.unit)throw Error('Uzupełnij nazwy, jednostki i ilości w kalkulacji końcowej.');
  return {name:String(l.name).trim(),unit:String(l.unit).trim(),qty,price,...(discount?{discount:(discount/100).toFixed(2)}:{})};
 });
 return {lines,total:(total/100).toFixed(2),notice:'Cała aktywna kalkulacja końcowa: pozycje włączone do rozliczenia, także jeszcze niewykonane. Wartości uwzględniają rabat i wyrównanie zaokrągleń. Wpłaty, materiały i rozliczone wcześniej etapy nie są odliczane.'};
}
export function investmentInvoiceSeed(project){
 const p=project.payload,t=totals(p),buyer={name:p.investor||'',nip:'',address:p.investorAddress||'',city:'',country:'PL'};
 const match=buyer.address.match(/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(match){buyer.address=match[1].trim();buyer.city=match[2].trim();}
 const choice=(id,label,amount,stageId,stageNumber)=>({id,label,amount:round(amount).toFixed(2),description:description(stageNumber),...(stageId?{stageId,stageNumber}:{})});
 const amountOptions=[choice('completed','Należność za wykonane prace',t.works.done),choice('work-remaining','Pozostało za wykonane prace',t.workRemaining),choice('remaining','Pozostałe rozliczenie z materiałami',t.remaining),choice('whole','Wartość całego zlecenia',p.works?.length?t.works.after:t.agreed),...(p.stages||[]).map((s,i)=>choice('stage:'+s.id,`Etap ${i+1} · ${s.name}`,t.agreed*number(s.percent)/100,s.id,i+1))];
 let detailed;try{detailed=detailedInvoiceSeed(project);}catch(error){detailed={error:error.message};}
 return {buyer,description:description(),currency:'PLN',source:{app:'robisie',id:project.id,invoiceMode:'simple'},amountOptions,detailed};
}
export function stageInvoiceSeed(project,stageId){
 const p=project.payload,index=(p.stages||[]).findIndex(s=>s.id===stageId),stage=p.stages?.[index];if(!stage)throw Error('Nie znaleziono etapu inwestycji.');
 const seed=investmentInvoiceSeed(project),amount=Number(seed.amountOptions.find(o=>o.stageId===stageId).amount);if(!Number.isFinite(amount)||amount<=0)throw Error('Kwota etapu musi być większa od zera.');
 const name=description(index+1);return {...seed,description:name,source:{...seed.source,stageId:stage.id},lines:[{name,unit:'szt.',qty:'1',price:amount.toFixed(2)}],...(stage.due&&stage.due>=today()?{dueDate:stage.due}:{})};
}
