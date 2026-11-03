import {buildReport, reportRange, reportPdf} from './reports.mjs?v=8';
import {administrator, client} from '../pack/auth.js?v=121';
import {carStoryStorage} from './storage.mjs?v=4';
import {chronological, consumption, decimal, localDate, periodTotals} from './model.mjs?v=8';

const $ = id => document.getElementById(id);
const vehicle = $('vehicle');
const form = $('fuelForm');
const dialog = $('editDialog');
const editForm = form.cloneNode(true);
editForm.id = 'editForm';
dialog.append(editForm);
const vehicleDialog = $('vehicleDialog');
const fuelDialog = $('fuelDialog');
const reportDialog = $('reportDialog');
const dialogs = [dialog, vehicleDialog, fuelDialog, reportDialog];
for (const popup of dialogs) {
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = 'Anuluj';
  cancel.onclick = () => { if (!writing) popup.close(); };
  (popup.querySelector('.actions') ?? popup.querySelector('form')).append(cancel);
  popup.addEventListener('cancel', event => { if (writing) event.preventDefault(); });
}
const field = (name, target = form) => target.elements.namedItem(name);
const fuelTypes = {diesel: 'Diesel', diesel_premium: 'Diesel Premium', '95': 'Benzyna 95', '98': 'Benzyna 98'};
const fuelOptions = ['diesel', '95', '98'];
const vehicleFuelForm = $('vehicleFuelForm');
function setFuelOptions(select, placeholder) {
  select.replaceChildren(new Option(placeholder, ''), ...(select.form === form || select.form === editForm ? [...fuelOptions, 'diesel_premium'] : fuelOptions).map(type => new Option(fuelTypes[type], type)));
}
setFuelOptions(field('fuel_type', $('vehicleForm')), 'Wybierz paliwo');
setFuelOptions(field('fuel_type', vehicleFuelForm), 'Wybierz paliwo');
setFuelOptions(field('fuel_type', editForm), 'Brak danych');

const money = new Intl.NumberFormat('pl-PL', {style: 'currency', currency: 'PLN'});
const number = new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 3});
const averageNumber = new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
let storage, editing, fuelDraftId, vehicleDraft, selectedVehicle = '';
let loading, writing = false;
let data = {vehicles: [], entries: []};

function status(message = '') {
  const popup = dialogs.find(item => item.open);
  (popup?.querySelector('[role=status]') ?? $('status')).textContent = message;
}

function resetForm() {
  fuelDraftId = null;
  form.reset();
  field('date').value = field('date').max = localDate();
}

function refresh() {
  if (!storage || writing) return;
  if (loading) return loading;
  const current = storage;
  loading = current.load().then(next => {
    if (storage !== current) return;
    data = next;
    field('date').max = localDate();
    render();
    $('dashboard').hidden = false;
    $('retry').hidden = true;
    if (!dialogs.some(item => item.open)) status();
  }).catch(() => {
    if (storage !== current) return;
    $('retry').hidden = false;
    status('Nie udało się pobrać danych z serwera. Sprawdź połączenie i odśwież.');
  }).finally(() => { loading = null; });
  return loading;
}

async function write(operation) {
  if (!storage || writing) return;
  const current = storage;
  const pendingRead = loading;
  writing = true;
  $('dashboard').inert = true;
  for (const popup of dialogs) popup.querySelector('form').inert = true;
  status('Zapisuję na serwerze…');
  try {
    await pendingRead;
    if (storage !== current) return;
    const apply = await operation(current);
    if (storage !== current) return;
    apply();
    status();
  } catch (error) {
    if (storage !== current) return;
    $('retry').hidden = false;
    status(error instanceof Error && !/^Failed to fetch|^Load failed|^NetworkError/.test(error.message)
      ? error.message : 'Nie udało się potwierdzić zapisu. Sprawdź połączenie i odśwież dane lub spróbuj ponownie.');
  } finally {
    writing = false;
    $('dashboard').inert = false;
    for (const popup of dialogs) popup.querySelector('form').inert = false;
  }
}

function edit(entry, name) {
  editing = entry;
  $('editVehicle').textContent = name;
  $('editStatus').textContent = '';
  field('date', editForm).max = localDate();
  field('date', editForm).value = entry.date;
  field('odometer', editForm).value = entry.odometer ?? '';
  field('odometer', editForm).required = entry.odometer != null;
  field('liters', editForm).value = String(entry.liters).replace('.', ',');
  field('amount', editForm).value = (entry.cents / 100).toFixed(2).replace('.', ',');
  field('full', editForm).checked = entry.full;
  field('fuel_type', editForm).value = entry.fuel_type ?? '';
  dialog.showModal();
}

