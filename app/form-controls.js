(()=>{
  'use strict';
  if(window.cfFormControls)return;
  const selector='input[type="date"],input[type="datetime-local"],input[type="month"],input[type="time"]';
  const controls=new WeakMap();
  const style=document.createElement('style');style.textContent=`
    .cf-date-control{display:grid!important;grid-template-columns:minmax(0,1fr) 44px;align-items:center;gap:6px;min-width:0;max-width:100%;width:100%;box-sizing:border-box}
    .cf-date-control[hidden]{display:none!important}
    .cf-date-control>input{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
    .cf-date-control>.cf-date-clear{position:static!important;display:flex!important;align-items:center;justify-content:center;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;max-height:none!important;margin:0!important;padding:0!important;border:1px solid #b8c4bd!important;border-radius:8px!important;background:#fff!important;color:#253b30!important;font:24px/1 system-ui!important;cursor:pointer;touch-action:manipulation}
    .cf-date-control>.cf-date-clear>svg{display:block!important;width:90%!important;height:90%!important;max-width:none!important;max-height:none!important;flex:0 0 90%!important;pointer-events:none}
    .cf-date-control>.cf-date-clear>.cf-glass-icon{display:none!important}
    .cf-date-control>.cf-date-clear:disabled{opacity:.35;cursor:default}
    @media(any-pointer:coarse){input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]),select,textarea{font-size:16px!important}}
  `;document.head.appendChild(style);
  function labelFor(input){return input.getAttribute('aria-label')||input.labels?.[0]?.textContent?.replace(/×/g,'').trim()||input.closest('label')?.querySelector('span')?.textContent||input.closest('.field')?.querySelector('label,span')?.textContent?.trim()||'data';}
  function enhance(input){
    if(controls.has(input))return;
    const wrapper=document.createElement('span');wrapper.className='cf-date-control';
    const button=document.createElement('button');button.type='button';button.className='cf-date-clear';button.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M9 9L91 91M91 9L9 91" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg>';
    const label='Wyczyść: '+labelFor(input);button.setAttribute('aria-label',label);button.title=label;
    input.before(wrapper);wrapper.append(input,button);controls.set(input,button);
    const sync=()=>{button.disabled=input.disabled||input.readOnly;wrapper.hidden=input.hidden||input.style.display==='none';};sync();
    // Blur the native picker first, then clear both its value and reset baseline.
    button.addEventListener('pointerdown',event=>{event.preventDefault();input.blur();});
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();if(input.disabled||input.readOnly)return;
      input.blur();input.value='';input.defaultValue='';input.dataset.dateCleared='true';input.setCustomValidity('');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      if(input.isConnected)input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    input.addEventListener('input',()=>{if(input.value)delete input.dataset.dateCleared;sync();});
  }
  function scan(root){if(root.matches?.(selector))enhance(root);for(const input of root.querySelectorAll?.(selector)||[])enhance(input);}
  scan(document);
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes'){
        const input=record.target;
        if(input.matches?.(selector)){enhance(input);const button=controls.get(input);if(button){button.disabled=input.disabled||input.readOnly;button.parentElement.hidden=input.hidden||input.style.display==='none';}}
        else if(controls.has(input)){const button=controls.get(input),wrapper=button.parentElement;wrapper.replaceWith(input);controls.delete(input);}
      }else for(const node of record.addedNodes)if(node.nodeType===1)scan(node);
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','type','hidden','style']});
  window.cfFormControls={refresh:()=>scan(document)};
})();
