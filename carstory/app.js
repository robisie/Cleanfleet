import {administrator, client} from '../pack/auth.js?v=121';
import {carStoryStorage} from './storage.mjs';
import {chronological, consumption, decimal, localDate, periodTotals} from './model.mjs';

const $ = id => document.getElementById(id);
const vehicle = $('vehicle');
const form = $('fuelForm');
const dialog = $('editDialog');
const editForm = form.cloneNode(true);
editForm.id = 'editForm';
const cancel = document.createElement('button');
cancel.type = 'button';
cancel.className = 'secondary';
cancel.textContent = 'Anuluj';
cancel.onclick = () => { if (!writing) dialog.close(); };
editForm.querySelector('.actions').append(cancel);
dialog.append(editForm);
const field = (name, target = form) => target.elements.namedItem(name);
const money = new Intl.NumberFormat('pl-PL', {style: 'currency', currency: 'PLN'});
const number = new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 3});
const averageNumber = new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 1, maximumFractionDigits: 1});
let storage, editing, fuelDraftId, vehicleDraft;
let loading, writing = false, loaded = false;
let data = {vehicles: [], entries: []};

function status(message = '') {
  $(dialog.open ? 'editStatus' : 'status').textContent = message;
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
    render(loaded ? vehicle.value : data.vehicles[0]?.id);
    loaded = true;
    $('dashboard').hidden = false;
    $('retry').hidden = true;
    if (!dialog.open) status();
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
  editForm.inert = true;
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
    editForm.inert = false;
  }
}

function edit(entry, name) {
  editing = entry;
  $('editVehicle').textContent = name;
  $('editStatus').textContent = '';
  field('date', editForm).max = localDate();
  field('date', editForm).value = entry.date;
  field('odometer', editForm).value = entry.odometer;
  field('liters', editForm).value = String(entry.liters).replace('.', ',');
  field('amount', editForm).value = (entry.cents / 100).toFixed(2).replace('.', ',');
  field('full', editForm).checked = entry.full;
  dialog.showModal();
}

dialog.addEventListener('cancel', event => { if (writing) event.preventDefault(); });

function historyRow(entry, showVehicle, distance) {
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
    number.format(entry.odometer) + ' km na liczniku', number.format(entry.liters) + ' l',
    money.format(entry.cents / 100), entry.full ? 'Do pełna' : 'Częściowe',
  ].join(' · ');
  const traveled = document.createElement('div');
  traveled.className = 'details';
  traveled.textContent = distance == null ? 'Dystans od poprzedniego tankowania: —'
    : 'Dystans od poprzedniego tankowania: ' + number.format(distance) + ' km';
  description.append(title, details, traveled);
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
  const previous = new Map();
  const rows = chronological(entries).map(entry => {
    const odometer = previous.get(entry.vehicleId);
    previous.set(entry.vehicleId, entry.odometer);
    return historyRow(entry, !vehicle.value, odometer === undefined ? null : entry.odometer - odometer);
  });
  $('history').replaceChildren(...rows.reverse());
}

vehicle.onchange = () => { resetForm(); status(); render(); };

$('vehicleForm').onsubmit = event => {
  event.preventDefault();
  const name = new FormData(event.target).get('name').trim();
  if (!name) return status('Wpisz nazwę samochodu.');
  if (vehicleDraft?.name !== name) vehicleDraft = {id: crypto.randomUUID(), name};
  void write(async current => {
    const car = await current.addVehicle(vehicleDraft.id, name);
    return () => {
      if (!data.vehicles.some(item => item.id === car.id)) data.vehicles.push(car);
      vehicleDraft = null;
      event.target.reset();
      resetForm();
      render(car.id);
    };
  });
};

form.onsubmit = editForm.onsubmit = event => {
  event.preventDefault();
  const target = event.currentTarget;
  const original = target === editForm ? editing : null;
  const vehicleId = original?.vehicleId ?? vehicle.value;
  if (!vehicleId) return;
  const liters = decimal(field('liters', target).value, 3);
  const amount = decimal(field('amount', target).value, 2);
  const date = field('date', target).value;
  if (!(liters > 0) || !Number.isFinite(amount)) return status('Wpisz dodatnią liczbę litrów i poprawną kwotę.');
  if (!date || date > localDate()) return status('Wybierz datę tankowania do dzisiaj.');
  const entry = {
    id: original?.id ?? (fuelDraftId ??= crypto.randomUUID()),
    revision: original?.revision,
    vehicleId,
    date,
    odometer: field('odometer', target).valueAsNumber,
    liters,
    cents: Math.round(amount * 100),
    full: field('full', target).checked,
  };
  void write(async current => {
    const saved = await current.saveFuel(entry);
    return () => {
      data.entries = [...data.entries.filter(item => item.id !== saved.id), saved];
      if (original) {
        dialog.close();
        editing = null;
      } else resetForm();
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
  storage = null;
  if (dialog.open) dialog.close();
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
