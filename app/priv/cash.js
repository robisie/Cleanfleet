// All amounts are positive integer grosze; direction controls their sign.
export function cashAmount(value){
 const text=String(value??'').trim().replace(/[\s\u00a0\u202f]/g,'');
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(text))return null;
 const [whole,fraction='']=text.split(/[.,]/),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(amount)&&amount>0?amount:null;
}
export function cashBalance(entries){
 let sum=0;
 for(const entry of entries){sum+=entry.type==='income'?entry.amount:-entry.amount;if(!Number.isSafeInteger(sum))throw Error('Łączna kwota gotówki jest zbyt duża.');}
 return sum;
}
export function validateCash(entries){
 if(!Array.isArray(entries))throw Error('Nieprawidłowa lista gotówki.');
 const ids=new Set();
 for(const entry of entries){
  if(!entry||typeof entry.id!=='string'||!entry.id||ids.has(entry.id)||!Number.isSafeInteger(entry.amount)||entry.amount<=0||!['income','expense'].includes(entry.type)||typeof entry.description!=='string'||!entry.description.trim()||entry.description.length>120||typeof entry.createdAt!=='string'||!Number.isFinite(Date.parse(entry.createdAt)))throw Error('Kopia zawiera nieprawidłowe wpisy gotówki.');
  ids.add(entry.id);
 }
 cashBalance(entries);return entries;
}
