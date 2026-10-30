import {SELLER} from './core.js?v=1.0.38';
import {validateReceiptData} from './receipt-import.js?v=1.0.42';
let assets;
function script(src){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(Error('Nie udało się wczytać generatora PDF. Spróbuj ponownie.'));};document.head.append(tag);});}
async function dependencies(){if(!assets)assets=(async()=>{if(!window.jspdf)await script('/app/vendor/jspdf-2.5.1.umd.min.js');if(!window.CFReportFont)await script('/app/reports-font.js?v=13034');if(!window.jspdf.jsPDF.API.autoTable)await script('/app/vendor/jspdf-autotable-3.8.2.min.js');})().catch(error=>{assets=null;throw error;});return assets;}
export function savedReceiptData(document){
 const m=document?.metadata,p=document?.preview;
 if(m?.source!=='nip-receipt'||!Array.isArray(p?.items))throw Error('Brak pełnych zapisanych danych paragonu. Odśwież magazyn.');
 return validateReceiptData({date:m.issueDate,number:m.invoiceNumber,seller:m.seller?.name,sellerNip:m.seller?.nip,buyerNip:m.buyer?.identifier?.value,total:Number(m.grossAmount),items:p.items.map(i=>({name:i.name,quantity:Number(i.quantity),unit:i.unit,gross:Number(i.gross)}))});
}
const money=value=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(value);
const qty=value=>new Intl.NumberFormat('pl-PL',{maximumFractionDigits:6}).format(value);
export function buildReceiptPdf(document,jsPDF,font,logo){
 const receipt=savedReceiptData(document),doc=new jsPDF({unit:'mm',format:'a4',compress:true});
 doc.addFileToVFS('Robisie.ttf',font);doc.addFont('Robisie.ttf','Robisie','normal');doc.setFont('Robisie');
 doc.setFontSize(10);const number=doc.splitTextToSize(receipt.number,88),seller=doc.splitTextToSize(receipt.seller,86),buyer=doc.splitTextToSize(SELLER.name,86);
 const noticeY=Math.max(47,36+number.length*4),partiesY=noticeY+24,tableTop=partiesY+Math.max(seller.length*4.5+11,buyer.length*4.5+22)+9;
 const header=()=>{
  doc.setFont('Robisie');doc.setTextColor(85,92,75);doc.setFontSize(8);
  if(logo){const size=doc.getImageProperties(logo);doc.addImage(logo,'PNG',12,10,48,48*size.height/size.width);}
  doc.setTextColor(137,148,19);doc.setFontSize(18);doc.text('Paragon z NIP-em',108,18);
  doc.setTextColor(45,53,45);doc.setFontSize(10);doc.text(number,108,26);doc.setFontSize(9);doc.text('Data zakupu: '+receipt.date.split('-').reverse().join('.'),108,30+number.length*4);
  doc.setFillColor(240,244,221);doc.roundedRect(12,noticeY,186,15,2,2,'F');doc.setTextColor(71,82,38);doc.setFontSize(9);doc.text('PODGLĄD WEWNĘTRZNY',16,noticeY+5.5);doc.setFontSize(7.5);doc.text('Opracowano z zapisanych danych. Nie jest kopią oryginalnego paragonu.',16,noticeY+11);
  doc.setTextColor(130,140,20);doc.setFontSize(11);doc.text('Sprzedawca',12,partiesY);doc.text('Nabywca',108,partiesY);
  doc.setTextColor(45,53,45);doc.setFontSize(9);doc.text(seller,12,partiesY+7);doc.text('NIP: '+receipt.sellerNip,12,partiesY+9+seller.length*4.5);
  doc.text(buyer,108,partiesY+7);const by=partiesY+9+buyer.length*4.5;doc.text([SELLER.address,SELLER.city,'NIP: '+receipt.buyerNip],108,by);
 };
 doc.autoTable({startY:tableTop,margin:{top:tableTop,bottom:18,left:12,right:12},head:[['Lp.','Nazwa towaru / usługi','Ilość','Jedn.','Cena jedn. brutto','Wartość brutto']],body:receipt.items.map((i,n)=>[String(n+1),i.name,qty(i.quantity),i.unit,money(i.gross/i.quantity),money(i.gross)]),styles:{font:'Robisie',fontStyle:'normal',fontSize:8,cellPadding:2.5,overflow:'linebreak',textColor:[45,53,45]},columnStyles:{0:{cellWidth:10},1:{cellWidth:76},2:{cellWidth:17,halign:'right'},3:{cellWidth:15},4:{cellWidth:33,halign:'right'},5:{cellWidth:35,halign:'right'}},headStyles:{fillColor:[98,112,40],textColor:255,fontStyle:'normal'},alternateRowStyles:{fillColor:[247,249,240]},rowPageBreak:'avoid',didDrawPage:header});
 let y=doc.lastAutoTable.finalY+8;if(y+27>277){doc.addPage();header();y=tableTop;}
 doc.setFillColor(238,243,217);doc.roundedRect(108,y,90,23,2,2,'F');doc.setTextColor(82,96,26);doc.setFontSize(10);doc.text('Razem brutto',113,y+7);doc.setFontSize(17);doc.text(money(receipt.total),193,y+17,{align:'right'});
 for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setTextColor(110);doc.setFontSize(7);doc.text('Robisię - wewnętrzny podgląd danych paragonu',12,287);doc.text(page+' / '+doc.getNumberOfPages(),198,287,{align:'right'});}
 doc.setProperties({title:'Paragon '+receipt.number,subject:'Wewnętrzny podgląd zapisanych danych paragonu'});return doc.output('blob');
}
export async function createReceiptPdf(document,{signal}={}){
 savedReceiptData(document);await dependencies();
 const response=await fetch('/app/robisie/assets/robisie-logo.png',{signal});if(!response.ok)throw Error('Nie udało się wczytać logo. Spróbuj ponownie.');
 const blob=await response.blob(),logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');return buildReceiptPdf(document,window.jspdf.jsPDF,window.CFReportFont,logo);
}
