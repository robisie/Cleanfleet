(function (root) {
  'use strict';

  const levels = {1: 'Lekki', 2: 'Typowy', 3: 'Mocny', 4: 'Bardzo mocny'};
  const groups = [
    {key: 'waste', label: 'Śmieci i resztki', details: [
      ['cabin_trash', 'Śmieci w kabinie'],
      ['compartment_trash', 'Śmieci w schowkach'],
      ['crumbs', 'Resztki jedzenia i okruchy'],
      ['cigarette_waste', 'Popiół i niedopałki']
    ]},
    {key: 'loose_dirt', label: 'Piasek, sierść i kurz', details: [
      ['sand_gravel', 'Piasek i żwir'],
      ['fur', 'Sierść'],
      ['heavy_dust', 'Dużo kurzu']
    ]},
    {key: 'vacuuming', label: 'Do odkurzenia', details: [
      ['vacuum_floor', 'Podłoga'],
      ['vacuum_seats', 'Fotele'],
      ['vacuum_under_seats', 'Pod fotelami']
    ]},
    {key: 'plastics', label: 'Brudne plastiki', details: [
      ['dusty_plastics', 'Zakurzone plastiki'],
      ['sticky_plastics', 'Lepkie plastiki'],
      ['dirty_dashboard', 'Brudna deska rozdzielcza']
    ]},
    {key: 'stains_residue', label: 'Plamy i osad', details: [
      ['seat_stains', 'Plamy na fotelach'],
      ['carpet_stains', 'Plamy na wykładzinie'],
      ['food_residue', 'Lepkie ślady po jedzeniu'],
      ['dried_dirt', 'Zaschnięty brud']
    ]},
    {key: 'spill', label: 'Zalanie', details: [
      ['flooded_floor', 'Zalana podłoga'],
      ['spilled_drink', 'Rozlany napój']
    ]},
    {key: 'difficult_dirt', label: 'Trudne zabrudzenia', details: [
      ['chewing_gum', 'Guma do żucia'],
      ['vomit', 'Wymiociny'],
      ['mold', 'Widoczna pleśń']
    ]}
  ];
  const legacy = [
    ['mud', 'Błoto'], ['sand', 'Piasek'], ['stains', 'Plamy'],
    ['trash', 'Śmieci'], ['odor', 'Zapach']
  ];

  function options(level) {
    const choices = Object.entries(levels).map(([value, label]) =>
      `<option value="${value}"${Number(level) === Number(value) ? ' selected' : ''}>${value}/4 · ${label}</option>`
    );
    return '<option value="">Nie oceniono</option>' + choices.join('');
  }

  function picker(factors) {
    const selected = new Set(factors || []);
    const checkbox = ([key, label]) =>
      `<label><input type="checkbox" value="${key}"${selected.has(key) ? ' checked' : ''}><span>${label}</span></label>`;
    const tiles = groups.map(({key, label, details}) =>
      `<details class="cf-condition-tile">
        <summary>${label}</summary>
        <div class="cf-condition-choices">
          ${checkbox([key, 'Zaznacz ogólnie'])}
          ${details.map(checkbox).join('')}
        </div>
      </details>`
    );
    const saved = legacy.filter(([key]) => selected.has(key));
    if (saved.length) {
      tiles.push(`<details class="cf-condition-tile"><summary>Wcześniejsze oznaczenia</summary>
        <div class="cf-condition-choices">${saved.map(checkbox).join('')}</div></details>`);
    }
    return tiles.join('');
  }

  function describe(factors) {
    const selected = new Set(factors || []);
    const descriptions = [];
    for (const {key, label, details} of groups) {
      const chosen = details.filter(([value]) => selected.has(value)).map(([, text]) => text);
      if (chosen.length) {
        descriptions.push(key === 'vacuuming' ? `${label}: ${chosen.join(', ').toLocaleLowerCase('pl-PL')}` : chosen.join(' · '));
      } else if (selected.has(key)) {
        descriptions.push(label);
      }
    }
    for (const [key, label] of legacy) {
      if (selected.has(key)) descriptions.push(label);
    }
    return descriptions.join(' · ');
  }

  root.CFWashCondition = {levels, options, picker, describe};
})(globalThis);
