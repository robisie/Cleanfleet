import {totals,round,today} from './core.js';
// Shared calculations keep invoice suggestions consistent with investment balances.
export function investmentInvoiceSeed(project){
 const p=project.payload,t=totals(p);
 const buyer={name:p.investor||'',nip:'',address:p.investorAddress||'',city:'',country:'PL'};
 const match=buyer.address.match(/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(match){buyer.address=match[1].trim();buyer.city=match[2].trim();}
 const description=`Usługi remontowe — ${p.name} · ${project.contract_number}`.slice(0,512);
 const choice=(id,label,amount,stageId)=>({id,label,amount:round(amount).toFixed(2),description:`${label} — ${p.name} · ${project.contract_number}`.slice(0,512),...(stageId?{stageId}:{})});
 const amountOptions=[
  choice('completed','Należność za wykonane prace',t.works.done),
  choice('work-remaining','Pozostało za wykonane prace',t.workRemaining),
  choice('remaining','Pozostałe rozliczenie z materiałami',t.remaining),
  choice('whole','Wartość całego zlecenia',p.works?.length?t.works.after:t.agreed),
  ...(p.stages||[]).map(stage=>choice('stage:'+stage.id,stage.name+(stage.description?' — '+stage.description:''),t.agreed*Number(stage.percent)/100,stage.id))
 ];
 return {buyer,description,currency:'PLN',source:{app:'robisie',id:project.id},amountOptions};
}
export function stageInvoiceSeed(project,stageId){
 const p=project.payload,stage=(p.stages||[]).find(item=>item.id===stageId);
 if(!stage)throw Error('Nie znaleziono etapu inwestycji.');
 const seed=investmentInvoiceSeed(project),amount=Number(seed.amountOptions.find(item=>item.stageId===stageId).amount);
 if(!Number.isFinite(amount)||amount<=0)throw Error('Kwota etapu musi być większa od zera.');
 const description=`Usługi remontowe — ${p.name} — ${stage.name}${stage.description?': '+stage.description:''} · ${project.contract_number}`.slice(0,512);
 return {...seed,description,source:{...seed.source,stageId:stage.id},lines:[{name:description,unit:'szt.',qty:'1',price:amount.toFixed(2)}],...(stage.due&&stage.due>=today()?{dueDate:stage.due}:{})};
}
