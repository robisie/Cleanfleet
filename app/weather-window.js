/* Full forecast inside CleanFleet: closing preserves the current application view. */
(() => {
  'use strict';
  let active=null;
  function styles(){
    if(document.getElementById('cfFullWeatherStyle'))return;
    const style=document.createElement('style');style.id='cfFullWeatherStyle';style.textContent=`
      #cfFullWeatherOverlay{position:fixed;inset:0;z-index:500020;display:flex;align-items:center;justify-content:center;background:rgba(12,23,17,.58);box-sizing:border-box;padding:max(16px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));}
      .cf-full-weather-window{display:flex;flex-direction:column;width:100%;max-width:1500px;height:92vh;height:92dvh;max-height:100%;overflow:hidden;border-radius:18px;background:#fff;color:#17231b;box-shadow:0 20px 70px #0004;}
      .cf-full-weather-header{display:flex;align-items:center;gap:16px;flex-shrink:0;padding:12px 16px;border-bottom:1px solid #dce4dc;}
      .cf-full-weather-header h2{margin:0;font:700 18px/1.3 system-ui,sans-serif;}
      .cf-full-weather-header button{min-height:44px;border:1px solid #c9d6cb;border-radius:10px;padding:9px 14px;background:#fff;color:#25392b;font:600 15px/1.3 system-ui,sans-serif;cursor:pointer;}
      .cf-full-weather-header button:focus-visible{outline:3px solid #a6c61b;outline-offset:2px;}
      .cf-full-weather-frame{display:block;flex:1;min-height:0;width:100%;border:0;background:#101412;}
      @media(max-width:620px){#cfFullWeatherOverlay{padding:max(8px,env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left));}.cf-full-weather-window{height:100%;border-radius:14px;}.cf-full-weather-header{padding:8px 12px;}}
    `;document.head.append(style);
  }
  window.cfOpenFullWeather=function(){
    if(active)return;
    styles();
    const focus=document.activeElement,overflow=document.body.style.overflow;
    const overlay=document.createElement('div');overlay.id='cfFullWeatherOverlay';
    const sheet=document.createElement('section');sheet.className='cf-full-weather-window';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','cfFullWeatherTitle');
    const header=document.createElement('header');header.className='cf-full-weather-header';
    const back=document.createElement('button');back.type='button';back.textContent='← Powrót';
    const title=document.createElement('h2');title.id='cfFullWeatherTitle';title.textContent='Pełna prognoza pogody';
    const frame=document.createElement('iframe');frame.className='cf-full-weather-frame';frame.title='Pełna prognoza pogody CleanFleet';frame.src='/app/weather.html?embedded=1&v=20261007-1552';
    header.append(back,title);sheet.append(header,frame);overlay.append(sheet);
    const background=[...document.body.children].map(element=>({element,inert:element.inert}));
    background.forEach(({element})=>{element.inert=true;});
    document.body.style.overflow='hidden';document.body.append(overlay);active=overlay;
    function close(){
      if(active!==overlay)return;
      active=null;overlay.remove();document.body.style.overflow=overflow;
      background.forEach(({element,inert})=>{element.inert=inert;});
      window.removeEventListener('message',message);document.removeEventListener('keydown',key,true);
      if(focus?.isConnected)focus.focus();
    }
    function key(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}else if(event.key==='Tab'&&event.shiftKey&&document.activeElement===back){event.preventDefault();frame.focus();}}
    function message(event){if(event.origin===window.location.origin&&event.source===frame.contentWindow&&event.data?.type==='cf-weather-close')close();}
    back.addEventListener('click',close);overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    window.addEventListener('message',message);document.addEventListener('keydown',key,true);back.focus();
  };
})();
