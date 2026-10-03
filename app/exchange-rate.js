(function(root){'use strict';
let current=null;
const round=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const currency=r=>String(r?.currency||'PLN').toUpperCase();
const cost=r=>Number(r?.koszt??r?.cost??0);
function frozen(r){return !!(r?.zaplacone??r?.paid)&&!!(r?.data_prania??r?.wash_date)&&Number(r?.pln_rate)>0&&r?.pln_amount!=null;}
function amount(r){if(currency(r)!=='EUR')return round(cost(r));if(frozen(r))return Number(r.pln_amount);if(!current||Date.now()-Date.parse(current.checked_at)>60*60*1000)throw Error('Brak aktualnego kursu EUR mBanku. Odśwież dane.');return round(cost(r)*current.rate);}
function format(r){const original=new Intl.NumberFormat('pl-PL',{style:'currency',currency:currency(r)}).format(cost(r));if(currency(r)!=='EUR')return original;let converted;try{converted=new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(amount(r));}catch{return original+' / brak kursu PLN';}return original+' / '+(frozen(r)?'':'≈')+converted;}
function note(r){if(currency(r)!=='EUR')return '';const rate=frozen(r)?{rate:r.pln_rate,rate_date:r.pln_rate_date,rate_time:r.pln_rate_time}:current;if(!rate)return 'Kurs mBanku niedostępny';return 'mBank · kupno EUR '+Number(rate.rate).toFixed(4)+' · '+rate.rate_date+' '+String(rate.rate_time||'').slice(0,5)+(frozen(r)?' · utrwalono przy płatności':' · przeliczenie bieżące');}
function set(rate){if(!rate||!(Number(rate.rate)>0))throw Error('Nieprawidłowy kurs.');current={...rate,rate:Number(rate.rate),checked_at:rate.checked_at||new Date().toISOString()};}
function sum(rows){return round((rows||[]).reduce((s,r)=>s+Math.round(amount(r)*100),0)/100);}
function earnings(row,wash){if(!wash||currency(wash)!=='EUR')return {...row};const total=amount(wash),base=Number(row.total_amount),share=base>0?Number(row.employee_amount)/base:0,employee=round(total*share);return {...row,total_amount:total,employee_amount:employee,my_amount:round(total-employee)};}
const api={amount,format,note,sum,set,frozen,earnings,get:()=>current};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CFExchange=api;
})(globalThis);
