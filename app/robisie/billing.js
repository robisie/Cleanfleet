import {totals,round,today} from './core.js';
// Shared by the invoice server and Robisię so a stage uses the displayed agreed offer.
export function stageInvoiceSeed(project,stageId){
 const p=project.payload,stage=(p.stages||[]).find(item=>item.id===stageId);
 if(!stage)throw Error('Nie znaleziono etapu inwestycji.');
 const amount=round(totals(p).agreed*Number(stage.percent)/100);
 if(!Number.isFinite(amount)||amount<=0)throw Error('Kwota etapu musi być większa od zera.');
 const buyer={name:p.investor||'',nip:'',address:p.investorAddress||'',city:'',country:'PL'};
 const match=buyer.address.match(/^(.*?)[,\n ]+(\d{2}-\d{3}\s+.+)$/s);if(match){buyer.address=match[1].trim();buyer.city=match[2].trim();}
 const description=`Usługi remontowe — ${p.name} — ${stage.name}${stage.description?': '+stage.description:''} · ${project.contract_number}`.slice(0,512);
 return {buyer,description,currency:'PLN',source:{app:'robisie',id:project.id,stageId:stage.id},lines:[{name:description,unit:'szt.',qty:'1',price:amount.toFixed(2)}],...(stage.due&&stage.due>=today()?{dueDate:stage.due}:{})};
}
