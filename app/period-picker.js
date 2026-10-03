(function(root){'use strict';
const months=['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
function current(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);}
function bounds(value){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('Wybierz miesiąc i rok.');
 const [year,month]=value.split('-').map(Number),last=new Date(Date.UTC(year,month,0)).getUTCDate();
 return {from:value+'-01',to:value+'-'+String(last).padStart(2,'0'),next:month===12?(year+1)+'-01-01':year+'-'+String(month+1).padStart(2,'0')+'-01'};
}
function dates(value){const b=bounds(value);return {from:new Date(b.from+'T00:00:00'),to:new Date(b.to+'T23:59:59.999')};}
function attach(select,onChange,initial=current()){
 if(select._cfMonthPicker)return select._cfMonthPicker;
 bounds(initial);
 const doc=select.ownerDocument,wrap=doc.createElement('div');
 wrap.className='cf-period-month-picker';wrap.style.cssText='display:none;gap:8px;flex-wrap:wrap;align-items:center;min-width:0';
 const month=doc.createElement('select'),year=doc.createElement('select');
 month.setAttribute('aria-label','Miesiąc');year.setAttribute('aria-label','Rok');
 month.style.cssText=year.style.cssText='width:auto;min-width:0;flex:1 1 110px';
 function option(parent,value,text){const o=doc.createElement('option');o.value=value;o.textContent=text;parent.appendChild(o);}
 months.forEach((name,i)=>option(month,String(i+1).padStart(2,'0'),name));
 const nowYear=Number(current().slice(0,4)),selectedYear=Number(initial.slice(0,4));
 for(let y=Math.max(nowYear+1,selectedYear);y>=Math.min(2000,selectedYear);y--)option(year,String(y),String(y));
 month.value=initial.slice(5,7);year.value=initial.slice(0,4);
 wrap.appendChild(month);wrap.appendChild(year);
 const anchor=select.parentElement?.tagName==='LABEL'?select.parentElement:select;
 anchor.insertAdjacentElement('afterend',wrap);
 if(!Array.from(select.options).some(o=>o.value==='selected_month')){
  const o=doc.createElement('option');o.value='selected_month';o.textContent='Miesiąc';
  const after=Array.from(select.options).find(o=>o.value==='month');select.insertBefore(o,after?after.nextSibling:null);
 }
 const api={value:()=>year.value+'-'+month.value,bounds:()=>bounds(api.value()),dates:()=>dates(api.value()),sync:()=>{wrap.style.display=select.value==='selected_month'?'flex':'none';}};
 select._cfMonthPicker=api;
 select.addEventListener('change',()=>{api.sync();onChange?.();});
 for(const el of [month,year])el.addEventListener('change',()=>select.dispatchEvent(new Event('change',{bubbles:true})));
 api.sync();return api;
}
const api={current,bounds,dates,attach};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFPeriods=api;
})(typeof window==='object'?window:globalThis);
