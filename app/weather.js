(() => {
  'use strict';

  const CF_WEATHER = {
    place: 'Studzienice',
    subtitle: 'pow. pszczyński',
    latitude: 50.018386,
    longitude: 18.982804,
    timezone: 'Europe/Warsaw',
    days: 7,
    models: [
      { id: 'ecmwf_ifs025', label: 'ECMWF' },
      { id: 'icon_seamless', label: 'ICON' },
      { id: 'gfs_seamless', label: 'GFS' },
      { id: 'metno_seamless', label: 'MET Norway' }
    ]
  };

  const DAY_NAMES = ['ND', 'PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO'];
  const LONG_DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  const median = arr => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const stdev = arr => {
    if (arr.length < 2) return 0;
    const m = avg(arr);
    return Math.sqrt(avg(arr.map(v => (v - m) ** 2)));
  };
  const val = (x, fallback = null) => Number.isFinite(Number(x)) ? Number(x) : fallback;
  const round1 = x => Math.round((x || 0) * 10) / 10;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function statusFrom(score, rain, gust) {
    if (score >= 82 && rain < 0.6 && gust < 35) return { key:'very-good', icon:'🟢', label:'Bardzo dobre warunki' };
    if (score >= 67) return { key:'good', icon:'🟢', label:'Dobre warunki' };
    if (score >= 48) return { key:'uncertain', icon:'🟡', label:'Warunki niepewne' };
    if (score >= 30) return { key:'poor', icon:'🟠', label:'Słabe warunki' };
    return { key:'bad', icon:'🔴', label:'Złe warunki' };
  }

  function weatherText(day) {
    if (day.rain >= 5) return 'Wyraźny sygnał deszczu';
    if (day.rain >= 1.5) return 'Prawdopodobne opady';
    if (day.wetModels >= Math.ceil(day.modelCount / 2) && day.rain >= 0.5) return 'Możliwy przelotny deszcz';
    if (day.gust >= 50) return 'Silniejsze porywy wiatru';
    if (day.gust >= 35) return 'Umiarkowany wiatr';
    return 'Przeważnie sucho';
  }

  function buildUrl(modelId) {
    const p = new URLSearchParams({
      latitude: String(CF_WEATHER.latitude),
      longitude: String(CF_WEATHER.longitude),
      daily: [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'precipitation_probability_max',
        'wind_speed_10m_max',
        'wind_gusts_10m_max'
      ].join(','),
      timezone: CF_WEATHER.timezone,
      forecast_days: String(CF_WEATHER.days),
      models: modelId
    });
    return `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
  }

  async function fetchModel(model) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const r = await fetch(buildUrl(model.id), { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      if (!j?.daily?.time?.length) throw new Error('Brak danych');
      return { model, daily: j.daily };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchFallback() {
    const p = new URLSearchParams({
      latitude: String(CF_WEATHER.latitude),
      longitude: String(CF_WEATHER.longitude),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
      timezone: CF_WEATHER.timezone,
      forecast_days: String(CF_WEATHER.days)
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p.toString()}`, { cache:'no-store' });
    if (!r.ok) throw new Error('Brak prognozy');
    const j = await r.json();
    return [{ model:{ id:'best_match', label:'Open‑Meteo Best Match' }, daily:j.daily }];
  }

  function combine(models) {
    const dates = models[0]?.daily?.time || [];
    return dates.map((date, i) => {
      const rows = models.map(m => ({
        label: m.model.label,
        tmax: val(m.daily.temperature_2m_max?.[i]),
        tmin: val(m.daily.temperature_2m_min?.[i]),
        rain: val(m.daily.precipitation_sum?.[i], 0),
        pop: val(m.daily.precipitation_probability_max?.[i]),
        wind: val(m.daily.wind_speed_10m_max?.[i], 0),
        gust: val(m.daily.wind_gusts_10m_max?.[i], 0),
        code: val(m.daily.weather_code?.[i], 0)
      }));
      const rainVals = rows.map(r => r.rain).filter(Number.isFinite);
      const windVals = rows.map(r => r.wind).filter(Number.isFinite);
      const gustVals = rows.map(r => r.gust).filter(Number.isFinite);
      const tmaxVals = rows.map(r => r.tmax).filter(Number.isFinite);
      const tminVals = rows.map(r => r.tmin).filter(Number.isFinite);
      const popVals = rows.map(r => r.pop).filter(Number.isFinite);
      const rain = median(rainVals) ?? 0;
      const wind = median(windVals) ?? 0;
      const gust = Math.max(median(gustVals) ?? 0, wind);
      const wetModels = rows.filter(r => r.rain >= 0.5).length;
      const wetShare = rows.length ? wetModels / rows.length : 0;
      const wetAgreement = rows.length ? Math.max(wetShare, 1 - wetShare) : 0.5;
      const rainSpread = stdev(rainVals);
      const windSpread = stdev(gustVals);
      const spreadPenalty = clamp(rainSpread * 5 + windSpread * 0.6, 0, 28);
      const agreementPenalty = clamp((1 - wetAgreement) * 28, 0, 14);
      const horizonPenalty = i * 1.8;
      const confidence = Math.round(clamp(96 - spreadPenalty - agreementPenalty - horizonPenalty, 40, 96));

      let rainPenalty = 0;
      if (rain >= 8) rainPenalty = 55;
      else if (rain >= 4) rainPenalty = 42;
      else if (rain >= 2) rainPenalty = 30;
      else if (rain >= 0.8) rainPenalty = 18;
      else if (rain >= 0.3) rainPenalty = 9;
      rainPenalty += wetShare >= 0.75 ? 6 : 0;

      let windPenalty = 0;
      if (gust >= 65) windPenalty = 35;
      else if (gust >= 50) windPenalty = 25;
      else if (gust >= 40) windPenalty = 16;
      else if (gust >= 30) windPenalty = 8;

      const uncertaintyPenalty = Math.max(0, (72 - confidence) * 0.35);
      const score = Math.round(clamp(100 - rainPenalty - windPenalty - uncertaintyPenalty, 0, 100));
      const status = statusFrom(score, rain, gust);

      return {
        date,
        rows,
        modelCount: rows.length,
        wetModels,
        tmax: round1(avg(tmaxVals)),
        tmin: round1(avg(tminVals)),
        rain: round1(rain),
        pop: popVals.length ? Math.round(avg(popVals)) : null,
        wind: Math.round(wind),
        gust: Math.round(gust),
        confidence,
        score,
        status
      };
    });
  }

  function dayInfo(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return {
      short: DAY_NAMES[d.getDay()],
      long: LONG_DAY_NAMES[d.getDay()],
      date: d.toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit' })
    };
  }

  function injectStyles() {
    if (document.getElementById('cfWeatherStyles')) return;
    const style = document.createElement('style');
    style.id = 'cfWeatherStyles';
    style.textContent = `
      .cf-weather-card{margin:8px 0 4px;border:1px solid var(--line-strong,#d9d9d9);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 26px rgba(0,0,0,.05)}
      .cf-weather-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 18px 12px}
      .cf-weather-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#72806f}
      .cf-weather-title{font-size:20px;font-weight:800;color:var(--ink,#111);line-height:1.15;margin-top:3px}
      .cf-weather-sub{font-size:12px;color:#7b837d;margin-top:3px}
      .cf-weather-main{text-align:right;min-width:140px}.cf-weather-main strong{display:block;font-size:13px;color:var(--ink,#111)}.cf-weather-main span{font-size:11px;color:#7b837d}
      .cf-weather-days{display:flex;gap:8px;overflow-x:auto;padding:0 14px 14px;scrollbar-width:none}.cf-weather-days::-webkit-scrollbar{display:none}
      .cf-weather-day{flex:1 0 88px;min-width:88px;border:1px solid #e6e9e7;border-radius:12px;background:#fafbfa;padding:10px 9px;text-align:left;color:var(--ink,#111);cursor:pointer}
      .cf-weather-day:hover{border-color:#b9c370}.cf-weather-day-top{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:800}.cf-weather-dot{font-size:13px}
      .cf-weather-temp{font-size:17px;font-weight:800;margin:5px 0 2px}.cf-weather-rain{font-size:11px;color:#5e6962}.cf-weather-wind{font-size:10px;color:#8a918c;margin-top:3px}
      .cf-weather-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #edf0ee;padding:10px 16px;font-size:10px;color:#7a837d}
      .cf-weather-toggle{border:0;background:transparent;color:#526028;font-weight:800;cursor:pointer;padding:4px 0}
      .cf-weather-details{display:none;border-top:1px solid #edf0ee;padding:6px 14px 14px}.cf-weather-card.is-open .cf-weather-details{display:block}
      .cf-weather-row{display:grid;grid-template-columns:minmax(120px,1.15fr) .9fr .9fr .9fr .8fr;gap:8px;align-items:center;padding:10px 4px;border-bottom:1px solid #f0f2f1;font-size:11px;color:#59625c}.cf-weather-row:last-child{border-bottom:0}
      .cf-weather-row strong{display:block;color:var(--ink,#111);font-size:12px}.cf-weather-badge{display:inline-flex;align-items:center;gap:5px;font-weight:800}.cf-weather-error{padding:18px;color:#7a514d;font-size:12px}.cf-weather-retry{margin-left:8px;border:0;background:none;color:#536126;font-weight:800;cursor:pointer}
      @media(max-width:760px){.cf-weather-head{padding:14px 14px 10px}.cf-weather-title{font-size:18px}.cf-weather-main{min-width:105px}.cf-weather-main strong{font-size:12px}.cf-weather-row{grid-template-columns:1.25fr 1fr 1fr}.cf-weather-row .cf-w-hide-mobile{display:none}.cf-weather-foot{align-items:flex-start;flex-direction:column;gap:4px}}
    `;
    document.head.appendChild(style);
  }

  function renderLoading(host) {
    host.innerHTML = `
      <div class="cf-weather-head">
        <div><div class="cf-weather-kicker">Pogoda</div><div class="cf-weather-title">${esc(CF_WEATHER.place)}</div><div class="cf-weather-sub">Analiza kilku modeli pogodowych</div></div>
        <div class="cf-weather-main"><strong>Ładowanie…</strong><span>opad • wiatr • temperatura</span></div>
      </div>`;
  }

  function render(host, days, modelLabels, fallback = false) {
    const today = days[0];
    host.innerHTML = `
      <div class="cf-weather-head">
        <div>
          <div class="cf-weather-kicker">Pogoda</div>
          <div class="cf-weather-title">${esc(CF_WEATHER.place)}</div>
          <div class="cf-weather-sub">${esc(CF_WEATHER.subtitle)} · prognoza 7 dni</div>
        </div>
        <div class="cf-weather-main">
          <strong>${today.status.icon} ${esc(today.status.label)}</strong>
          <span>${round1(today.rain).toFixed(1)} mm · porywy ${today.gust} km/h</span>
        </div>
      </div>
      <div class="cf-weather-days">
        ${days.map((d, i) => {
          const di = dayInfo(d.date);
          return `<button type="button" class="cf-weather-day" data-weather-day="${i}" title="${esc(weatherText(d))}">
            <div class="cf-weather-day-top"><span>${di.short}</span><span class="cf-weather-dot">${d.status.icon}</span></div>
            <div class="cf-weather-temp">${Math.round(d.tmax)}°</div>
            <div class="cf-weather-rain">💧 ${d.rain.toFixed(1)} mm</div>
            <div class="cf-weather-wind">💨 ${d.gust} km/h</div>
          </button>`;
        }).join('')}
      </div>
      <div class="cf-weather-foot">
        <span>${fallback ? 'Tryb zapasowy: ' : 'Modele: '}${esc(modelLabels.join(' • '))} · aktualizacja ${new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</span>
        <button type="button" class="cf-weather-toggle">Szczegóły</button>
      </div>
      <div class="cf-weather-details">
        ${days.map(d => {
          const di = dayInfo(d.date);
          return `<div class="cf-weather-row">
            <div><span class="cf-weather-badge">${d.status.icon} <strong>${di.long} ${di.date}</strong></span><span>${esc(weatherText(d))}</span></div>
            <div><strong>${d.rain.toFixed(1)} mm</strong>opad${d.pop == null ? '' : ` · ${d.pop}%`}</div>
            <div><strong>${d.wind} / ${d.gust}</strong>wiatr / porywy km/h</div>
            <div class="cf-w-hide-mobile"><strong>${Math.round(d.tmin)}–${Math.round(d.tmax)}°C</strong>temperatura</div>
            <div class="cf-w-hide-mobile"><strong>${d.confidence}%</strong>pewność</div>
          </div>`;
        }).join('')}
      </div>`;

    host.querySelector('.cf-weather-toggle')?.addEventListener('click', () => {
      host.classList.toggle('is-open');
      const b = host.querySelector('.cf-weather-toggle');
      if (b) b.textContent = host.classList.contains('is-open') ? 'Ukryj szczegóły' : 'Szczegóły';
    });
    host.querySelectorAll('[data-weather-day]').forEach(btn => btn.addEventListener('click', () => {
      host.classList.add('is-open');
      const b = host.querySelector('.cf-weather-toggle');
      if (b) b.textContent = 'Ukryj szczegóły';
      const idx = Number(btn.dataset.weatherDay || 0);
      host.querySelectorAll('.cf-weather-row')[idx]?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }));
  }

  function renderError(host) {
    host.innerHTML = `<div class="cf-weather-error">Nie udało się pobrać prognozy pogody.<button type="button" class="cf-weather-retry">Ponów</button></div>`;
    host.querySelector('.cf-weather-retry')?.addEventListener('click', () => load(host));
  }

  async function load(host) {
    renderLoading(host);
    try {
      const settled = await Promise.allSettled(CF_WEATHER.models.map(fetchModel));
      let models = settled.filter(x => x.status === 'fulfilled').map(x => x.value);
      let fallback = false;
      if (models.length < 2) {
        models = await fetchFallback();
        fallback = true;
      }
      const days = combine(models);
      if (!days.length) throw new Error('Brak dni');
      render(host, days, models.map(m => m.model.label), fallback);
    } catch (e) {
      console.warn('CleanFleet weather:', e);
      renderError(host);
    }
  }

  function mount() {
    if (document.getElementById('cfWeatherCard')) return;
    const anchor = document.querySelector('.active-section-head');
    const wrap = anchor?.parentElement || document.querySelector('.wrap');
    if (!anchor || !wrap) return;
    injectStyles();
    const host = document.createElement('section');
    host.id = 'cfWeatherCard';
    host.className = 'cf-weather-card';
    host.setAttribute('aria-label', 'Pogoda dla Studzienic');
    wrap.insertBefore(host, anchor);
    load(host);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