function historyRow(entry, showVehicle, distance) {
  const row = document.createElement('article');
  row.className = 'record';
  const description = document.createElement('div');
  const title = document.createElement('strong');
  const name = data.vehicles.find(car => car.id === entry.vehicleId)?.name;
  const date = entry.date.split('-').reverse().join('.');
  title.textContent = showVehicle ? date + ' · ' + name : date;
  const details = document.createElement('dl');
  details.className = 'record-fields';
  for (const [label, value] of [
    ['Stan licznika', entry.odometer == null ? 'Brak danych' : number.format(entry.odometer) + ' km'],
    ['Dystans od tankowania', distance == null ? '—' : number.format(distance) + ' km'],
    ['Zatankowano', number.format(entry.liters) + ' l'],
    ['Koszt', money.format(entry.cents / 100)],
    ['Tankowanie', entry.full == null ? 'Brak danych' : entry.full ? 'Do pełna' : 'Częściowe'],
    ['Paliwo', fuelTypes[entry.fuel_type] ?? 'Brak danych'],
  ]) {
    const box = document.createElement('div');
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = label;
    definition.textContent = value;
    box.append(term, definition);
    details.append(box);
  }
  description.append(title, details);
  const change = document.createElement('button');
  change.className = 'secondary';
  change.textContent = 'Edytuj';
  change.onclick = () => edit(entry, name);
  const remove = document.createElement('button');
  remove.className = 'secondary';
  remove.textContent = 'Usuń';
  remove.onclick = () => {
    if (!window.confirm('Usunąć tankowanie z ' + date + '?')) return;
    void write(async current => {
      await current.removeFuel(entry);
      return () => {
        data.entries = data.entries.filter(item => item.id !== entry.id);
        render();
      };
    });
  };
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(change, remove);
  row.append(description, actions);
  return row;
}

const vehicleImages = new Map([
  ['kia sportage 2023', './assets/kia-sportage-2023.webp'],
  ['renault trafic 2009', './assets/renault-trafic-2009.webp'],
]);

function garageIcon(name) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 48 32');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(icon.namespaceURI, 'path');
  path.setAttribute('d', 'm8 17 5-10h22l5 10M8 17h32l4 4v8h-6v-4H10v4H4v-8z M10 21h5m18 0h5');
  icon.append(path);

  const source = vehicleImages.get(name.trim().toLowerCase().replace(/\s+/g, ' '));
  if (!source) return icon;
  const image = document.createElement('img');
  image.className = 'garage-vehicle-image';
  image.alt = '';
  image.addEventListener('error', () => image.replaceWith(icon), {once: true});
  image.src = source;
  return image;
}

function renderGarage() {
  const tiles = $('vehicleTiles');
  const focused = document.activeElement?.dataset.carId;
  const buttons = data.vehicles.map(car => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garage-tile';
    button.dataset.carId = car.id;
    button.setAttribute('aria-pressed', String(car.id === selectedVehicle));
    const name = document.createElement('strong');
    name.textContent = car.name;
    const fuel = document.createElement('small');
    fuel.textContent = fuelTypes[car.fuel_type] ?? 'Ustaw paliwo';
    button.append(garageIcon(car.name), name, fuel);
    button.onclick = () => render(car.id);
    return button;
  });
  tiles.replaceChildren(...buttons);
  if (focused) buttons.find(button => button.dataset.carId === focused)?.focus({preventScroll:true});
  $('allVehicles').setAttribute('aria-pressed', String(!selectedVehicle));
}

function updateFuelOptions() {
  const car = data.vehicles.find(item => item.id === vehicle.value);
  const selection = field('fuel_type').value;
  setFuelOptions(field('fuel_type'), car?.fuel_type ? 'Domyślne · ' + fuelTypes[car.fuel_type] : 'Wybierz paliwo');
  field('fuel_type').value = selection;
  field('fuel_type').required = !car?.fuel_type;
}

