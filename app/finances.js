/* One private finance window. PIN/key remain only in the private vault frame. */
(()=>{
 'use strict';
 let current=null;
 const admin=()=>Boolean(window.cfBackupBridge?.isAdmin?.());
 function styles(){
  if(document.getElementById('cfFinanceStyle'))return;
  const style=document.createElement('style');style.id='cfFinanceStyle';style.textContent=`
  #cfFinanceWindow{position:fixed;inset:0;z-index:500005;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:#10251aa0;display:flex;justify-content:center;align-items:center;box-sizing:border-box;color:#183129;font:15px/1.5 system-ui,sans-serif}
  .cf-finance-shell{width:100%;max-width:1440px;height:100%;min-height:0;display:flex;flex-direction:column;background:#f4f7f5;border-radius:20px;overflow:hidden;box-shadow:0 20px 80px #0003}
  .cf-finance-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;background:white;border-bottom:1px solid #dae4de;flex:none}.cf-finance-head h2{font-size:22px;margin:0}.cf-finance-head>div{display:flex;gap:8px}.cf-finance-shell button{font:600 14px/1.4 system-ui,sans-serif;border:1px solid #dae4de;background:white;color:#183129;padding:10px 14px;border-radius:10px;cursor:pointer}.cf-finance-shell button:focus-visible{outline:3px solid #a6c61b;outline-offset:2px}.cf-finance-shell button:disabled{opacity:.5;cursor:wait}
  .cf-finance-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;padding:12px 20px 0;background:#e5ece7;flex:none}.cf-finance-tabs button{border-radius:12px 12px 0 0;border-bottom:0;background:#edf2ef;padding:12px 8px}.cf-finance-tabs button[aria-selected=true]{background:#275c48;color:white;border-color:#275c48}
  .cf-finance-content{min-height:0;flex:1;display:flex;flex-direction:column;position:relative}.cf-finance-pane{min-height:0;flex:1;overflow:auto}.cf-finance-frame{width:100%;height:100%;border:0;background:#f4f7f5;display:block}.cf-finance-shell [hidden]{display:none!important}.cf-finance-status{margin:0;padding:8px 20px;background:#fff3dc;color:#604115;flex:none}.cf-finance-status:empty{display:none}
  #cfFinanceEarnings>#cfEarningsOverlay{position:relative;inset:auto;padding:20px;background:transparent;display:block;min-height:100%;z-index:auto}#cfFinanceEarnings>#cfEarningsOverlay>.cf-earnings-sheet{width:100%;max-width:none;max-height:none;margin:0;box-shadow:none}#cfFinanceEarnings>#cfEarningsOverlay>.sheet>[data-close]{display:none}#cfFinanceEarnings>.overlay{z-index:500020}
  #cfFinanceTrips #cfDojazdyOverlay{position:relative;inset:auto;padding:20px;background:transparent;display:block;z-index:auto;height:100%}#cfFinanceTrips .cf-drive-sheet{max-width:none;max-height:none;height:100%;box-shadow:none}#cfFinanceTrips .cf-drive-head{display:none}#cfFinanceTrips .cf-drive-body{flex:1}
  @media(max-width:600px){#cfFinanceWindow{padding:0}.cf-finance-shell{border-radius:0}.cf-finance-head{padding:calc(10px + env(safe-area-inset-top)) 12px 10px}.cf-finance-head h2{font-size:19px}.cf-finance-head button{padding:8px 10px}.cf-finance-tabs{grid-template-columns:repeat(2,minmax(0,1fr));padding:8px 12px;gap:6px}.cf-finance-tabs button{border-radius:9px;border-bottom:1px solid #dae4de;padding:9px 5px;font-size:13px}#cfFinanceEarnings>#cfEarningsOverlay,#cfFinanceTrips #cfDojazdyOverlay{padding:12px}}
  `;document.head.append(style);
 }
 function open(){
  if(!admin()||current)return;
  styles();
  const previous=document.activeElement,overflow=document.body.style.overflow;
  const overlay=document.createElement('div');overlay.id='cfFinanceWindow';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','cfFinanceTitle');
  overlay.innerHTML=`<section class="cf-finance-shell"><header class="cf-finance-head"><h2 id="cfFinanceTitle">Moje finanse</h2><div><button type="button" data-lock hidden>Zablokuj</button><button type="button" data-close aria-label="Zamknij moje finanse">Powrót</button></div></header><nav class="cf-finance-tabs" role="tablist" aria-label="Zakładki finansów" hidden>${[['earnings','Moje zarobki'],['payments','Moje płatności'],['trips','Dojazdy'],['cash','Gotówka']].map(([id,name])=>`<button type="button" role="tab" id="cfFinanceTab-${id}" data-tab="${id}" aria-controls="${id==='earnings'?'cfFinanceEarnings':id==='trips'?'cfFinanceTrips':'cfFinancePrivate'}" aria-selected="false" tabindex="-1">${name}</button>`).join('')}</nav><p class="cf-finance-status" role="status" aria-live="polite"></p><div class="cf-finance-content"><section id="cfFinanceEarnings" class="cf-finance-pane" role="tabpanel" aria-labelledby="cfFinanceTab-earnings" hidden></section><section id="cfFinancePrivate" class="cf-finance-pane"><iframe class="cf-finance-frame" title="Prywatne finanse i odblokowanie" src="/app/priv/index.html?finance=1&v=114"></iframe></section><section id="cfFinanceTrips" class="cf-finance-pane" role="tabpanel" aria-labelledby="cfFinanceTab-trips" hidden></section></div></section>`;
  document.body.append(overlay);document.body.style.overflow='hidden';
  const inert=[...document.body.children].filter(el=>el!==overlay&&!['SCRIPT','STYLE','LINK'].includes(el.tagName)).map(el=>[el,el.inert]);inert.forEach(([el])=>el.inert=true);
  const frame=overlay.querySelector('iframe'),nav=overlay.querySelector('nav'),lockButton=overlay.querySelector('[data-lock]'),earnings=overlay.querySelector('#cfFinanceEarnings'),trips=overlay.querySelector('#cfFinanceTrips'),priv=overlay.querySelector('#cfFinancePrivate'),status=overlay.querySelector('.cf-finance-status');
  let unlocked=false,epoch=0,earningsMounted=false,tripMounted=false,timer,selected='';
  const api=()=>{try{return frame.contentWindow.CFPrivateFinance;}catch(_){return null;}};
  function activity(fromFrame=false){if(!unlocked)return;clearTimeout(timer);timer=setTimeout(lock,document.hidden?60000:600000);if(!fromFrame)api()?.activity();}
  function reset(){unlocked=false;epoch++;clearTimeout(timer);window.cfFinanceEarningsBridge?.lock();window.CFDojazdy?.dispose?.();earnings.replaceChildren();trips.replaceChildren();earningsMounted=false;tripMounted=false;selected='';nav.hidden=true;lockButton.hidden=true;earnings.hidden=true;trips.hidden=true;priv.hidden=false;status.textContent='';}
  function lock(){reset();api()?.lock();}
  function close(){lock();unsubscribe?.();document.removeEventListener('keydown',keyboard,true);document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('scroll',pointer,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('message',message);window.removeEventListener('pagehide',close);overlay.remove();inert.forEach(([el,value])=>el.inert=value);document.body.style.overflow=overflow;current=null;previous?.isConnected&&previous.focus({preventScroll:true});}
  async function select(tab){
   if(!unlocked||!admin())return;
   if(!api()?.canSwitch()){status.textContent='Zamknij otwarte okienko lub poczekaj na zakończenie zapisu.';return;}
   if(earnings.querySelector('.overlay:not(#cfEarningsOverlay)')){status.textContent='Zamknij najpierw okienko w zarobkach.';return;}
   if(!['earnings','payments','trips','cash'].includes(tab))return;
   status.textContent='';selected=tab;activity();
   nav.querySelectorAll('[data-tab]').forEach(button=>{const on=button.dataset.tab===tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
   earnings.hidden=tab!=='earnings';trips.hidden=tab!=='trips';priv.hidden=!['payments','cash'].includes(tab);
   if(tab==='payments'||tab==='cash'){priv.setAttribute('role','tabpanel');priv.setAttribute('aria-labelledby','cfFinanceTab-'+tab);api().select(tab);}
   if(tab==='earnings'&&!earningsMounted){earningsMounted=true;const opening=epoch;try{await window.cfFinanceEarningsBridge.open(earnings,()=>unlocked&&epoch===opening&&admin());}catch(error){if(unlocked&&epoch===opening){earningsMounted=false;status.textContent=error.message||'Nie udało się pobrać zarobków.';}}}
   if(tab==='trips'&&!tripMounted){tripMounted=true;window.cfShowDojazdy({host:trips,allowed:()=>unlocked&&admin()});}
  }
  function message(event){if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
   if(event.data?.type==='cf-finances-unlocked'&&admin()){unlocked=true;nav.hidden=false;lockButton.hidden=false;activity();select('earnings');}
   if(event.data?.type==='cf-finances-locked')reset();
   if(event.data?.type==='cf-finances-activity')activity(true);
   if(event.data?.type==='cf-finances-close')close();
  }
  function pointer(event){if(overlay.contains(event.target))activity();}
  function visibility(){if(unlocked)activity(true);}
  function keyboard(event){if(!overlay.isConnected)return;activity();if(event.key==='Escape'&&!earnings.querySelector('.overlay:not(#cfEarningsOverlay)')){event.preventDefault();event.stopImmediatePropagation();close();}else if(event.key==='Tab'){const elements=[...overlay.querySelectorAll('button,input,select,a,iframe')].filter(el=>!el.disabled&&el.getClientRects().length);const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last&&last.tagName!=='IFRAME'){event.preventDefault();first?.focus();}}}
  window.addEventListener('pagehide',close);window.addEventListener('message',message);document.addEventListener('keydown',keyboard,true);document.addEventListener('pointerdown',pointer,true);document.addEventListener('scroll',pointer,true);document.addEventListener('visibilitychange',visibility);
  overlay.querySelector('[data-close]').onclick=close;lockButton.onclick=lock;nav.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>select(button.dataset.tab));
  nav.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...nav.querySelectorAll('button')],index=buttons.findIndex(b=>b.dataset.tab===selected),next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;select(buttons[next].dataset.tab);buttons[next].focus();};
  const subscription=window.cfBackupBridge.getClient()?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT')close();});const unsubscribe=()=>subscription?.data?.subscription?.unsubscribe();
  current={close,lock,isUnlocked:()=>unlocked};overlay.querySelector('[data-close]').focus({preventScroll:true});
 }
 window.CFFinance={open,close:()=>current?.close(),lock:()=>current?.lock(),isUnlocked:()=>Boolean(current?.isUnlocked()),maybeOpen(){if(new URL(location.href).searchParams.get('finances')==='1'&&admin()){const url=new URL(location.href);url.searchParams.delete('finances');history.replaceState(history.state,'',url);setTimeout(open,0);}}};
})();
