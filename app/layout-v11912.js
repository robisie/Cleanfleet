(() => {
  'use strict';

  function moveSyncBar(){
    const bar=document.querySelector('.cf-syncbar');
    const activeHead=document.querySelector('.active-section-head');
    if(!bar||!activeHead||!activeHead.parentElement)return;
    if(bar.parentElement===activeHead.parentElement && bar.nextElementSibling===activeHead)return;
    activeHead.insertAdjacentElement('beforebegin',bar);
    bar.classList.add('cf-syncbar-after-attention');
  }

  function ensureStyles(){
    if(document.getElementById('cfLayout11912Styles'))return;
    const style=document.createElement('style');
    style.id='cfLayout11912Styles';
    style.textContent=`
      .cf-syncbar.cf-syncbar-after-attention{margin:0 0 12px;padding:0;border:0;background:transparent}
      @media(max-width:520px){.cf-syncbar.cf-syncbar-after-attention{margin-bottom:10px}}
    `;
    document.head.appendChild(style);
  }

  function start(){ensureStyles();moveSyncBar();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
