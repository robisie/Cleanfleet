export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(date);
}

export function periodTotals(entries, today = localDate()) {
  const weekday = new Date(today + 'T00:00:00Z');
  weekday.setUTCDate(weekday.getUTCDate() - (weekday.getUTCDay() + 6) % 7);
  const monday = weekday.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const totals = {day: 0, week: 0, month: 0};
  for (const entry of entries) {
    if (entry.date > today) continue;
    if (entry.date === today) totals.day += entry.cents;
    if (entry.date >= monday) totals.week += entry.cents;
    if (entry.date >= monthStart) totals.month += entry.cents;
  }
  return totals;
}

export function chronological(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) ||
    (a.odometer ?? -1) - (b.odometer ?? -1) || a.order - b.order);
}

export function consumption(entries) {
  let start = null, pending = 0, liters = 0, km = 0, intervals = 0;
  for (const entry of chronological(entries)) {
    if (start !== null) pending += entry.liters;
    if (!entry.full || entry.odometer == null) continue;
    if (start !== null && entry.odometer === start) continue;
    if (start !== null && entry.odometer > start) {
      km += entry.odometer - start;
      liters += pending;
      intervals++;
    }
    start = entry.odometer;
    pending = 0;
  }
  return {km, intervals, average: km ? liters * 100 / km : null};
}

export function decimal(value, places) {
  const input = value.trim().replace(',', '.');
  if (!new RegExp('^\\d{1,7}(?:\\.\\d{1,' + places + '})?$').test(input)) return NaN;
  return Number(input);
}