function render(selected = selectedVehicle) {
  const car = data.vehicles.find(item => item.id === selected);
  selectedVehicle = car?.id ?? '';
  renderGarage();
  const fuelVehicle = vehicle.value;
  vehicle.replaceChildren(new Option('Wybierz samochód', ''), ...data.vehicles.map(item => new Option(item.name, item.id)));
  vehicle.value = data.vehicles.some(item => item.id === fuelVehicle) ? fuelVehicle : '';
  updateFuelOptions();
  vehicleFuelForm.hidden = !car;
  const settings = field('fuel_type', vehicleFuelForm);
  if (vehicleFuelForm.dataset.vehicleId !== selectedVehicle || settings.value === vehicleFuelForm.dataset.savedFuel) {
    settings.value = car?.fuel_type ?? '';
  }
  vehicleFuelForm.dataset.vehicleId = selectedVehicle;
  vehicleFuelForm.dataset.savedFuel = car?.fuel_type ?? '';
  const entries = data.entries.filter(entry => !selectedVehicle || entry.vehicleId === selectedVehicle);
  const totals = periodTotals(entries);
  for (const [period, cents] of Object.entries(totals)) $(period).textContent = money.format(cents / 100);
  const result = selectedVehicle ? consumption(entries) : null;
  $('consumption').textContent = result?.average == null ? '—' : averageNumber.format(result.average) + ' l/100 km';
  $('measurement').textContent = !selectedVehicle ? 'Wybierz samochód' : result.intervals
    ? number.format(result.km) + ' km w zamkniętych pomiarach'
    : 'Potrzebne dwa tankowania do pełna i dodatni dystans.';
  $('scope').textContent = 'Wydatki według dat tankowania · ' + (selectedVehicle ? 'wybrane auto' : 'wszystkie auta');
  $('empty').hidden = !!entries.length;
  const previous = new Map();
  const rows = chronological(entries).map(entry => {
    const odometer = previous.get(entry.vehicleId);
    previous.set(entry.vehicleId, entry.odometer);
    return historyRow(entry, !selectedVehicle, odometer == null || entry.odometer == null ? null : entry.odometer - odometer);
  });
  $('history').replaceChildren(...rows.reverse());
}

const reportForm = $('reportForm');
const reportField = name => field(name, reportForm);
const previewLink = $('reportPreview');
const downloadLink = $('reportDownload');
let reportUrl;

function clearReportPreview() {
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = null;
  for (const link of [previewLink, downloadLink]) {
    link.hidden = true;
    link.removeAttribute('href');
  }
}
reportDialog.addEventListener('close', clearReportPreview);
function reportDates() {
  return reportRange(reportField('period').value, reportField('anchor').value, reportField('end').value);
}
function updateReportDates() {
  const period = reportField('period').value;
  $('reportEnd').hidden = period !== 'custom';
  reportField('end').required = period === 'custom';
  $('reportDateLabel').textContent = {
    year: 'Dzień w wybranym roku', month: 'Dzień w wybranym miesiącu',
    week: 'Dzień w wybranym tygodniu', custom: 'Od',
  }[period];
  try {
    const {from, to} = reportDates();
    $('reportRange').textContent = [from, to].map(value => value.split('-').reverse().join('.')).join(' – ');
  } catch {
    $('reportRange').textContent = '';
  }
}
$('openReport').onclick = () => {
  clearReportPreview();
  reportField('car').replaceChildren(new Option('Wszystkie auta', ''), ...data.vehicles.map(car => new Option(car.name, car.id)));
  reportField('car').value = selectedVehicle;
  reportField('anchor').value = reportField('end').value = localDate();
  updateReportDates();
  reportDialog.showModal();
  status();
};
reportForm.addEventListener('input', () => {
  clearReportPreview();
  updateReportDates();
  status();
});
reportForm.onsubmit = event => {
  event.preventDefault();
  try {
    const report = buildReport(data.vehicles, data.entries, reportDates(), reportField('car').value);
    const doc = reportPdf(report, window.jspdf.jsPDF, window.CFReportFont);
    clearReportPreview();
    reportUrl = URL.createObjectURL(doc.output('blob'));
    previewLink.href = downloadLink.href = reportUrl;
    downloadLink.download = 'CarStory-' + report.from + '-' + report.to + '.pdf';
    previewLink.hidden = downloadLink.hidden = false;
    status('Podgląd PDF otwiera się w nowej karcie. Po sprawdzeniu wróć tutaj, aby pobrać plik.');
    previewLink.click();
  } catch (error) {
    status(error.message || 'Nie udało się utworzyć PDF.');
  }
};

