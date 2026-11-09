const WIDTH_MM=210, HEIGHT_MM=297;
const heading=node=>/^H[34]$/.test(node.tagName);

// Break only blocks that are too tall for a fresh page.
function fillText(nodes,remaining,fits){
 let advanced=false;
 for(let i=0;i<nodes.length;i++){
  const node=nodes[i],text=remaining[i];
  let lo=0,hi=text.length;
  while(lo<hi){
   const mid=Math.ceil((lo+hi)/2);
   node.textContent=text.slice(0,mid).join('');
   if(fits())lo=mid;else hi=mid-1;
  }
  if(lo<text.length){
   const boundary=text.slice(0,lo).join('').search(/\s+\S*$/u);
   if(boundary>=0){
    const wordEnd=Array.from(text.slice(0,lo).join('').slice(0,boundary+1)).length;
    if(wordEnd>lo*0.75)lo=wordEnd;
   }
  }
  node.textContent=text.slice(0,lo).join('');
  remaining[i]=text.slice(lo);
  advanced ||= lo>0;
 }
 if(!advanced)throw new Error('Nie udało się zmieścić treści na stronie A4.');
}

function paginate(stage){
 const sections=[...stage.children],pages=[];
 stage.replaceChildren();
 for(const source of sections){
  const header=source.querySelector('.document-header');
  const continuation=document.createElement('div');
  continuation.className='page-continuation';
  continuation.append(...[...header.querySelector('.heading').children].map(node=>node.cloneNode(true)));
  let page,content,baseline;
  function nextPage(first=false){
   page?.remove();
   page=source.cloneNode(false);
   page.classList.add('pdf-page');
   content=document.createElement('div');
   content.className='page-content';
   if(!first)content.append(continuation.cloneNode(true));
   baseline=content.childElementCount;
   page.append(content);
   stage.append(page);
   pages.push(page);
  }
  const available=()=>page.getBoundingClientRect().bottom-parseFloat(getComputedStyle(page).paddingBottom)-content.getBoundingClientRect().bottom-1;
  const fits=()=>available()>=0;
  function movePage(){
   const previous={page,content,baseline,space:available()};
   nextPage();
   return previous;
  }
  function restorePage(previous){
   page.remove();
   pages.pop();
   ({page,content,baseline}=previous);
   stage.append(page);
  }
  const hasContent=()=>content.childElementCount>baseline;
  function place(nodes){
   content.append(...nodes);
   if(fits())return true;
   for(const node of nodes)node.remove();
   return false;
  }
  function addBlock(block,label){
   const group=label?[label,block]:[block];
   if(place(group))return;
   if(hasContent()){
    const previous=movePage();
    if(place(group))return;
    // Start an oversized paragraph here when there is room for a useful fragment.
    if(previous.space>=100)restorePage(previous);
   }
   // A contract paragraph or note can contain several pages of user-entered text.
   for(const br of block.querySelectorAll('br'))br.replaceWith('\n');
   const remaining=[Array.from(block.textContent)];
   const template=block.cloneNode(false);
   template.style.whiteSpace='pre-wrap';
   if(label)content.append(label);
   while(remaining[0].length){
    const part=template.cloneNode(false);
    content.append(part);
    fillText([part],remaining,fits);
    if(remaining[0].length)nextPage();
   }
  }
  function addTable(original,label){
   const rows=[...original.tBodies[0].rows];
   let table,body;
   function openTable(){
    table=original.cloneNode(false);
    for(const child of original.children){
     table.append(child.cloneNode(child.tagName!=='TBODY'));
    }
    body=table.tBodies[0];
   }
   openTable();
   if(label)content.append(label);
   content.append(table);
   for(const row of rows){
    body.append(row);
    if(fits())continue;
    const cells=[...row.cells];
    row.remove();
    const hadRows=body.rows.length>0;
    const firstHeading=hadRows?null:label;
    if(!hadRows){table.remove();firstHeading?.remove();}
    const previous=hadRows||hasContent()?movePage():null;
    const previousTable=table;
    openTable();
    if(firstHeading)content.append(firstHeading);
    label=null;
    content.append(table);
    body.append(row);
    if(fits())continue;
    row.remove();
    if(previous?.space>=135){
     restorePage(previous);
     table=previousTable;
     body=table.tBodies[0];
     if(firstHeading)content.append(firstHeading);
     if(!hadRows)content.append(table);
    }
    const remaining=cells.map(cell=>Array.from(cell.classList.contains('purchase-payment')
     ? [...cell.children].map(line=>line.textContent).join('\n')
     : cell.textContent));
    while(remaining.some(text=>text.length)){
     const part=row.cloneNode(false);
     const fragments=cells.map(cell=>{
      const fragment=cell.cloneNode(false);
      fragment.style.whiteSpace='pre-wrap';
      fragment.style.overflowWrap='anywhere';
      part.append(fragment);
      return fragment;
     });
     body.append(part);
     fillText(fragments,remaining,fits);
     if(remaining.some(text=>text.length)){
      nextPage();
      openTable();
      content.append(table);
     }
    }
   }
  }
  function addBlocks(blocks){
   for(let i=0;i<blocks.length;i++){
    let block=blocks[i],label;
    if(heading(block)&&blocks[i+1]&&!heading(blocks[i+1])){
     label=block;
     block=blocks[++i];
    }
    if(block.tagName==='TABLE')addTable(block,label);
    else addBlock(block,label);
   }
  }
  nextPage(true);
  addBlock(header);
  const blocks=[...source.children].flatMap(block=>{
   if(!block.classList.contains('contract'))return [block];
   const clauses=[...block.children];
   for(const clause of clauses)clause.classList.add('contract-clause');
   return clauses;
  });
  addBlocks(blocks);
  page.remove();
 }
 for(const [index,page] of pages.entries()){
  const footer=document.createElement('footer');
  footer.className='page-number';
  footer.textContent=`${index+1} / ${pages.length}`;
  page.append(footer);
 }
 return pages;
}

