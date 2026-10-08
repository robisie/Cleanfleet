// Runs after fonts and the logo are ready, at the same physical width as print.
export function paginateContract(){
 const source=document.querySelector('section[data-module=contract]');
 if(!source)return;
 const header=source.querySelector('.document-header'),content=source.querySelector('.contract'),footer=source.querySelector('.contract-signatures');
 const blocks=Array.from(content.children),pages=[];
 const makePage=()=>{
  const page=source.cloneNode(false);page.classList.add('contract-page');
  page.append(header.cloneNode(true));
  const body=content.cloneNode(false),sign=footer.cloneNode(true);sign.style.visibility='hidden';
  page.append(body,sign);source.before(page);pages.push(page);
  const bounds=page.getBoundingClientRect(),style=getComputedStyle(page);
  const limit=bounds.bottom-parseFloat(style.paddingBottom)-sign.getBoundingClientRect().height-2;
  return {page,body,sign,limit};
 };
 let current=makePage();
 const fits=()=>current.body.getBoundingClientRect().bottom<=current.limit;
 const add=block=>{
  current.body.append(block);
  if(fits())return;
  block.remove();
  if(current.body.children.length){current=makePage();current.body.append(block);if(fits())return;block.remove();}
  // A user-edited paragraph can exceed a page. Split it without losing text.
  const text=block.innerText||block.textContent;let remaining=text;
  while(remaining){
   const part=block.cloneNode(false);part.style.whiteSpace='pre-wrap';current.body.append(part);
   let lo=0,hi=remaining.length;
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);part.textContent=remaining.slice(0,mid);if(fits())lo=mid;else hi=mid-1;}
   if(!lo)throw new Error('Nie można dopasować treści umowy do strony A4.');
   let cut=lo;
   if(cut<remaining.length){const word=remaining.slice(0,cut).search(/\s+\S*$/);if(word>cut/2)cut=word+1;}
   part.textContent=remaining.slice(0,cut);remaining=remaining.slice(cut);
   if(remaining)current=makePage();
  }
 };
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i];
  if(/^H[34]$/.test(block.tagName)&&blocks[i+1]){
   const next=blocks[i+1];current.body.append(block,next);
   const together=fits();block.remove();next.remove();
   if(!together&&current.body.children.length)current=makePage();
  }
  add(block);
 }
 current.sign.style.visibility='visible';
 source.remove();
}