$('allVehicles').onclick = () => render('');
$('addVehicle').onclick = () => {
  vehicleDialog.showModal();
  status();
};
$('addFuel').onclick = () => {
  if (!data.vehicles.length) {
    vehicleDialog.showModal();
    status('Dodaj pojazd, aby zapisać tankowanie.');
    return;
  }
  resetForm();
  vehicle.value = selectedVehicle || (data.vehicles.length === 1 ? data.vehicles[0].id : '');
  updateFuelOptions();
  fuelDialog.showModal();
  status();
};
vehicle.onchange = () => {
  field('fuel_type').value = '';
  fuelDraftId = null;
  updateFuelOptions();
};

$('vehicleForm').onsubmit = event => {
  event.preventDefault();
  const name = new FormData(event.target).get('name').trim();
  if (!name) return status('Wpisz nazwę samochodu.');
  const fuel = field('fuel_type', event.target).value;
  if (!fuelOptions.includes(fuel)) return status('Wybierz paliwo samochodu.');
  if (vehicleDraft?.name !== name) vehicleDraft = {id: crypto.randomUUID(), name};
  void write(async current => {
    const car = await current.addVehicle(vehicleDraft.id, name, fuel);
    return () => {
      if (!data.vehicles.some(item => item.id === car.id)) data.vehicles.push(car);
      vehicleDraft = null;
      event.target.reset();
      vehicleDialog.close();
      render(car.id);
    };
  });
};

vehicleFuelForm.onsubmit = event => {
  event.preventDefault();
  const carId = selectedVehicle;
  const fuel = field('fuel_type', vehicleFuelForm).value;
  if (!carId || !fuelOptions.includes(fuel)) return;
  void write(async current => {
    const saved = await current.updateVehicleFuel(carId, fuel);
    return () => {
      data.vehicles = data.vehicles.map(car => car.id === carId ? saved : car);
      render();
    };
  });
};

form.onsubmit = editForm.onsubmit = event => {
  event.preventDefault();
  const target = event.currentTarget;
  const original = target === editForm ? editing : null;
  const vehicleId = original?.vehicleId ?? vehicle.value;
  if (!vehicleId) return status('Wybierz samochód.');
  const liters = decimal(field('liters', target).value, 3);
  const amount = decimal(field('amount', target).value, 2);
  const date = field('date', target).value;
  if (!(liters > 0) || !Number.isFinite(amount)) return status('Wpisz dodatnią liczbę litrów i poprawną kwotę.');
  if (!date || date > localDate()) return status('Wybierz datę tankowania do dzisiaj.');
  const selection = field('fuel_type', target).value;
  const fuel = selection || (original ? null : data.vehicles.find(car => car.id === vehicleId)?.fuel_type);
  if (!original && !fuel) return status('Wybierz zatankowane paliwo.');
  const entry = {
    fuel_type: fuel,
    id: original?.id ?? (fuelDraftId ??= crypto.randomUUID()),
    revision: original?.revision,
    vehicleId,
    date,
    odometer: field('odometer', target).value === '' ? null : field('odometer', target).valueAsNumber,
    liters,
    cents: Math.round(amount * 100),
    full: field('full', target).checked ? true : original?.full === null ? null : false,
  };
  void write(async current => {
    const saved = await current.saveFuel(entry);
    return () => {
      data.entries = [...data.entries.filter(item => item.id !== saved.id), saved];
      if (original) {
        dialog.close();
        editing = null;
      } else {
        fuelDialog.close();
        resetForm();
      }
      render();
    };
  });
};

$('retry').onclick = () => refresh();
window.addEventListener('focus', refresh);
window.addEventListener('online', refresh);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
window.addEventListener('message', event => {
  if (event.source === parent && event.origin === location.origin && event.data?.type === 'robisie-pack-activated') refresh();
});
window.setInterval(() => {
  if (!document.hidden) refresh();
}, 30000);

function lock(message) {
  clearReportPreview();
  storage = null;
  for (const popup of dialogs) if (popup.open) popup.close();
  $('vehicleForm').reset();
  editing = null;
  vehicleDraft = null;
  $('retry').hidden = true;
  data = {vehicles: [], entries: []};
  resetForm();
  render();
  $('dashboard').hidden = true;
  status(message);
}

async function start() {
  const db = client();
  let sessionChanged = false, ownerId;
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (ownerId && session?.user?.id !== ownerId)) {
      sessionChanged = true;
      lock('Zaloguj się w Robisię Pack.');
    }
  });
  const user = await administrator(db);
  if (sessionChanged || !user) return lock('Zaloguj się w Robisię Pack.');
  ownerId = user.id;
  storage = carStoryStorage(db);
  resetForm();
  await refresh();
}

start().catch(error => lock(error.message));
