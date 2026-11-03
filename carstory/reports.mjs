import {chronological, consumption} from './model.mjs?v=8';

export function reportRange(period, anchor, end) {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(anchor) || (period === 'custom' && (!validDate(end) || end < anchor))) {
    throw Error('Wybierz prawidłowy zakres dat.');
  }
  const date = new Date(anchor);
  const iso = () => date.toISOString().slice(0, 10);
  if (period === 'custom') return {from: anchor, to: end};
  if (period === 'year') return {from: anchor.slice(0, 4) + '-01-01', to: anchor.slice(0, 4) + '-12-31'};
  if (period === 'month') {
    date.setUTCMonth(date.getUTCMonth() + 1, 0);
    return {from: anchor.slice(0, 7) + '-01', to: iso()};
  }
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const from = iso();
  date.setUTCDate(date.getUTCDate() + 6);
  return {from, to: iso()};
}

export function buildReport(vehicles, entries, {from, to}, vehicleId) {
  const summaries = [];
  const history = [];
  for (const car of vehicles.filter(item => !vehicleId || item.id === vehicleId)) {
    const inRange = [];
    let previous;
    let cents = 0, liters = 0;
    for (const entry of chronological(entries.filter(item => item.vehicleId === car.id))) {
      if (entry.date > to) break;
      if (entry.date >= from) {
        inRange.push(entry);
        cents += entry.cents;
        liters += entry.liters;
        history.push({...entry, car: car.name, previousDate: previous?.odometer != null ? previous.date : null,
          distance: previous?.odometer != null && entry.odometer != null ? entry.odometer - previous.odometer : null});
      }
      previous = entry;
    }
    const readings = inRange.filter(entry => entry.odometer != null);
    const first = readings[0], last = readings.at(-1);
    summaries.push({name: car.name, count: inRange.length, cents, liters,
      distance: readings.length > 1 ? last.odometer - first.odometer : null,
      firstDate: first?.date, lastDate: last?.date, ...consumption(inRange)});
  }
  const totals = summaries.reduce((total, car) => ({
    count: total.count + car.count, cents: total.cents + car.cents, liters: total.liters + car.liters,
  }), {count: 0, cents: 0, liters: 0});
  return {from, to, vehicleId, summaries, totals, history: chronological(history).reverse()};
}

const money = new Intl.NumberFormat('pl-PL', {style: 'currency', currency: 'PLN'});
const number = new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 3});
const average = new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const dateLabel = value => value ? value.split('-').reverse().join('.') : '—';
const km = value => value == null ? '—' : number.format(value) + ' km';
const amount = cents => money.format(cents / 100);
const fuel = {diesel: 'Diesel', diesel_premium: 'Diesel Premium', '95': 'Benzyna 95', '98': 'Benzyna 98'};

export function reportPdf(report, jsPDF, font) {
  const doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'});
  doc.addFileToVFS('CarStory.ttf', font);
  doc.addFont('CarStory.ttf', 'CarStory', 'normal');
  doc.setFont('CarStory', 'normal');
  doc.setTextColor(24, 49, 41);
  doc.setFontSize(22);
  doc.text('CarStory · Raport tankowań', 12, 17);
  doc.setFontSize(10);
  const scope = report.vehicleId ? report.summaries[0]?.name ?? "Wybrane auto" : 'Wszystkie auta';
  const subtitle = doc.splitTextToSize(dateLabel(report.from) + ' – ' + dateLabel(report.to) + '  ·  ' + scope, 270);
  doc.text(subtitle, 12, 25);
  const y = 25 + (subtitle.length - 1) * 5;
  const {totals} = report;
  doc.text('Koszt: ' + amount(totals.cents) + '     Tankowania: ' + totals.count +
    '     Zatankowano: ' + number.format(totals.liters) + ' l', 12, y + 8);
  const table = (head, body, startY) => doc.autoTable({
    head: [head], body, startY, margin: {top: 12, bottom: 14, left: 12, right: 12},
    styles: {font: 'CarStory', fontStyle: 'normal', fontSize: 9, cellPadding: 2.4},
    headStyles: {fontStyle: 'normal', fillColor: [24, 83, 60]}, rowPageBreak: 'avoid',
  });
  table(['Auto', 'Tankowania', 'Litry', 'Koszt', 'Dystans', 'Daty odczytów', 'Średnie spalanie'],
    report.summaries.map(car => [
      car.name, car.count, number.format(car.liters), amount(car.cents), km(car.distance),
      car.firstDate ? dateLabel(car.firstDate) + (car.distance != null ? ' – ' + dateLabel(car.lastDate) : '') : '—',
      car.average == null ? 'Brak pełnego cyklu' : average.format(car.average) + ' l/100 km',
    ]), y + 13);
  let historyY = doc.lastAutoTable.finalY + 9;
  if (historyY > 166) {
    doc.addPage();
    historyY = 17;
  }
  doc.setFontSize(10);
  doc.text('Historia tankowań', 12, historyY);
  doc.setFontSize(8);
  doc.text('Dystans w historii liczony od poprzedniego tankowania, także sprzed zakresu. Średnie spalanie obejmuje pełne cykle w okresie.', 12, historyY + 5);
  if (report.history.length) {
    table(['Data', 'Auto', 'Stan licznika', 'Dystans', 'Poprzedni odczyt', 'Paliwo', 'Litry', 'Koszt', 'Do pełna'],
      report.history.map(entry => [
        dateLabel(entry.date), entry.car, km(entry.odometer), km(entry.distance), dateLabel(entry.previousDate),
        fuel[entry.fuel_type] ?? 'Brak danych', number.format(entry.liters), amount(entry.cents), entry.full == null ? '—' : entry.full ? 'Tak' : 'Nie',
      ]), historyY + 8);
  } else {
    doc.text('Brak tankowań w wybranym okresie.', 12, historyY + 11);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(page + ' / ' + pages, 285, 202, {align: 'right'});
  }
  return doc;
}
