const WIDTH_MM = 210;
const HEIGHT_MM = 297;
const PAGE_HEIGHT_PX = HEIGHT_MM * 96 / 25.4;
let libraries;

function loadScript(src) {
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=src;
  script.onload=resolve;
  script.onerror=()=>{
   script.remove();
   reject(new Error('Nie udało się wczytać generatora PDF. Spróbuj ponownie.'));
  };
  document.head.append(script);
 });
}

function loadLibraries() {
 libraries ??= Promise.all([
  window.jspdf?.jsPDF || loadScript('/app/vendor/jspdf-2.5.1.umd.min.js'),
  window.html2canvas || loadScript('/app/vendor/html2canvas-1.4.1.min.js')
 ]).catch(error=>{libraries=null;throw error;});
 return libraries;
}

// Paginate the same document the user sees, repeating headings of split tables.
export async function createInvoicePdf(html, title, signal) {
 await loadLibraries();
 signal.throwIfAborted();

 const frame=document.createElement('iframe');
 frame.setAttribute('aria-hidden','true');
 frame.tabIndex=-1;
 frame.style.cssText='position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;pointer-events:none';
 try {
  await new Promise((resolve,reject)=>{
   frame.onload=resolve;
   frame.onerror=()=>reject(new Error('Nie udało się przygotować podglądu faktury.'));
   frame.srcdoc=html;
   document.body.append(frame);
  });
  signal.throwIfAborted();
  const doc=frame.contentDocument;
  const page=doc.querySelector('.page');
  if(!page)throw new Error('Brak treści faktury do pobrania.');
  const printStyle=doc.createElement('style');
  printStyle.textContent=[...doc.querySelectorAll('style')]
   .flatMap(style=>[...style.sheet.cssRules])
   .filter(rule=>rule.media?.mediaText==='print')
   .flatMap(rule=>[...rule.cssRules].map(rule=>rule.cssText))
   .join('\n');
  doc.head.append(printStyle);
  await Promise.all([...doc.images].map(img=>img.decode()));
  await doc.fonts.ready;

  const elements=[...page.children];
  page.replaceChildren();
  doc.documentElement.style.overflow='hidden';
  Object.assign(page.style,{
   width:'210mm',maxWidth:'none',minHeight:'0',margin:'0',background:'#fff'
  });
  const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
  pdf.setProperties({title});
  let pageCount=0;
  const overflows=()=>page.getBoundingClientRect().height>PAGE_HEIGHT_PX;

  async function emitPage() {
   if(!page.childElementCount)return;
   signal.throwIfAborted();
   page.style.minHeight='297mm';
   const canvas=await window.html2canvas(page,{scale:2.5,backgroundColor:'#fff',logging:false});
   try {
    signal.throwIfAborted();
    const width=Math.min(WIDTH_MM,HEIGHT_MM*canvas.width/canvas.height);
    const left=(WIDTH_MM-width)/2;
    const height=Math.min(HEIGHT_MM,width*canvas.height/canvas.width);
    if(pageCount++)pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',left,0,width,height,undefined,'FAST');
    const bounds=page.getBoundingClientRect();
    for(const link of page.querySelectorAll('a[href^="https://"]')){
     const rect=link.getBoundingClientRect();
     const scale=width/bounds.width;
     pdf.link(left+(rect.left-bounds.left)*scale,(rect.top-bounds.top)*scale,rect.width*scale,rect.height*scale,{url:link.href});
    }
   } finally {
    canvas.width=canvas.height=0;
    page.style.minHeight='0';
   }
   page.replaceChildren();
  }

  for(const element of elements){
   if(element.tagName==='TABLE' && element.tHead && element.tBodies.length===1){
    const rows=[...element.tBodies[0].rows];
    const table=element.cloneNode(true);
    const body=table.tBodies[0];
    body.replaceChildren();
    page.append(table);
    for(const row of rows){
     body.append(row);
     if(!overflows())continue;
     row.remove();
     if(!body.rows.length)table.remove();
     await emitPage();
     body.replaceChildren(row);
     page.append(table);
    }
   } else {
    page.append(element);
    if(overflows() && page.childElementCount>1){
     element.remove();
     await emitPage();
     page.append(element);
    }
   }
  }
  await emitPage();
  return pdf.output('blob');
 } finally {
  frame.remove();
 }
}
