import {administrator, client} from '../pack/auth.js?v=121';
import {chronological, consumption, decimal, localDate, periodTotals} from './model.mjs';

const $ = id => document.getElementById(id);
const vehicle = $('vehicle');
const form = $('fuelForm');
const field = name => form.elements.namedItem(name);
const money = new Intl.NumberFormat('pl-PL', {style: 'currency', currency: 'PLN'});
const number = new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 3});
const averageNumber = new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
let storageKey, editing = null;
let data = {vehicles: [], entries: []};

function status(message = '') {
  $('status').textContent = message;
}

function resetForm() {
  editing = null;
  form.reset();
  field('date').value = field('date').max = localDate();
  $('entryTitle').textContent = 'Dodaj tankowanie';
  $('cancel').hidden = true;
}

function load() {
  return JSON.parse(localStorage.getItem(storageKey) || 'null') ?? {vehicles: [], entries: []};
}

function save(next) {
  if (!storageKey) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    status('Nie udało się zapisać danych. Sprawdź ustawienia i miejsce w przeglądarce.');
    return false;
  }
  data = next;
  status();
  return true;
}

function edit(entry) {
  editing = entry.id;
  field('date').value = entry.date;
  field('odometer').value = entry.odometer;
  field('liters').value = String(entry.liters).replace('.', ',');
  field('amount').value = (entry.cents / 100).toFixed(2).replace('.', ',');
  field('full').checked = entry.full;
  $('entryTitle').textContent = 'Edytuj tankowanie';
  $('cancel').hidden = false;
  field('date').focus();
}

function historyRow(entry, showVehicle) {
  const row = document.createElement('article');
  row.className = 'record';
  const description = document.createElement('div');
  const title = document.createElement('strong');
  const details = document.createElement('div');
  const name = data.vehicles.find(car => car.id === entry.vehicleId)?.name;
  const date = entry.date.split('-').reverse().join('.');
  title.textContent = showVehicle ? date + ' · ' + name : date;
  details.className = 'details';
  details.textContent = [
    number.format(entry.odometer) + ' km', number.format(entry.liters) + ' l',
    money.format(entry.cents / 100), entry.full ? 'Do pełna' : 'Częściowe',
  ].join(' · ');
  description.append(title, details);
  const change = document.createElement('button');
  change.className = 'secondary';
  change.textContent = 'Edytuj';
  change.onclick = () => {
    vehicle.value = entry.vehicleId;
    render();
    edit(entry);
  };
  const remove = document.createElement('button');
  remove.className = 'secondary';
  remove.textContent = 'Usuń';
  remove.onclick = () => {
    if (!window.confirm('Usunąć tankowanie z ' + date + '?')) return;
    const latest = load();
    if (save({...latest, entries: latest.entries.filter(item => item.id !== entry.id)})) {
      if (editing === entry.id) resetForm();
      render();
    }
  };
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(change, remove);
  row.append(description, actions);
  return row;
}

function render(selected = vehicle.value) {
  vehicle.replaceChildren(new Option('Wszystkie auta', ''), ...data.vehicles.map(car => new Option(car.name, car.id)));
  vehicle.value = data.vehicles.some(car => car.id === selected) ? selected : '';
  const entries = data.entries.filter(entry => !vehicle.value || entry.vehicleId === vehicle.value);
  const totals = periodTotals(entries);
  for (const [period, cents] of Object.entries(totals)) $(period).textContent = money.format(cents / 100);
  const result = vehicle.value ? consumption(entries) : null;
  $('consumption').textContent = result?.average == null ? '—' : averageNumber.format(result.average) + ' l/100 km';
  $('measurement').textContent = !vehicle.value ? 'Wybierz samochód' : result.intervals
    ? number.format(result.km) + ' km w zamkniętych pomiarach'
    : 'Potrzebne dwa tankowania do pełna i dodatni dystans.';
  $('scope').textContent = 'Wydatki według dat tankowania · ' + (vehicle.value ? 'wybrane auto' : 'wszystkie auta');
  $('entry').hidden = !vehicle.value;
  $('empty').hidden = !!entries.length;
  $('history').replaceChildren(...chronological(entries).reverse().map(entry => historyRow(entry, !vehicle.value)));
}

vehicle.onchange = () => { resetForm(); status(); render(); };
$('cancel').onclick = resetForm;

$('vehicleForm').onsubmit = event => {
  event.preventDefault();
  const name = new FormData(event.target).get('name').trim();
  if (!name) return status('Wpisz nazwę samochodu.');
  const latest = load();
  if (latest.vehicles.some(car => car.name.toLocaleLowerCase('pl') === name.toLocaleLowerCase('pl'))) {
    return status('Samochód o tej nazwie już istnieje.');
  }
  const car = {id: crypto.randomUUID(), name};
  if (!save({...latest, vehicles: [...latest.vehicles, car]})) return;
  event.target.reset();
  resetForm();
  render(car.id);
};

form.onsubmit = event => {
  event.preventDefault();
  if (!vehicle.value) return;
  const liters = decimal(field('liters').value, 3);
  const amount = decimal(field('amount').value, 2);
  const date = field('date').value;
  if (!(liters > 0) || !Number.isFinite(amount)) return status('Wpisz dodatnią liczbę litrów i poprawną kwotę.');
  if (!date || date > localDate()) return status('Wybierz datę tankowania do dzisiaj.');
  const latest = load();
  const previous = latest.entries.find(entry => entry.id === editing);
  if (editing && !previous) return status('Ten wpis został usunięty w innej zakładce.');
  const entry = {
    id: previous?.id ?? crypto.randomUUID(),
    vehicleId: vehicle.value,
    date,
    odometer: field('odometer').valueAsNumber,
    liters,
    cents: Math.round(amount * 100),
    full: field('full').checked,
    order: previous?.order ?? Math.max(0, ...latest.entries.map(item => item.order)) + 1,
  };
  const entries = latest.entries.filter(item => item.id !== editing);
  const carEntries = entries.filter(item => item.vehicleId === entry.vehicleId);
  if (carEntries.some(item => (item.date < date && item.odometer > entry.odometer) ||
      (item.date > date && item.odometer < entry.odometer))) {
    return status('Sprawdź przebieg. Musi być zgodny z wcześniejszymi i późniejszymi tankowaniami tego auta.');
  }
  if (save({...latest, entries: [...entries, entry]})) {
    resetForm();
    render();
  }
};

window.addEventListener('storage', event => {
  if (storageKey && event.key === storageKey) {
    data = load();
    render();
  }
});

function lock(message) {
  storageKey = null;
  data = {vehicles: [], entries: []};
  resetForm();
  render();
  $('dashboard').hidden = true;
  status(message);
}

async function start() {
  const db = client();
  let signedOut = false;
  db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      signedOut = true;
      lock('Zaloguj się w Robisię Pack.');
    }
  });
  const user = await administrator(db);
  if (signedOut || !user) return lock('Zaloguj się w Robisię Pack.');
  storageKey = 'carstory-v1:' + user.id;
  data = load();
  resetForm();
  render(data.vehicles[0]?.id);
  status();
  $('dashboard').hidden = false;
}

start().catch(error => lock(error.message));
