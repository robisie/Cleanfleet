import * as C from './core.js?v=1.0.27';
const cache=new Map();
export function previousMonth(due){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(due||''))throw Error('Uzupełnij termin płatności faktury.');
 const date=new Date(due+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==due)throw Error('Nieprawidłowy termin płatności.');
 const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),0,12));return {from:end.toISOString().slice(0,7)+'-01',to:end.toISOString().slice(0,10)};
}
export function eligible(row,date=C.today()){try{previousMonth(row.payload.dueDate);return row.payload.dueDate<date&&row.payload.buyer?.kind!=='person';}catch{return false;}}
export function calculateCompensation(row,request,date=C.today()){
 if(!request||request.law==='none')return null;
 if(!['pl','de'].includes(request.law))throw Error('Wybierz polską albo niemiecką podstawę rekompensaty.');
 if(!eligible(row,date))throw Error('Rekompensata jest dostępna po terminie płatności dla rozliczenia firmowego.');
 if(request.confirmed!==true)throw Error('Potwierdź prawo do rekompensaty i brak jej podwójnego doliczenia.');
 if(request.law==='de')return {law:'de',currency:'EUR',cents:4000,euro:40};
 const euro={low:40,medium:70,high:100}[request.band];if(!euro)throw Error('Wybierz wartość transakcji lub umówionej raty w PLN.');
 const rate=validatedRate(request.rate,row.payload.dueDate),scaled=Math.round(rate.mid*10000);
 return {law:'pl',currency:'PLN',cents:Math.round(euro*scaled/100),euro,rate};
}
function validatedRate(rate,due){
 const range=previousMonth(due),scaled=Math.round(Number(rate?.mid)*10000);
 if(rate?.code!=='EUR'||rate?.table!=='A'||!/^\d{4}-\d{2}-\d{2}$/.test(rate?.effectiveDate||'')||rate.effectiveDate<range.from||rate.effectiveDate>range.to||!Number.isSafeInteger(scaled)||scaled<=0||scaled>10000000||!rate.no)throw Error('Brak właściwego kursu EUR NBP z miesiąca poprzedzającego wymagalność.');
 return {code:'EUR',table:'A',mid:scaled/10000,effectiveDate:rate.effectiveDate,no:String(rate.no)};
}
export async function nbpRate(due,fetcher=fetch){
 const range=previousMonth(due),key=range.from;
 if(fetcher===fetch&&cache.has(key))return cache.get(key);
 const pending=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{
  const response=await fetcher(`https://api.nbp.pl/api/exchangerates/rates/a/eur/${range.from}/${range.to}/?format=json`,{signal:controller.signal});if(!response.ok)throw Error('NBP nie udostępnił kursu. Spróbuj ponownie.');
  const data=await response.json(),rates=(data.rates||[]).filter(x=>x.effectiveDate>=range.from&&x.effectiveDate<=range.to).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  if(data.code!=='EUR'||data.table!=='A'||!rates.length)throw Error('Nieprawidłowa odpowiedź NBP.');
  const last=rates.at(-1),result={code:'EUR',table:'A',mid:last.mid,effectiveDate:last.effectiveDate,no:last.no};
  return validatedRate(result,due);
 }finally{clearTimeout(timer);}})();
 if(fetcher===fetch){cache.set(key,pending);pending.catch(()=>cache.delete(key));}return pending;
}
export function compensationControls(row){
 const amount=C.invoiceAmount(row.payload),band=row.payload.currency==='PLN'?(amount<=500000?'low':amount<5000000?'medium':'high'):'';
 return `<section class="wide" data-compensation><h3>Rekompensata za opóźnienie</h3><label class="field">Podstawa prawna<select data-comp-law><option value="none">Nie doliczaj</option><option value="pl">Prawo polskie — 40 / 70 / 100 EUR</option value="de">Prawo niemieckie — 40 EUR (§ 288 ust. 5 BGB)</option></select></label><div data-comp-fields hidden><label class="field" data-comp-band-wrap>Wartość transakcji / umówionej raty w PLN<select data-comp-band><option value="">Wybierz…</option><option value="low" ${band==='low'?'selected':''}>Do 5 000 zł włącznie — 40 EUR</option><option value="medium" ${band==='medium'?'selected':''}>Powyżej 5 000 zł, poniżej 50 000 zł — 70 EUR</option><option value="high" ${band==='high'?'selected':''}>Od 50 000 zł — 100 EUR</option></select></label><p class="muted">Podstawę prawną wybierz zgodnie z umową. Język wezwania i kraj kontrahenta nie przesądzają o właściwym prawie. Dla faktury walutowej wskaż próg należności po ustaleniu jej wartości w PLN.</p><label class="row"><input type="checkbox" data-comp-confirm> Potwierdzam rozliczenie firmowe, wykonanie świadczenia i spełnienie warunków rekompensaty według wybranego prawa; nie jest ona już ujęta w kwocie należności.</label></div><p data-comp-status role="status" class="muted"></p><button type="button" data-comp-retry hidden>Ponów pobranie kursu NBP</button></section>`;
}
export function mountCompensation(root,getRow){
 const box=root.querySelector('[data-compensation]'),law=box.querySelector('[data-comp-law]'),band=box.querySelector('[data-comp-band]'),confirm=box.querySelector('[data-comp-confirm]'),status=box.querySelector('[data-comp-status]'),retry=box.querySelector('[data-comp-retry]');let generation=0;
 const read=async(row=getRow())=>{const selected=law.value;if(selected==='none')return null;const request={law:selected,band:band.value,confirmed:confirm.checked};if(!request.confirmed)throw Error('Potwierdź prawo do rekompensaty i brak jej podwójnego doliczenia.');if(!eligible(row))throw Error('Rekompensata jest dostępna dopiero po terminie płatności dla rozliczenia firmowego.');if(selected==='pl')request.rate=await nbpRate(row.payload.dueDate);if(law.value!==selected||band.value!==request.band||confirm.checked!==request.confirmed||getRow().payload.dueDate!==row.payload.dueDate)throw Error('Wybór rekompensaty zmienił się. Zatwierdź ponownie.');calculateCompensation(row,request);return request;};
 const refresh=async()=>{const own=++generation,row=getRow(),allowed=eligible(row);for(const option of law.options)if(option.value!=='none')option.disabled=!allowed;
  box.querySelector('[data-comp-fields]').hidden=law.value==='none';box.querySelector('[data-comp-band-wrap]').hidden=law.value!=='pl';retry.hidden=true;
  if(!allowed){law.value='none';box.querySelector('[data-comp-fields]').hidden=true;status.textContent='Rekompensatę można doliczyć po terminie płatności, w rozliczeniu firmowym.';return;}
  if(law.value==='none'){status.textContent='Opcja dobrowolna. Ryczałt nie jest naliczany ponownie za każde wezwanie.';return;}
  try{status.textContent=law.value==='pl'?'Pobieranie właściwego kursu EUR z NBP…':'';const selected=law.value,rate=selected==='pl'?await nbpRate(row.payload.dueDate):null;if(own!==generation)return;const result=calculateCompensation(row,{law:selected,band:band.value,confirmed:true,rate});status.textContent=`Rekompensata: ${C.money(result.cents,result.currency)}${result.rate?' · '+result.euro+' EUR × '+result.rate.mid.toFixed(4)+' PLN · NBP '+result.rate.no+' z '+result.rate.effectiveDate:''}`;
  }catch(error){if(own!==generation)return;status.textContent=error.message;retry.hidden=law.value!=='pl';}
 };
 law.onchange=refresh;band.onchange=refresh;retry.onclick=refresh;void refresh();return {read,refresh};
}
