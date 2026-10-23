export function selectedAmount(preview,indices){
 const rows=preview.items||[],ids=indices??rows.map(x=>x.index);
 if(ids.length===rows.length&&new Set(ids).size===rows.length)return Math.round(preview.gross*100)/100;
 return rows.filter(x=>ids.includes(x.index)).reduce((sum,x)=>sum+Math.round(Number(x.gross)*100),0)/100;
}
export const duplicatePurchases=(purchases,amount)=>purchases.filter(x=>Math.round(Number(x.amount)*100)===Math.round(amount*100));
export {allocationMarkup,mountAllocation,quantitySelection,savedEntries} from '../app/robisie/ksef-allocation.js?v=1.0.70';