export async function preparePreview(){
 const status=document.querySelector('#pdf-status'),download=document.querySelector('#pdf-download');
 const stage=document.querySelector('#pdf-stage'),preview=document.querySelector('#pdf-preview');
 const imageUrls=[];
 try{
  if(!window.jspdf?.jsPDF||!window.html2canvas)throw new Error('Generator PDF jest niedostępny.');
  await Promise.all([...stage.querySelectorAll('img')].map(img=>img.decode()));
  await document.fonts.ready;
  const pages=paginate(stage);
  const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
  pdf.setProperties({title:document.title});
  for(const [index,page] of pages.entries()){
   status.textContent=`Przygotowywanie strony ${index+1} z ${pages.length}…`;
   stage.replaceChildren(page);
   const canvas=await window.html2canvas(page,{scale:2.5,backgroundColor:'#fff',logging:false,
    onclone:doc=>{doc.querySelector('#pdf-stage').style.visibility='visible';}});
   try{
    const image=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Nie udało się zapisać strony.')),'image/jpeg',0.90));
    if(index)pdf.addPage();
    const width=Math.min(WIDTH_MM,HEIGHT_MM*canvas.width/canvas.height);
    const height=Math.min(HEIGHT_MM,width*canvas.height/canvas.width);
    pdf.addImage(new Uint8Array(await image.arrayBuffer()),'JPEG',(WIDTH_MM-width)/2,(HEIGHT_MM-height)/2,width,height);
    const url=URL.createObjectURL(image);
    imageUrls.push(url);
    const img=new Image(canvas.width,canvas.height);
    img.alt=`Strona ${index+1} z ${pages.length}`;
    img.loading='lazy';
    img.src=url;
    preview.append(img);
   }finally{
    canvas.width=canvas.height=0;
   }
  }
  download.href=URL.createObjectURL(pdf.output('blob'));
  download.download=(document.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').trim().slice(0,150)||'Robisie')+'.pdf';
  download.hidden=false;
  status.textContent=`A4 · ${pages.length} ${pages.length===1?'strona':'str.'}`;
 }catch(error){
  for(const url of imageUrls)URL.revokeObjectURL(url);
  preview.replaceChildren();
  status.textContent='Nie udało się przygotować PDF. Zamknij podgląd i spróbuj ponownie.';
  console.error(error);
 }finally{
  stage.remove();
 }
}
