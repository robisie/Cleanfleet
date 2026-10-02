(function(root){
  'use strict';
  function duration(value){
    const s=String(value??'').trim();let h;
    if(/^\d+:\d{2}$/.test(s)){const [a,b]=s.split(':').map(Number);if(b>59)throw Error('Minuty muszą być od 00 do 59.');h=a+b/60;}
    else if(/^\d+(?:[,.]\d+)?$/.test(s))h=Number(s.replace(',','.'));
    else throw Error('Podaj czas jako 1:30 albo 1,5.');
    if(!Number.isFinite(h)||h<=0||h>168)throw Error('Czas musi być większy od 0 i nie większy niż 168 h.');
    return Math.round(h*1000000)/1000000;
  }
  function plate(v){return String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function date(v){const s=String(v??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Podaj poprawną datę prania.');return s;}
  function cost(v){const s=String(v??'').trim();if(!/^\d+(?:[,.]\d{1,2})?$/.test(s))throw Error('Podaj cenę z maksymalnie dwoma miejscami po przecinku.');const n=Number(s.replace(',','.'));if(!Number.isFinite(n)||n>1000000)throw Error('Nieprawidłowa cena.');return n;}
  function match(value,vehicles,washes){
    const key=plate(value),found=vehicles.filter(v=>plate(v.plate)===key);
    if(found.length!==1)return {error:found.length?'Niejednoznaczna rejestracja.':'Nie znaleziono pojazdu w wybranej firmie.'};
    const vehicle=found[0];return {vehicle,pending:washes.filter(w=>plate(w.plate)===key&&!w.wash_date),completed:washes.filter(w=>plate(w.plate)===key&&w.wash_date)};
  }
  const api={duration,plate,date,cost,match};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CFWashSheetCore=api;
})(typeof window!=='undefined'?window:globalThis);
