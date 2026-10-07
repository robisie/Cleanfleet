/* CleanFleet Dojazdy v1.55.4. Addresses: Photon; road distances: OSRM/FOSSGIS. */
(() => {
  'use strict';
  const admin = () => {
    try { return Boolean(window.cfBackupBridge?.isAdmin?.()); }
    catch (_) { return false; }
  };
  const number = value => Number(String(value).trim().replace(',', '.'));
  const fmt = (value, digits=2) => value.toLocaleString('pl-PL', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const calculate = (meters, consumption, price) => {
    if (![meters, consumption, price].every(Number.isFinite) || meters < 0 || consumption <= 0 || price <= 0) throw new Error('Podaj poprawne spalanie i cenę paliwa większe od zera.');
    const km=meters/1000, liters=km*consumption/100;
    return {km, liters, cost:liters*price};
  };
  window.CFDojazdy = {calculate, number};
  let active=null, lastRequest=0;
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
      return await response.json();
    } catch(error) {
      if(controller.signal.aborted && !signal.aborted) throw new Error('Usługa nie odpowiedziała w ciągu 20 sekund. Spróbuj ponownie.');
      if(error instanceof TypeError) throw new Error('Nie udało się połączyć z usługą tras. Sprawdź połączenie i spróbuj ponownie.');
      throw error;
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  function style() {
    if(document.getElementById('cfDojazdyStyle'))return;
    const s=document.createElement('style');s.id='cfDojazdyStyle';s.textContent=`
      #cfDojazdyOverlay{position:fixed;inset:0;z-index:500010;background:rgba(15,25,20,.55);display:flex;align-items:center;justify-content:center;padding: max(16px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-sizing:border-box;}
      .cf-drive-sheet{width:100%;max-width:1040px;max-height:100%;display:flex;flex-direction:column;background:#fff;color:#17231b;border-radius:18px;box-shadow:0 20px 70px #0003;overflow:hidden;font:15px/1.45 system-ui,sans-serif;}
      .cf-drive-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #e0e7e1;flex-shrink:0;gap:12px;}.cf-drive-head h2{margin:0;font-size:23px;}.cf-drive-head button{font-size:26px!important;min-width:44px;min-height:44px;}
      .cf-drive-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:22px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;}.cf-drive-body>*{min-width:0;}
      .cf-drive-sheet button{cursor:pointer;background:#fff;color:#243a2c;border:1px solid #cbd8cc;border-radius:9px;padding:9px 12px;font:600 14px/1.3 system-ui;min-height:40px;}.cf-drive-sheet button:disabled{opacity:.5;cursor:wait;}.cf-drive-sheet button:focus-visible,.cf-drive-sheet input:focus-visible{outline:3px solid #a6c61b;outline-offset:2px;}
      .cf-drive-sheet select,.cf-drive-sheet input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;min-width:0;padding:11px;border:1px solid #cad6cd;border-radius:9px;background:#fff;color:#17231b;font:16px system-ui;}.cf-drive-sheet label{display:block;font-weight:600;margin-bottom:6px;}.cf-drive-point{margin-bottom:16px;}.cf-drive-entry{display:flex;gap:6px;}.cf-drive-entry input{flex:1;}.cf-drive-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;}.cf-drive-tools button{font-size:12px;padding:5px 9px;min-height:32px;}
      .cf-drive-options{display:grid;gap:5px;margin-top:7px;}.cf-drive-options button{text-align:left;font-weight:400;overflow-wrap:anywhere;}.cf-drive-confirmed{display:block;color:#367130;font-size:13px;margin-top:5px;overflow-wrap:anywhere;}.cf-drive-settings{display:grid;align-items:end;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0;}.cf-drive-fuel{border:1px solid #dce5d9;border-radius:12px;padding:12px;margin:16px 0;background:#f7faf5;}.cf-drive-fuel-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}.cf-drive-fuel-price{font-size:21px;font-weight:700;margin-top:10px;}.cf-drive-fuel-status{font-size:13px;margin:8px 0;}.cf-drive-return{display:flex!important;align-items:center;gap:9px;font-weight:400!important;margin:16px 0!important;}.cf-drive-return input{width:20px;height:20px;flex-shrink:0;}.cf-drive-submit{width:100%;background:#a6c61b!important;color:#17231b!important;border-color:#a6c61b!important;min-height:46px!important;}
      .cf-drive-status{font-size:14px;min-height:22px;overflow-wrap:anywhere;}.cf-drive-result{background:#f3f7f2;border:1px solid #dce5d9;border-radius:14px;padding:20px;align-self:start;}.cf-drive-result h3{margin:0 0 12px;font-size:19px;}.cf-drive-metrics{display:grid;gap:14px;margin:18px 0;}.cf-drive-metrics strong{display:block;font-size:26px;}.cf-drive-metrics span{color:#526057;font-size:13px;}.cf-drive-leg{border-top:1px solid #dce5d9;padding:10px 0;font-size:13px;overflow-wrap:anywhere;}.cf-drive-note{font-size:12px;color:#526057;}.cf-drive-note a{color:#365e2b;}
      @media(max-width:700px){.cf-drive-body{grid-template-columns:1fr;padding:16px;gap:18px;}.cf-drive-head{padding:12px 16px;}.cf-drive-settings{gap:10px;}.cf-drive-result{padding:16px;}}
    `;document.head.append(s);
  }
  window.cfShowDojazdy = function() {
    if(!admin() || active)return;
    style();
    const previousFocus=document.activeElement, overflow=document.body.style.overflow;
    const overlay=document.createElement('div');overlay.id='cfDojazdyOverlay';
    overlay.innerHTML=`<section class="cf-drive-sheet" role="dialog" aria-modal="true" aria-labelledby="cfDriveTitle"><header class="cf-drive-head"><h2 id="cfDriveTitle">Dojazdy</h2><button type="button" aria-label="Zamknij">×</button></header><div class="cf-drive-body"><form novalidate><p>Dodaj adresy w kolejności przejazdu i wybierz właściwe miejsca z wyników wyszukiwania.</p><div class="cf-drive-points"></div><button type="button" data-add>Dodaj punkt pośredni</button><div class="cf-drive-settings"><div><label for="cfDriveConsumption">Spalanie (l/100 km)</label><input id="cfDriveConsumption" inputmode="decimal" value="9" autocomplete="off"></div><div><label for="cfDrivePrice">Cena paliwa (zł/l)</label><input id="cfDrivePrice" inputmode="decimal" placeholder="np. 6,50" autocomplete="off"></div></div><div class="cf-drive-fuel"><label for="cfDriveFuelType">Rodzaj paliwa</label><select id="cfDriveFuelType"><option value="petrol95">Benzyna (Pb95)</option><option value="diesel" selected>Diesel (ON)</option></select><div class="cf-drive-fuel-price" id="cfDriveLivePrice"></div><p class="cf-drive-fuel-status" id="cfDriveFuelStatus" role="status" aria-live="polite">Pobieram aktualną cenę paliwa…</p><div class="cf-drive-fuel-actions"><button type="button" id="cfDriveUsePrice" disabled>Użyj tej ceny</button><button type="button" id="cfDriveRefreshPrice">Odśwież cenę</button></div><p class="cf-drive-note">Średnia cena detaliczna w Polsce. Źródło: <a href="https://www.autocentrum.pl/paliwa/ceny-paliw/" target="_blank" rel="noopener">AutoCentrum.pl</a>. Dane sprawdzane codziennie. Cena na konkretnej stacji może się różnić.</p></div><label class="cf-drive-return"><input type="checkbox" id="cfDriveReturn">Powrót tą samą trasą</label><button type="submit" class="cf-drive-submit">Oblicz dojazd</button><p class="cf-drive-status" role="status" aria-live="polite"></p><p class="cf-drive-note">Adresy wyszukuje Photon, trasę wyznacza OSRM / FOSSGIS. Wpisane adresy są wysyłane do tych usług. Dane © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Popraw mapę</a>.</p></form><div class="cf-drive-result" aria-live="polite"><h3>Szacowany koszt paliwa</h3><p>Wynik pojawi się po obliczeniu trasy.</p><p class="cf-drive-note">Trasa drogowa dla samochodu, bez uwzględniania korków i ograniczeń dla ciężarówek. Koszt obejmuje paliwo; nie obejmuje opłat drogowych ani zużycia pojazdu.</p></div></div></section>`;
    const form=overlay.querySelector('form'), list=overlay.querySelector('.cf-drive-points'), result=overlay.querySelector('.cf-drive-result'), status=overlay.querySelector('.cf-drive-status');
    const lifetime=new AbortController();let revision=0,busy=false,points=[{text:'',place:null},{text:'',place:null}];
    active=overlay;document.body.style.overflow='hidden';document.body.append(overlay);
    function invalidate(){revision++;result.replaceChildren();const p=document.createElement('p');p.textContent='Oblicz trasę, aby zobaczyć aktualny wynik.';result.append(p);}
    function close(){lifetime.abort();overlay.remove();document.body.style.overflow=overflow;active=null;document.removeEventListener('keydown',key,true);if(previousFocus?.isConnected)previousFocus.focus();}
    function key(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}if(event.key==='Tab'){const items=[...overlay.querySelectorAll('button,input,select,a')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
    document.addEventListener('keydown',key,true);
    overlay.querySelector('header button').onclick=close;
    overlay.onclick=event=>{if(event.target===overlay)close();};
    function render(){
      list.replaceChildren();
      points.forEach((point,index)=>{
        const row=document.createElement('div');row.className='cf-drive-point';
        const label=document.createElement('label');label.textContent=index===0?'Punkt startu':index===points.length-1?'Punkt końcowy':'Punkt pośredni '+index;label.htmlFor='cfDrivePoint'+index;
        const entry=document.createElement('div');entry.className='cf-drive-entry';const input=document.createElement('input');input.id=label.htmlFor;input.value=point.text;input.placeholder='Miejscowość, ulica, numer';input.autocomplete='off';
        const search=document.createElement('button');search.type='button';search.textContent='Szukaj';
        const options=document.createElement('div');options.className='cf-drive-options';const confirmed=document.createElement('span');confirmed.className='cf-drive-confirmed';confirmed.textContent=point.place?'Wybrano: '+point.place.label:'';
        input.oninput=()=>{point.text=input.value;point.place=null;confirmed.textContent='';options.replaceChildren();invalidate();};
        input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search.click();}};
        search.onclick=async()=>{
          const query=input.value.trim();if(query.length<3){status.textContent='Wpisz co najmniej 3 znaki adresu.';input.focus();return;}
          search.disabled=true;status.textContent='Wyszukuję adres…';options.replaceChildren();
          try{
            const url='https://photon.komoot.io/api/?'+new URLSearchParams({q:query,limit:'5',lat:'50.1',lon:'19',location_bias_scale:'0.2'});
            let data=cache.get(url);if(!data){data=await request(url,lifetime.signal);cache.set(url,data);}
            if(lifetime.signal.aborted || point.text.trim()!==query || !row.isConnected || !admin())return;
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
        if(index>0&&index<points.length-1){const tools=document.createElement('div');tools.className='cf-drive-tools';for(const [name,action,disabled] of [
          ['W górę',()=>{[points[index-1],points[index]]=[points[index],points[index-1]];},index===1],
          ['W dół',()=>{[points[index+1],points[index]]=[points[index],points[index+1]];},index===points.length-2],
          ['Usuń',()=>points.splice(index,1),false]]){const b=document.createElement('button');b.type='button';b.textContent=name;b.disabled=disabled;b.onclick=()=>{action();invalidate();render();};tools.append(b);}row.append(tools);}
        list.append(row);
      });
    }
    overlay.querySelector('[data-add]').onclick=()=>{points.splice(points.length-1,0,{text:'',place:null});invalidate();render();list.children[points.length-2].querySelector('input').focus();};
    form.querySelectorAll('#cfDriveConsumption,#cfDrivePrice,#cfDriveReturn').forEach(input=>input.addEventListener('input',invalidate));
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!admin())return;
      const rev=revision,consumption=number(form.querySelector('#cfDriveConsumption').value),price=number(form.querySelector('#cfDrivePrice').value),back=form.querySelector('#cfDriveReturn').checked;
      try{calculate(0,consumption,price);}catch(error){status.textContent=error.message;return;}
      const missing=points.findIndex(point=>!point.place);if(missing>=0){status.textContent='Wyszukaj i potwierdź adres każdego punktu trasy.';list.children[missing].querySelector('input').focus();return;}
      const routePoints=points.map(point=>point.place);if(back)routePoints.push(...routePoints.slice(0,-1).reverse());
      busy=true;const submit=form.querySelector('[type=submit]');submit.disabled=true;status.textContent='Wyznaczam trasę drogową…';
      try{
        const url='https://routing.openstreetmap.de/routed-car/route/v1/driving/'+routePoints.map(p=>p.coords.join(',')).join(';')+'?overview=false&steps=false&continue_straight=false';
        let data=cache.get(url);if(!data){data=await request(url,lifetime.signal);if(data.code==='Ok')cache.set(url,data);}
        if(lifetime.signal.aborted||!admin())return;
        if(rev!==revision){status.textContent='Dane zmieniły się podczas obliczania. Oblicz trasę ponownie.';return;}
        const route=data.routes?.[0];if(data.code!=='Ok'||!route||route.legs?.length!==routePoints.length-1)throw new Error('Nie udało się wyznaczyć przejazdu przez wskazane miejsca. Sprawdź adresy.');
        const totals=calculate(route.distance,consumption,price);result.replaceChildren();
        const title=document.createElement('h3');title.textContent='Szacowany koszt paliwa';result.append(title);
        const metrics=document.createElement('div');metrics.className='cf-drive-metrics';for(const [value,label] of [[fmt(totals.km,1)+' km','Łączna odległość'+(back?' z powrotem':'')],[fmt(totals.liters)+' l','Szacowane zużycie paliwa'],[fmt(totals.cost)+' zł','Koszt przy '+fmt(price)+' zł/l']]){const item=document.createElement('div'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=label;item.append(strong,span);metrics.append(item);}result.append(metrics);
        route.legs.forEach((leg,index)=>{const p=document.createElement('div');p.className='cf-drive-leg';p.textContent=(index+1)+'. '+routePoints[index].label+' → '+routePoints[index+1].label+' · '+fmt(leg.distance/1000,1)+' km';result.append(p);});
        const note=document.createElement('p');note.className='cf-drive-note';note.textContent='Przyjęte spalanie: '+fmt(consumption)+' l/100 km. Trasa dla samochodu; bez korków i ograniczeń dla ciężarówek. Koszt obejmuje wyłącznie paliwo.';result.append(note);status.textContent='Gotowe. Punkty uwzględniono w podanej kolejności.';
      }catch(error){if(!lifetime.signal.aborted)status.textContent=error.message;}
      finally{busy=false;submit.disabled=false;}
    };
    const fuelType=form.querySelector('#cfDriveFuelType'),livePrice=form.querySelector('#cfDriveLivePrice'),fuelStatus=form.querySelector('#cfDriveFuelStatus'),usePrice=form.querySelector('#cfDriveUsePrice'),refreshPrice=form.querySelector('#cfDriveRefreshPrice');
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
        const response=await fetch('https://raw.githubusercontent.com/robisie/Cleanfleet/main/app/fuel-prices.json',{cache:'no-store',signal:controller.signal});
        if(lifetime.signal.aborted||!admin())return;
        if(!response.ok)throw new Error('Nie udało się pobrać ceny.');
        const data=await response.json();
        const day=Date.parse(data.as_of+'T00:00:00Z'),age=Date.now()-day;
        if(!data?.ok||data.currency!=='PLN'||!/^\d{4}-\d{2}-\d{2}$/.test(data.as_of)||!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==data.as_of||age < -86400000||age>3*86400000||![data.prices?.petrol95,data.prices?.diesel].every(value=>Number.isFinite(value)&&value>=1&&value<=30))throw new Error('Nie udało się pobrać ceny.');
        fuelPrices=data;renderFuelPrice();
      }catch(error){if(!lifetime.signal.aborted){fuelPrices=null;renderFuelPrice();}}
      finally{clearTimeout(timer);refreshPrice.disabled=false;}
    }
    fuelType.addEventListener('change',()=>{invalidate();if(fuelPrices)renderFuelPrice();});
    usePrice.addEventListener('click',()=>{if(!fuelPrices)return;const input=form.querySelector('#cfDrivePrice');input.value=fmt(fuelPrices.prices[fuelType.value]);invalidate();status.textContent='Zastosowano średnią cenę paliwa. Możesz ją zmienić ręcznie.';});
    refreshPrice.addEventListener('click',loadFuelPrice);
    render();list.querySelector('input').focus();loadFuelPrice();
  };
})();
