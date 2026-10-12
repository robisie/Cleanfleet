/* Robisię Dojazdy v1.0.42. Adapted from the CleanFleet calculator; no shared user data. Addresses: Photon; road distances: OSRM/FOSSGIS. */
(() => {
  'use strict';
  const number = value => Number(String(value).trim().replace(',', '.'));
  const fmt = (value, digits=2) => value.toLocaleString('pl-PL', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const calculate = (meters, consumption, price) => {
    if (![meters, consumption, price].every(Number.isFinite) || meters < 0 || consumption <= 0 || price <= 0) throw new Error('Podaj poprawne spalanie i cenę paliwa większe od zera.');
    const km=meters/1000, liters=km*consumption/100;
    return {km, liters, cost:liters*price};
  };
  window.RSDojazdy = {calculate, number};
  let active=null, disposeActive=null, lastRequest=0;
  const cache=new Map();
  async function request(url, signal) {
    const now=Date.now(), scheduled=Math.max(now,lastRequest+1100);
    lastRequest=scheduled;
    const delay=scheduled-now;
    if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    if(signal.aborted) throw new DOMException('Przerwano','AbortError');
    const controller=new AbortController(), abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,20000);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
      if(!response.ok) throw new Error('Usługa adresów lub tras jest chwilowo niedostępna. Spróbuj ponownie.');
      const data=await response.json();if(signal.aborted)throw new DOMException('Przerwano','AbortError');return data;
    } catch(error) {
      if(controller.signal.aborted && !signal.aborted) throw new Error('Usługa nie odpowiedziała w ciągu 20 sekund. Spróbuj ponownie.');
      if(error instanceof TypeError) throw new Error('Nie udało się połączyć z usługą tras. Sprawdź połączenie i spróbuj ponownie.');
      throw error;
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function style() {
    if(document.getElementById('rsDojazdyStyle'))return;
    const s=document.createElement('style');s.id='rsDojazdyStyle';s.textContent=`
      #rsDojazdyOverlay{position:fixed;inset:0;z-index:500010;background:rgba(15,25,20,.55);display:flex;align-items:center;justify-content:center;padding: max(16px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box;}
      .rs-drive-sheet{width:100%;max-width:1040px;max-height:100%;display:flex;flex-direction:column;background:#fff;color:#17231b;border-radius:18px;box-shadow:0 20px 70px #0003;overflow:hidden;font:15px/1.45 system-ui,sans-serif;}
      .rs-drive-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e0e7e1;flex-shrink:0;gap:12px;}.rs-drive-head h2{margin:0;font-size:23px;}.rs-drive-head button{font-size:26px!important;min-width:44px;min-height:44px;}
      .rs-drive-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:22px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;}.rs-drive-body>*{min-width:0;}
      .rs-drive-sheet button{cursor:pointer;background:#fff;color:#243a2c;border:1px solid #cbd8cc;border-radius:9px;padding:9px 12px;font:600 14px/1.3 system-ui;min-height:40px;}.rs-drive-sheet button:disabled{opacity:.5;cursor:wait;}.rs-drive-sheet button:focus-visible,.rs-drive-sheet input:focus-visible{outline:3px solid #a6c61b;outline-offset:2px;}
      .rs-drive-sheet select,.rs-drive-sheet input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;min-width:0;padding:11px;border:1px solid #cad6cd;border-radius:9px;background:#fff;color:#17231b;font:16px system-ui;}.rs-drive-sheet label{display:block;font-weight:600;margin-bottom:6px;}.rs-drive-point{margin-bottom:16px;}.rs-drive-entry{display:flex;gap:6px;}.rs-drive-entry input{flex:1;}.rs-drive-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;}.rs-drive-tools button{font-size:12px;padding:5px 9px;min-height:32px;}
      .rs-drive-options{display:grid;gap:5px;margin-top:7px;}.rs-drive-options button{text-align:left;font-weight:400;overflow-wrap:anywhere;}.rs-drive-confirmed{display:block;color:#367130;font-size:13px;margin-top:5px;overflow-wrap:anywhere;}.rs-drive-settings{display:grid;align-items:end;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0;}.rs-drive-fuel{border:1px solid #dce5d9;border-radius:12px;padding:12px;margin:16px 0;background:#f7faf5;}.rs-drive-fuel-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}.rs-drive-fuel-price{font-size:21px;font-weight:700;margin-top:10px;}.rs-drive-fuel-status{font-size:13px;margin:8px 0;}.rs-drive-return{display:flex!important;align-items:center;gap:9px;font-weight:400!important;margin:16px 0!important;}.rs-drive-return input{width:20px;height:20px;flex-shrink:0;}.rs-drive-submit{width:100%;background:#d3d827!important;color:#17231b!important;border-color:#d3d827!important;min-height:46px!important;}
      .rs-drive-status{font-size:14px;min-height:22px;overflow-wrap:anywhere;}.rs-drive-result{background:#f3f7f2;border:1px solid #dce5d9;border-radius:14px;padding:20px;align-self:start;}.rs-drive-result h3{margin:0 0 12px;font-size:19px;}.rs-drive-metrics{display:grid;gap:14px;margin:18px 0;}.rs-drive-metrics strong{display:block;font-size:26px;}.rs-drive-metrics span{color:#526057;font-size:13px;}.rs-drive-leg{border-top:1px solid #dce5d9;padding:10px 0;font-size:13px;overflow-wrap:anywhere;}.rs-drive-note{font-size:12px;color:#526057;}.rs-drive-note a{color:#365e2b;}
      .rs-drive-footer{display:flex;align-items:end;gap:14px;padding:16px 22px;border-top:1px solid #e0e7e1;flex-shrink:0;background:#fff;}.rs-drive-footer>div{flex:1;min-width:0;}.rs-drive-footer button{width:auto;}.rs-drive-footer .rs-drive-submit{background:#d3d827!important;border-color:#d3d827!important;}
      @media(max-width:700px){.rs-drive-footer{padding:12px 16px;flex-wrap:wrap;}.rs-drive-footer>div{flex-basis:100%;}.rs-drive-footer button{width:100%;}.rs-drive-body{grid-template-columns:1fr;padding:16px;gap:18px;}.rs-drive-head{padding:12px 16px;}.rs-drive-settings{gap:10px;}.rs-drive-result{padding:16px;}}
    `;document.head.append(s);
  }
  window.RSDojazdy.dispose=()=>{disposeActive?.();cache.clear();};
  window.rsShowDojazdy = function(options={}) {
    const host=options.host,allowed=options.allowed||(()=>false);
    if(!allowed() || active)return;
    style();
    const previousFocus=document.activeElement, overflow=document.body.style.overflow;
    const overlay=document.createElement('div');overlay.id='rsDojazdyOverlay';
    overlay.innerHTML=`<section class="rs-drive-sheet" role="dialog" aria-modal="true" aria-labelledby="rsDriveTitle"><header class="rs-drive-head"><h2 id="rsDriveTitle">Dojazdy</h2><button type="button" aria-label="Zamknij">×</button></header><div class="rs-drive-body"><form novalidate><p>Dodaj adresy w kolejności przejazdu i wybierz właściwe miejsca z wyników wyszukiwania.</p><div class="rs-drive-points"></div><button type="button" data-add>Dodaj punkt pośredni</button><div class="rs-drive-settings"><div><label for="rsDriveConsumption">Spalanie (l/100 km)</label><input id="rsDriveConsumption" inputmode="decimal" value="9" autocomplete="off"></div><div><label for="rsDrivePrice">Cena paliwa (zł/l)</label><input id="rsDrivePrice" inputmode="decimal" placeholder="np. 6,50" autocomplete="off"></div></div><div class="rs-drive-fuel"><label for="rsDriveFuelType">Rodzaj paliwa</label><select id="rsDriveFuelType"><option value="petrol95">Benzyna (Pb95)</option><option value="diesel" selected>Diesel (ON)</option></select><div class="rs-drive-fuel-price" id="rsDriveLivePrice"></div><p class="rs-drive-fuel-status" id="rsDriveFuelStatus" role="status" aria-live="polite">Pobieram aktualną cenę paliwa…</p><div class="rs-drive-fuel-actions"><button type="button" id="rsDriveUsePrice" disabled>Użyj tej ceny</button><button type="button" id="rsDriveRefreshPrice">Odśwież cenę</button></div><p class="rs-drive-note">Średnia cena detaliczna w Polsce. Źródło: <a href="https://www.autocentrum.pl/paliwa/ceny-paliw/" target="_blank" rel="noopener">AutoCentrum.pl</a>. Dane sprawdzane codziennie. Cena na konkretnej stacji może się różnić.</p></div><label class="rs-drive-return"><input type="checkbox" id="rsDriveReturn">Powrót tą samą trasą</label><button type="submit" class="rs-drive-submit">Oblicz dojazd</button><p class="rs-drive-status" role="status" aria-live="polite"></p><p class="rs-drive-note">Adresy wyszukuje Photon, trasę wyznacza OSRM / FOSSGIS. Wpisane adresy są wysyłane do tych usług. Dane © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Popraw mapę</a>.</p></form><div class="rs-drive-result" aria-live="polite"><h3>Szacowany koszt paliwa</h3><p>Wynik pojawi się po obliczeniu trasy.</p><p class="rs-drive-note">Trasa drogowa dla samochodu, bez uwzględniania korków i ograniczeń dla ciężarówek. Koszt obejmuje paliwo; nie obejmuje opłat drogowych ani zużycia pojazdu.</p></div></div></section>`;
    const form=overlay.querySelector('form'), list=overlay.querySelector('.rs-drive-points'), result=overlay.querySelector('.rs-drive-result'), status=overlay.querySelector('.rs-drive-status');
    const lifetime=new AbortController();let revision=0,busy=false,saving=false,calculated=null;
    const initial=options.initial||{}, pointsInitial=initial.points;
    let points=Array.isArray(pointsInitial)&&pointsInitial.length>=2?pointsInitial.map(point=>({text:point.label,place:structuredClone(point)})):[{text:options.start||'',place:null},{text:options.end||'',place:null}];
    const footer=document.createElement('footer');footer.className='rs-drive-footer';
    const nameLabel=document.createElement('label');nameLabel.textContent='Nazwa zapisanej trasy';nameLabel.htmlFor='rsDriveName';
    const nameInput=document.createElement('input');nameInput.id='rsDriveName';nameInput.placeholder='np. Mikołów — inwestycja';nameInput.value=initial.name||'';nameInput.maxLength=200;
    const saveButton=document.createElement('button');saveButton.type='button';saveButton.className='rs-drive-submit';saveButton.textContent='Zapisz trasę w inwestycji';saveButton.disabled=true;
    const field=document.createElement('div');field.append(nameLabel,nameInput);footer.append(field,saveButton);overlay.querySelector('section').append(footer);
    form.querySelector('#rsDriveConsumption').value=initial.consumption||9;form.querySelector('#rsDrivePrice').value=initial.price||'';form.querySelector('#rsDriveReturn').checked=Boolean(initial.back);form.querySelector('#rsDriveFuelType').value=initial.fuelType||'diesel';
    saveButton.onclick=async()=>{if(!calculated||saving||!allowed())return;const name=nameInput.value.trim();if(!name){status.textContent='Podaj nazwę trasy.';nameInput.focus();return;}saving=true;saveButton.disabled=true;status.textContent='Zapisuję trasę…';try{await options.onSave?.({...structuredClone(calculated),name});saving=false;close();}catch(error){saving=false;saveButton.disabled=false;status.textContent='Nie udało się potwierdzić zapisu: '+error.message;}};
    active=overlay;if(!host)document.body.style.overflow='hidden';(host||document.body).append(overlay);if(host){overlay.querySelector('section').removeAttribute('role');overlay.querySelector('section').removeAttribute('aria-modal');}
    function invalidate(){revision++;calculated=null;saveButton.disabled=true;result.replaceChildren();const p=document.createElement('p');p.textContent='Oblicz trasę, aby zobaczyć aktualny wynik.';result.append(p);}
    function close(){if(saving)return;lifetime.abort();overlay.remove();document.body.style.overflow=overflow;active=null;disposeActive=null;document.removeEventListener('keydown',key,true);if(!host&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});options.onClose?.();}
    function key(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}if(event.key==='Tab'){const items=[...overlay.querySelectorAll('button,input,select,a')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
    disposeActive=close;
    if(!host)document.addEventListener('keydown',key,true);
    overlay.querySelector('header button').onclick=close;
    overlay.onclick=event=>{if(event.target===overlay)close();};
    function render(){
      list.replaceChildren();
      points.forEach((point,index)=>{
        const row=document.createElement('div');row.className='rs-drive-point';
        const label=document.createElement('label');label.textContent=index===0?'Punkt startu':index===points.length-1?'Punkt końcowy':'Punkt pośredni '+index;label.htmlFor='rsDrivePoint'+index;
        const entry=document.createElement('div');entry.className='rs-drive-entry';const input=document.createElement('input');input.id=label.htmlFor;input.value=point.text;input.placeholder='Miejscowość, ulica, numer';input.autocomplete='off';
        const search=document.createElement('button');search.type='button';search.textContent='Szukaj';
        const options=document.createElement('div');options.className='rs-drive-options';const confirmed=document.createElement('span');confirmed.className='rs-drive-confirmed';confirmed.textContent=point.place?'Wybrano: '+point.place.label:'';
        input.oninput=()=>{point.text=input.value;point.place=null;confirmed.textContent='';options.replaceChildren();invalidate();};
        input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search.click();}};
        search.onclick=async()=>{
          const query=input.value.trim();if(query.length<3){status.textContent='Wpisz co najmniej 3 znaki adresu.';input.focus();return;}
          search.disabled=true;status.textContent='Wyszukuję adres…';options.replaceChildren();
          try{
            const url='https://photon.komoot.io/api/?'+new URLSearchParams({q:query,limit:'5',lat:'50.1',lon:'19',location_bias_scale:'0.2'});
            let data=cache.get(url);if(!data){data=await request(url,lifetime.signal);cache.set(url,data);}
            if(lifetime.signal.aborted || point.text.trim()!==query || !row.isConnected || !allowed())return;
            for(const feature of data.features||[]){
              const p=feature.properties||{}, coords=feature.geometry?.coordinates;
              if(!Array.isArray(coords)||coords.length<2||!coords.every(Number.isFinite))continue;
              const label=[p.name,[p.street,p.housenumber].filter(Boolean).join(' '),p.postcode,p.city||p.town||p.village,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
              const button=document.createElement('button');button.type='button';button.textContent=label;
              button.onclick=()=>{point.place={coords:coords.slice(0,2),label};point.text=label;input.value=label;confirmed.textContent='Wybrano: '+label;options.replaceChildren();status.textContent='Adres potwierdzony.';invalidate();};options.append(button);
            }
            status.textContent=options.childElementCount?'Wybierz właściwy adres z listy.':'Nie znaleziono adresu. Dopisz miejscowość lub popraw nazwę ulicy.';
          }catch(error){if(!lifetime.signal.aborted)status.textContent=error.message;}
          finally{search.disabled=false;}
        };
        entry.append(input,search);row.append(label,entry,options,confirmed);
        if(index>0&&index<points.length-1){const tools=document.createElement('div');tools.className='rs-drive-tools';for(const [name,action,disabled] of [
          ['W górę',()=>{[points[index-1],points[index]]=[points[index],points[index-1]];},index===1],
          ['W dół',()=>{[points[index+1],points[index]]=[points[index],points[index+1]];},index===points.length-2],
          ['Usuń',()=>points.splice(index,1),false]]){const b=document.createElement('button');b.type='button';b.textContent=name;b.disabled=disabled;b.onclick=()=>{action();invalidate();render();};tools.append(b);}row.append(tools);}
        list.append(row);
      });
    }
    overlay.querySelector('[data-add]').onclick=()=>{points.splice(points.length-1,0,{text:'',place:null});invalidate();render();list.children[points.length-2].querySelector('input').focus();};
    form.querySelectorAll('#rsDriveConsumption,#rsDrivePrice,#rsDriveReturn').forEach(input=>input.addEventListener('input',invalidate));
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!allowed())return;
      const rev=revision,consumption=number(form.querySelector('#rsDriveConsumption').value),price=number(form.querySelector('#rsDrivePrice').value),back=form.querySelector('#rsDriveReturn').checked;
      try{calculate(0,consumption,price);}catch(error){status.textContent=error.message;return;}
      const missing=points.findIndex(point=>!point.place);if(missing>=0){status.textContent='Wyszukaj i potwierdź adres każdego punktu trasy.';list.children[missing].querySelector('input').focus();return;}
      const routePoints=points.map(point=>point.place);if(back)routePoints.push(...routePoints.slice(0,-1).reverse());
      busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;status.textContent='Wyznaczam trasę drogową…';
      try{
        const url='https://routing.openstreetmap.de/routed-car/route/v1/driving/'+routePoints.map(p=>p.coords.join(',')).join(';')+'?overview=false&steps=false&continue_straight=false';
        let data=cache.get(url);if(!data){data=await request(url,lifetime.signal);if(data.code==='Ok')cache.set(url,data);}
        if(lifetime.signal.aborted||!allowed())return;
        if(rev!==revision){status.textContent='Dane zmieniły się podczas obliczania. Oblicz trasę ponownie.';return;}
        const route=data.routes?.[0];if(data.code!=='Ok'||!route||route.legs?.length!==routePoints.length-1)throw new Error('Nie udało się wyznaczyć przejazdu przez wskazane miejsca. Sprawdź adresy.');
        const totals=calculate(route.distance,consumption,price);calculated={points:points.map(point=>structuredClone(point.place)),back,fuelType:form.querySelector('#rsDriveFuelType').value,consumption,price,meters:route.distance,...totals,legs:route.legs.map((leg,index)=>({from:routePoints[index].label,to:routePoints[index+1].label,meters:leg.distance})),calculatedAt:new Date().toISOString()};saveButton.disabled=false;if(!nameInput.value.trim())nameInput.value=points[0].place.label.split(',')[0]+' — '+points.at(-1).place.label.split(',')[0]+(back?' (z powrotem)':'');result.replaceChildren();
        const title=document.createElement('h3');title.textContent='Szacowany koszt paliwa';result.append(title);
        const metrics=document.createElement('div');metrics.className='rs-drive-metrics';for(const [value,label] of [[fmt(totals.km,1)+' km','Łączna odległość'+(back?' z powrotem':'')],[fmt(totals.liters)+' l','Szacowane zużycie paliwa'],[fmt(totals.cost)+' zł','Koszt przy '+fmt(price)+' zł/l']]){const item=document.createElement('div'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=label;item.append(strong,span);metrics.append(item);}result.append(metrics);
        route.legs.forEach((leg,index)=>{const p=document.createElement('div');p.className='rs-drive-leg';p.textContent=(index+1)+'. '+routePoints[index].label+' → '+routePoints[index+1].label+' · '+fmt(leg.distance/1000,1)+' km';result.append(p);});
        const note=document.createElement('p');note.className='rs-drive-note';note.textContent='Przyjęte spalanie: '+fmt(consumption)+' l/100 km. Trasa dla samochodu; bez korków i ograniczeń dla ciężarówek. Koszt obejmuje wyłącznie paliwo.';result.append(note);status.textContent='Gotowe. Punkty uwzględniono w podanej kolejności.';if(host){const body=overlay.querySelector('.rs-drive-body');body.scrollTo({top:body.scrollTop+result.getBoundingClientRect().top-body.getBoundingClientRect().top,behavior:'instant'});}
      }catch(error){if(!lifetime.signal.aborted)status.textContent=error.message;}
      finally{busy=false;submit.disabled=false;}
    };
    const fuelType=form.querySelector('#rsDriveFuelType'),livePrice=form.querySelector('#rsDriveLivePrice'),fuelStatus=form.querySelector('#rsDriveFuelStatus'),usePrice=form.querySelector('#rsDriveUsePrice'),refreshPrice=form.querySelector('#rsDriveRefreshPrice');
    let fuelPrices=null;
    function renderFuelPrice(){
      livePrice.textContent=fuelPrices?fmt(fuelPrices.prices[fuelType.value])+' zł/l':'';
      fuelStatus.textContent=fuelPrices?'Sprawdzono: '+new Date(fuelPrices.as_of+'T12:00:00').toLocaleDateString('pl-PL')+' · średnia w Polsce.':'Aktualna cena niedostępna. Możesz wpisać własną cenę.';
      usePrice.disabled=!fuelPrices;
    }
    async function loadFuelPrice(){
      if(refreshPrice.disabled)return;
      refreshPrice.disabled=true;usePrice.disabled=true;fuelPrices=null;livePrice.textContent='';fuelStatus.textContent='Pobieram aktualną cenę paliwa…';
      let timer;
      try{
        const controller=new AbortController();
        timer=setTimeout(()=>controller.abort(),20000);
        const response=await fetch('https://raw.githubusercontent.com/robisie/Cleanfleet/main/app/fuel-prices.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
        if(lifetime.signal.aborted||!allowed())return;
        if(!response.ok)throw new Error('Nie udało się pobrać ceny.');
        const data=await response.json();
        const day=Date.parse(data.as_of+'T00:00:00Z'),age=Date.now()-day;
        if(!data?.ok||data.currency!=='PLN'||!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of)||!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==data.as_of||age < -86400000||age>3*86400000||![data.prices?.petrol95,data.prices?.diesel].every(value=>Number.isFinite(value)&&value>=1&&value<=30))throw new Error('Nie udało się pobrać ceny.');
        fuelPrices=data;renderFuelPrice();
      }catch(error){if(!lifetime.signal.aborted){fuelPrices=null;renderFuelPrice();}}
      finally{clearTimeout(timer);refreshPrice.disabled=false;}
    }
    fuelType.addEventListener('change',()=>{invalidate();if(fuelPrices)renderFuelPrice();});
    usePrice.addEventListener('click',()=>{if(!fuelPrices)return;const input=form.querySelector('#rsDrivePrice');input.value=fmt(fuelPrices.prices[fuelType.value]);invalidate();status.textContent='Zastosowano średnią cenę paliwa. Możesz ją zmienić ręcznie.';});
    refreshPrice.addEventListener('click',loadFuelPrice);
    render();list.querySelector('input').focus();loadFuelPrice();
  };
})();
