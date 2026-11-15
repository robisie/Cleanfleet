(function(root){'use strict';
 const MAX=20,round=n=>Math.round(n*100)/100;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function normalize(items){
  if(!Array.isArray(items)||items.length>MAX)throw Error('Możesz dodać maksymalnie 20 usług dodatkowych.');
  return items.map(item=>{const name=String(item?.name||'').trim(),raw=String(item?.price??'').trim().replace(',','.');
   if(!name||name.length>400||/[\x00-\x1f]/.test(name))throw Error('Wpisz opis każdej usługi dodatkowej (do 400 znaków).');
   if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(Number(raw)))throw Error('Wpisz poprawną kwotę każdej usługi dodatkowej, z dokładnością do groszy.');
   return {name,price:round(Number(raw)),...(item.catalog_id?{catalog_id:String(item.catalog_id)}:{})};
  });
 }
 const sum=items=>(items||[]).reduce((c,item)=>c+Math.round((Number.isFinite(Number(item.price))?Number(item.price):0)*100),0)/100;
 const services=r=>Array.isArray(r?.additional_services)?r.additional_services:[];
 const base=r=>r?.wash_base_cost!=null?Number(r.wash_base_cost):round(Number(r?.cost??r?.koszt??0)-sum(services(r)));
 const money=(n,c='PLN')=>Number(n).toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+c;
 const lines=r=>services(r).length?['Pranie: '+money(base(r),r.currency),...services(r).map(s=>'Usługa dodatkowa — '+s.name+': '+money(s.price,r.currency))].join('\n'):'';
 const html=r=>services(r).length?'<div class="cf-extra-breakdown" style="font-size:.85em;font-weight:400;white-space:normal;line-height:1.5;margin-top:5px">'+lines(r).split('\n').map(esc).join('<br>')+'</div>':'';
 function editor(host,{items=[],catalog=[],currency='PLN',onChange=()=>{}}={}){
  let rows=(items||[]).map(s=>({...s,price:String(s.price)}));
  host.innerHTML='<section class="cf-extra-editor"><h3>Usługi dodatkowe</h3><p>Każda pozycja zostanie doliczona osobno do prania tego pojazdu.</p><div data-extra-rows></div><button type="button" class="btn btn-outline" data-extra-add>+ Dodaj usługę dodatkową</button><p data-extra-note></p><strong data-extra-total aria-live="polite"></strong></section>';
  const read=()=>normalize(rows);
  const update=()=>{host.querySelector('[data-extra-add]').disabled=rows.length>=MAX;host.querySelector('[data-extra-total]').textContent='Dodatki: '+money(sum(rows),currency);onChange(sum(rows));};
  const draw=()=>{host.querySelector('[data-extra-rows]').innerHTML=rows.map((s,i)=>'<div data-extra-row="'+i+'" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(100px,140px) auto;gap:8px;margin:12px 0;align-items:end"><label style="grid-column:1/-1">Z cennika<select data-extra-catalog="'+i+'"><option value="">Własna usługa</option>'+catalog.filter(c=>c.active!==false).map(c=>'<option value="'+esc(c.id)+'" '+(String(s.catalog_id)===String(c.id)?'selected':'')+'>'+esc(c.name)+' · '+money(c.price,'PLN')+'</option>').join('')+'</select></label><label>Opis<input data-extra-name="'+i+'" type="text" maxlength="400" value="'+esc(s.name)+'" placeholder="Opis usługi" style="width:100%;box-sizing:border-box"></label><label>Kwota ('+esc(currency)+')<input data-extra-price="'+i+'" type="text" inputmode="decimal" value="'+esc(s.price)+'" placeholder="0,00" style="width:100%;box-sizing:border-box"></label><button type="button" class="btn btn-outline" data-extra-remove="'+i+'" aria-label="Usuń usługę dodatkową">×</button></div>').join('');update();};
  host.addEventListener('click',e=>{const add=e.target.closest('[data-extra-add]'),remove=e.target.closest('[data-extra-remove]');if(add){rows.push({name:'',price:''});draw();host.querySelector('[data-extra-name="'+(rows.length-1)+'"]').focus();}if(remove){rows.splice(Number(remove.dataset.extraRemove),1);draw();}});
  host.addEventListener('input',e=>{const t=e.target;if(t.dataset.extraName!=null)rows[Number(t.dataset.extraName)].name=t.value;if(t.dataset.extraPrice!=null)rows[Number(t.dataset.extraPrice)].price=t.value.replace(',','.');update();});
  host.addEventListener('change',e=>{const i=e.target.dataset.extraCatalog;if(i==null)return;const item=catalog.find(c=>String(c.id)===e.target.value);if(item){const rate=Number(root.CFExchange?.get?.().rate);rows[Number(i)]={name:item.name,price:currency==='PLN'?String(item.price):rate>0?String(round(Number(item.price)/rate)):'',catalog_id:item.id};if(currency!=='PLN')host.querySelector('[data-extra-note]').textContent=rate>0?'Cena cennika PLN przeliczona na '+currency+' po kursie '+rate.toLocaleString('pl-PL')+' PLN. Możesz zmienić kwotę.':'Cennik jest w PLN. Wpisz kwotę dodatkowej usługi w '+currency+'.';}else delete rows[Number(i)].catalog_id;draw();});
  draw();return {read,total:()=>sum(rows)};
 }
 const api={normalize,sum,services,base,lines,html,editor,money};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CFAdditionalServices=api;
})(globalThis);
