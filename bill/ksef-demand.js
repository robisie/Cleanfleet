import * as C from './core.js?v=1.0.26';
import * as Demand from './payment-demand.js?v=1.0.26';
import {previewHtml} from './pdf.js?v=1.0.26';
const child=(node,key)=>[...(node?.children||[])].find(x=>x.localName===key),children=(node,key)=>[...(node?.children||[])].filter(x=>x.localName===key);
const value=(node,...path)=>{for(const key of path)node=child(node,key);return node?.textContent?.trim()||'';};
const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
function party(node){const id=child(node,'DaneIdentyfikacyjne'),address=child(node,'Adres');return {name:value(id,'Nazwa'),nip:value(id,'NIP')||value(id,'NrVatUE')||value(id,'NrID'),country:value(address,'KodKraju')||value(id,'KodUE')||value(id,'KodKraju')||'PL',address:value(address,'AdresL1'),city:value(address,'AdresL2')};}
export function invoiceFromDocument(doc,metadata){
 if(doc.doctype||doc.getElementsByTagName('parsererror').length||doc.documentElement?.localName!=='Faktura')throw Error('Nieprawidłowy XML faktury.');
 const root=doc.documentElement,fa=child(root,'Fa'),payment=child(fa,'Platnosc'),settlement=child(fa,'Rozliczenie'),seller=party(child(root,'Podmiot1')),buyer=party(child(root,'Podmiot2'));
 const number=value(fa,'P_2'),issueDate=value(fa,'P_1'),currency=value(fa,'KodWaluty'),gross=C.decimal(value(fa,'P_15'));
 if(seller.nip!==C.SELLER.nip)throw Error('Wezwanie można przygotować tylko do faktury sprzedażowej Robisię-Fer.');
 if(!buyer.name||!date(issueDate)||!number||number!==metadata.invoiceNumber||issueDate!==metadata.issueDate||currency!==metadata.currency||gross!==Math.round(Number(metadata.grossAmount)*100))throw Error('Dane faktury nie zgadzają się z listą KSeF. Odśwież listę.');
 if(value(fa,'RodzajFaktury').startsWith('KOR'))throw Error('Wezwanie do korekty wymaga uzgodnienia salda z fakturą pierwotną. Wybierz fakturę sprzedażową.');
 if(value(settlement,'DoRozliczenia'))throw Error('Faktura wskazuje kwotę do rozliczenia lub zwrotu.');
 const base=value(settlement,'DoZaplaty')?C.decimal(value(settlement,'DoZaplaty')):gross;
 const paid=children(payment,'ZaplataCzesciowa').reduce((sum,x)=>sum+C.decimal(value(x,'KwotaZaplatyCzesciowej')),0);
 const remaining=value(payment,'Zaplacono')==='1'||value(payment,'ZnacznikZaplatyCzesciowej')==='2'?0:Math.max(0,base-paid);
 if(!base||!remaining)throw Error('Faktura nie ma dodatniej kwoty do zapłaty lub została oznaczona w KSeF jako opłacona.');
 const terms=children(payment,'TerminPlatnosci').map(x=>value(x,'Termin')).filter(date),dueDate=terms.length===1?terms[0]:'';
 const recipient=children(root,'Podmiot3').find(x=>value(x,'Rola')==='2');
 return {id:metadata.billId||metadata.ksefNumber,number,status:'accepted',ksef_number:metadata.ksefNumber,unpaid:remaining,payload:{brand:'cleanfleet',currency,issueDate,dueDate,buyer,recipient:recipient?party(recipient):null,bank:value(payment,'RachunekBankowy','NrRB'),lines:[{name:'Należność z faktury '+number,qty:'1',price:(base/100).toFixed(2),unit:'szt.'}]}};
}
export function invoiceFromXml(xml,metadata){
 if(!xml||xml.length>10000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Nieprawidłowy XML faktury.');
 return invoiceFromDocument(new DOMParser().parseFromString(xml,'application/xml'),metadata);
}
export function availableBalance(row,project){return Math.min(row.unpaid,Demand.outstanding(row,project));}
export async function showKsefDemand({xml,metadata,original=null,link=null,loadProject=null,defaultBank='',signal}){
 const row=invoiceFromXml(xml,metadata);row.id=original?.id||link?.document_id||row.id;row.payload.brand=original?.payload?.brand||(link?'robisie':'cleanfleet');
 const project=loadProject?await loadProject():null,remaining=availableBalance(row,project);
 if(!remaining)throw Error('Ta faktura jest już rozliczona w całości.');if(signal?.aborted)return false;
 const e=C.esc,today=C.today(),next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+7);const proposed=next.toISOString().slice(0,10),deadline=row.payload.dueDate>proposed?row.payload.dueDate:proposed;
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='scroll-modal';let busy=false,finished=false;
  dialog.innerHTML=`<form><header><h2>Wezwanie do zapłaty</h2></header><div class="modal-body"><p>Faktura <strong>${e(row.number)}</strong> · ${e(row.payload.buyer.name)}</p><p class="muted">Potwierdź niezapłaconą kwotę. Uwzględnij wpłaty zapisane poza aplikacją.</p><div class="grid">${Demand.languageSelect()}<label class="field">Logo<select name="brand"><option value="cleanfleet" ${row.payload.brand==='cleanfleet'?'selected':''}>CleanFleet</option><option value="robisie" ${row.payload.brand==='robisie'?'selected':''}>Robisię</option></select></label><label class="field">Kwota do zapłaty (${e(row.payload.currency)})<input name="amount" type="number" min="0.01" max="${(remaining/100).toFixed(2)}" step="0.01" required value="${(remaining/100).toFixed(2)}"></label><label class="field">Termin płatności faktury<input name="due" type="date" required value="${e(row.payload.dueDate)}" ${row.payload.dueDate?'readonly':''}></label><label class="field">Zapłać do<input name="deadline" type="date" required min="${e(row.payload.dueDate>today?row.payload.dueDate:today)}" value="${e(deadline)}"></label><label class="field wide">Rachunek bankowy<input name="bank" type="text" maxlength="128" value="${e(row.payload.bank||defaultBank)}"></label></div>${!row.payload.dueDate?'<p class="notice">Faktura nie wskazuje jednego terminu płatności. Wpisz termin należności objętej wezwaniem.</p>':''}<p data-error class="error" role="alert"></p></div><footer><button type="button" data-cancel>Anuluj</button><button class="primary" type="submit">Generuj PDF / drukuj</button></footer></form>`;
  const finish=result=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);dialog.close();dialog.remove();resolve(result);};
  const cancel=()=>{if(!busy)finish(false);};dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=e=>{e.preventDefault();cancel();};signal?.addEventListener('abort',cancel,{once:true});
  const due=dialog.querySelector('[name=due]'),end=dialog.querySelector('[name=deadline]');due.onchange=()=>{end.min=due.value>today?due.value:today;if(end.value<due.value)end.value=due.value;};
  dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;for(const b of dialog.querySelectorAll('button'))b.disabled=true;
   try{const values=new FormData(event.target),amount=C.decimal(values.get('amount')),current=loadProject?await loadProject():null;if(signal?.aborted){finish(false);return;}if(amount>availableBalance(row,current))throw Error('Saldo faktury zmieniło się. Otwórz wezwanie ponownie.');
    const prepared=structuredClone(row);prepared.payload={...prepared.payload,brand:values.get('brand'),dueDate:values.get('due'),bank:values.get('bank').trim()};if(!date(prepared.payload.dueDate))throw Error('Podaj prawidłowy termin płatności faktury.');
    const html=Demand.demandHtml(prepared,{amount,deadline:values.get('deadline'),language:values.get('demandLanguage')||'pl'});finish(true);await previewHtml(html);
   }catch(error){dialog.querySelector('[data-error]').textContent=error.message;}finally{busy=false;for(const b of dialog.querySelectorAll('button'))b.disabled=false;}
  };
  document.body.append(dialog);dialog.showModal();
 });
}
