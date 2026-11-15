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
 const amountsHtml=r=>services(r).length?'<div class="cf-extra-amounts" style="font-size:.85em;font-weight:400;white-space:normal;line-height:1.5;margin-top:5px">Pranie: '+esc(money(base(r),r.currency))+'<br>Dodatki: '+esc(money(sum(services(r)),r.currency))+'</div>':'';
 function editorStyles(){
  const doc=root.document;if(doc.getElementById('cf-additional-service-style'))return;
  const style=doc.createElement('style');style.id='cf-additional-service-style';style.textContent=`
   .cf-extra-editor .cf-extra-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,200px) 48px;gap:12px;align-items:end;margin:16px 0;padding:16px 0;border-top:1px solid var(--line,#deded9)}
   .cf-extra-editor .cf-extra-field{display:flex;flex-direction:column;gap:7px;min-width:0;margin:0}
   .cf-extra-editor .cf-extra-catalog{grid-column:1/-1}
   .cf-extra-editor input,.cf-extra-editor select{display:block;width:100%!important;max-width:100%;min-width:0;height:46px!important;min-height:46px!important;box-sizing:border-box!important;padding:10px 12px!important;border:1px solid var(--line-strong,#c4c4bf)!important;border-radius:8px!important;background:#fff!important;color:var(--ink,#16150f)!important;font-family:inherit;font-size:16px!important;line-height:1.35!important}
   .cf-extra-editor [data-extra-remove]{width:48px;min-width:48px;height:46px;min-height:46px;padding:8px;align-self:end}
   .cf-extra-editor [data-extra-add]{min-height:46px;white-space:normal}
   @media(max-width:639px){
    .cf-extra-editor .cf-extra-row{grid-template-columns:minmax(0,1fr) 48px}
    .cf-extra-editor .cf-extra-description{grid-column:1/-1}
    .cf-extra-editor .cf-extra-price{grid-column:1}
    .cf-extra-editor [data-extra-remove]{grid-column:2}
   }
  `;doc.head.appendChild(style);
 }
 function editor(host,{items=[],catalog=[],currency='PLN',onChange=()=>{}}={}){
  editorStyles();
  let rows=(items||[]).map(s=>({...s,price:String(s.price)}));
  host.innerHTML='<section class="cf-extra-editor"><h3>Usługi dodatkowe</h3><p>Każda pozycja zostanie doliczona osobno do prania tego pojazdu.</p><div data-extra-rows></div><button type="button" class="btn btn-outline" data-extra-add>+ Dodaj usługę dodatkową</button><p data-extra-note></p><strong data-extra-total aria-live="polite"></strong></section>';
  const read=()=>normalize(rows);
  const update=()=>{host.querySelector('[data-extra-add]').disabled=rows.length>=MAX;host.querySelector('[data-extra-total]').textContent='Dodatki: '+money(sum(rows),currency);onChange(sum(rows));};
  const draw=()=>{host.querySelector('[data-extra-rows]').innerHTML=rows.map((s,i)=>'<div data-extra-row="'+i+'" class="cf-extra-row"><label class="cf-extra-field cf-extra-catalog">Z cennika<select data-extra-catalog="'+i+'"><option value="">Własna usługa</option>'+catalog.filter(c=>c.active!==false).map(c=>'<option value="'+esc(c.id)+'" '+(String(s.catalog_id)===String(c.id)?'selected':'')+'>'+esc(c.name)+' · '+money(c.price,'PLN')+'</option>').join('')+'</select></label><label class="cf-extra-field cf-extra-description">Opis<input data-extra-name="'+i+'" type="text" maxlength="400" value="'+esc(s.name)+'" placeholder="Opis usługi" style="width:100%;box-sizing:border-box"></label><label class="cf-extra-field cf-extra-price">Kwota ('+esc(currency)+')<input data-extra-price="'+i+'" type="text" inputmode="decimal" value="'+esc(s.price)+'" placeholder="0,00" style="width:100%;box-sizing:border-box"></label><button type="button" class="btn btn-outline" data-extra-remove="'+i+'" aria-label="Usuń usługę dodatkową">×</button></div>').join('');update();};
  host.addEventListener('click',e=>{const add=e.target.closest('[data-extra-add]'),remove=e.target.closest('[data-extra-remove]');if(add){rows.push({name:'',price:''});draw();host.querySelector('[data-extra-name="'+(rows.length-1)+'"]').focus();}if(remove){rows.splice(Number(remove.dataset.extraRemove),1);draw();}});
  host.addEventListener('input',e=>{const t=e.target;if(t.dataset.extraName!=null)rows[Number(t.dataset.extraName)].name=t.value;if(t.dataset.extraPrice!=null)rows[Number(t.dataset.extraPrice)].price=t.value.replace(',','.');update();});
  host.addEventListener('change',e=>{const i=e.target.dataset.extraCatalog;if(i==null)return;const item=catalog.find(c=>String(c.id)===e.target.value);if(item){const rate=Number(root.CFExchange?.get?.().rate);rows[Number(i)]={name:item.name,price:currency==='PLN'?String(item.price):rate>0?String(round(Number(item.price)/rate)):'',catalog_id:item.id};if(currency!=='PLN')host.querySelector('[data-extra-note]').textContent=rate>0?'Cena cennika PLN przeliczona na '+currency+' po kursie '+rate.toLocaleString('pl-PL')+' PLN. Możesz zmienić kwotę.':'Cennik jest w PLN. Wpisz kwotę dodatkowej usługi w '+currency+'.';}else delete rows[Number(i)].catalog_id;draw();});
  draw();return {read,total:()=>sum(rows)};
 }
 const api={normalize,sum,services,base,lines,html,amountsHtml,editor,money};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CFAdditionalServices=api;
})(globalThis);
