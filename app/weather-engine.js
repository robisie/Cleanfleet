(()=>{
  'use strict';

  const CONFIG={
    lat:50.018386,
    lon:18.982804,
    timezone:'Europe/Warsaw',
    forecastDays:14,
    timeoutMs:12000,
    retries:3,
    models:[
      {id:'ecmwf_ifs025',label:'ECMWF'},
      {id:'icon_seamless',label:'ICON'},
      {id:'gfs_seamless',label:'GFS'},
      {id:'metno_seamless',label:'MET Norway'}
    ]
  };

  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const med=a=>{if(!a.length)return null;const x=[...a].sort((a,b)=>a-b);const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2;};
  const sd=a=>{if(a.length<2)return 0;const m=avg(a);return Math.sqrt(avg(a.map(v=>(v-m)**2)));};
  const num=(v,f=null)=>Number.isFinite(Number(v))?Number(v):f;
  const r1=v=>v==null?null:Math.round(v*10)/10;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function iconFromCode(code,rain=0,gust=0){
    code=Number(code||0);
    if([95,96,99].includes(code))return'⛈️';
    if([71,73,75,77,85,86].includes(code))return'🌨️';
    if(rain>=4||[61,63,65,80,81,82].includes(code))return'🌧️';
    if(rain>=0.2||[51,53,55,56,57].includes(code))return'🌦️';
    if(code===0)return'☀️';
    if([1,2].includes(code))return'🌤️';
    if(code===3)return'☁️';
    if([45,48].includes(code))return'🌫️';
    if(gust>=45)return'💨';
    return'🌤️';
  }

  function workRating(d){
    let score=100;
    score-=clamp((d.rain||0)*7,0,35);
    score-=clamp(((d.pop||0)-30)*0.35,0,20);
    score-=clamp(((d.gust||0)-25)*0.8,0,28);
    if((d.tmax??15)<2)score-=15;
    if((d.tmax??15)>32)score-=12;
    score=Math.round(clamp(score,0,100));
    let label='Bardzo dobre';
    if(score<45)label='Słabe';
    else if(score<65)label='Umiarkowane';
    else if(score<82)label='Dobre';
    return{score,label};
  }

  function apiUrl(model,days){
    const q=new URLSearchParams({
      latitude:String(CONFIG.lat),
      longitude:String(CONFIG.lon),
      timezone:CONFIG.timezone,
      forecast_days:String(days),
      models:model,
      daily:[
        'temperature_2m_max','temperature_2m_min','apparent_temperature_max','apparent_temperature_min',
        'precipitation_sum','precipitation_probability_max','wind_speed_10m_max','wind_gusts_10m_max',
        'weather_code','sunrise','sunset'
      ].join(','),
      hourly:[
        'temperature_2m','apparent_temperature','relative_humidity_2m','precipitation','precipitation_probability',
        'weather_code','cloud_cover','visibility','surface_pressure','wind_speed_10m','wind_gusts_10m'
      ].join(',')
    });
    return`https://api.open-meteo.com/v1/forecast?${q}`;
  }

  async function fetchModel(model,days){
    let lastError=null;
    for(let attempt=0;attempt<CONFIG.retries;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),CONFIG.timeoutMs);
      try{
        const response=await fetch(apiUrl(model.id,days),{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error(`${model.label}: HTTP ${response.status}`);
        const data=await response.json();
        if(!data?.daily?.time?.length)throw new Error(`${model.label}: brak danych dziennych`);
        return{model,data};
      }catch(err){
        lastError=err;
        if(attempt<CONFIG.retries-1)await sleep(700*(attempt+1));
      }finally{clearTimeout(timer);}
    }
    throw lastError||new Error(`${model.label}: błąd pobierania`);
  }

  function dailyRow(result,date){
    const i=result.data.daily?.time?.indexOf(date)??-1;
    if(i<0)return null;
    const d=result.data.daily;
    return{
      model:result.model,
      date,
      tmax:num(d.temperature_2m_max?.[i]),
      tmin:num(d.temperature_2m_min?.[i]),
      feelsMax:num(d.apparent_temperature_max?.[i]),
      feelsMin:num(d.apparent_temperature_min?.[i]),
      rain:num(d.precipitation_sum?.[i],0),
      pop:num(d.precipitation_probability_max?.[i],0),
      wind:num(d.wind_speed_10m_max?.[i],0),
      gust:num(d.wind_gusts_10m_max?.[i],0),
      code:num(d.weather_code?.[i],0),
      sunrise:d.sunrise?.[i]||'',
      sunset:d.sunset?.[i]||''
    };
  }

  function combineDaily(results,days){
    const dateSet=new Set();
    results.forEach(r=>(r.data.daily?.time||[]).slice(0,days).forEach(d=>dateSet.add(d)));
    const dates=[...dateSet].sort().slice(0,days);
    return dates.map((date,index)=>{
      const rows=results.map(r=>dailyRow(r,date)).filter(Boolean);
      const vals=key=>rows.map(r=>r[key]).filter(Number.isFinite);
      const tmax=avg(vals('tmax')),tmin=avg(vals('tmin'));
      const rain=med(vals('rain'))??0,pop=avg(vals('pop'))??0;
      const wind=med(vals('wind'))??0,gust=med(vals('gust'))??0;
      const codes=vals('code');
      const modelRatio=rows.length/CONFIG.models.length;
      const spread=(sd(vals('tmax'))*2)+(sd(vals('rain'))*5)+(sd(vals('gust'))*.45);
      const horizonPenalty=index*2.2;
      const confidence=Math.round(clamp(97-(1-modelRatio)*24-clamp(spread,0,30)-horizonPenalty,28,97));
      const d={
        date,index,modelCount:rows.length,totalModels:CONFIG.models.length,
        tmax:r1(tmax),tmin:r1(tmin),
        feelsMax:r1(avg(vals('feelsMax'))),feelsMin:r1(avg(vals('feelsMin'))),
        rain:r1(rain),pop:Math.round(pop),wind:Math.round(wind),gust:Math.round(gust),
        code:Math.round(med(codes)??0),confidence,
        sunrise:rows.find(r=>r.sunrise)?.sunrise||'',sunset:rows.find(r=>r.sunset)?.sunset||'',
        icon:iconFromCode(Math.round(med(codes)??0),rain,gust),
        models:rows
      };
      d.work=workRating(d);
      return d;
    });
  }

  function hourlyForDate(results,date){
    const byTime=new Map();
    for(const result of results){
      const h=result.data.hourly||{};
      const times=h.time||[];
      for(let i=0;i<times.length;i++){
        const time=String(times[i]);
        if(!time.startsWith(date+'T'))continue;
        if(!byTime.has(time))byTime.set(time,[]);
        byTime.get(time).push({
          model:result.model,
          temp:num(h.temperature_2m?.[i]),
          feels:num(h.apparent_temperature?.[i]),
          humidity:num(h.relative_humidity_2m?.[i]),
          rain:num(h.precipitation?.[i],0),
          pop:num(h.precipitation_probability?.[i],0),
          code:num(h.weather_code?.[i],0),
          cloud:num(h.cloud_cover?.[i]),
          visibility:num(h.visibility?.[i]),
          pressure:num(h.surface_pressure?.[i]),
          wind:num(h.wind_speed_10m?.[i],0),
          gust:num(h.wind_gusts_10m?.[i],0)
        });
      }
    }
    return[...byTime.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,rows])=>{
      const vals=k=>rows.map(r=>r[k]).filter(Number.isFinite);
      const rain=med(vals('rain'))??0,gust=med(vals('gust'))??0,code=Math.round(med(vals('code'))??0);
      return{
        time,hour:time.slice(11,16),modelCount:rows.length,
        temp:r1(avg(vals('temp'))),feels:r1(avg(vals('feels'))),humidity:Math.round(avg(vals('humidity'))??0),
        rain:r1(rain),pop:Math.round(avg(vals('pop'))??0),cloud:Math.round(avg(vals('cloud'))??0),
        visibility:Math.round((avg(vals('visibility'))??0)/100)/10,
        pressure:Math.round(avg(vals('pressure'))??0),wind:Math.round(med(vals('wind'))??0),gust:Math.round(gust),
        code,icon:iconFromCode(code,rain,gust)
      };
    });
  }

  async function load(options={}){
    const days=clamp(Number(options.days)||CONFIG.forecastDays,7,16);
    const settled=await Promise.allSettled(CONFIG.models.map(m=>fetchModel(m,days)));
    const results=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
    const missing=CONFIG.models.filter((_,i)=>settled[i].status!=='fulfilled').map(m=>m.label);
    if(!results.length)throw new Error('Nie udało się pobrać żadnego modelu pogodowego.');
    const daily=combineDaily(results,days);
    return{
      generatedAt:new Date().toISOString(),
      location:{lat:CONFIG.lat,lon:CONFIG.lon,timezone:CONFIG.timezone},
      models:results.map(r=>r.model.label),
      missing,
      totalModels:CONFIG.models.length,
      daily,
      hourly:date=>hourlyForDate(results,date),
      rawModels:results
    };
  }

  window.CFWeatherEngine={CONFIG,load,iconFromCode,workRating};
})();
