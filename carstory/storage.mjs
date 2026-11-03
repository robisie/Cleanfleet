const fuelColumns = 'id,vehicle_id,date,odometer,liters,cents,full_tank,entry_order,revision';

function unwrap({data, error}) {
  if (error) {
    if (error.message === 'carstory_odometer_order') {
      throw Error('Sprawdź przebieg. Musi być zgodny z wcześniejszymi i późniejszymi tankowaniami tego auta.');
    }
    if (error.code === '23505') throw Error('Samochód o tej nazwie już istnieje.');
    throw error;
  }
  return data;
}

async function readAll(query, key) {
  const pageSize = 500;
  const all = [];
  let cursor;
  for (;;) {
    let page = query().order(key).limit(pageSize);
    if (cursor !== undefined) page = page.gt(key, cursor);
    const rows = unwrap(await page);
    all.push(...rows);
    if (rows.length < pageSize) return all;
    cursor = rows.at(-1)[key];
  }
}

function fuelEntry(row) {
  const {vehicle_id, entry_order, full_tank, ...entry} = row;
  return {...entry, vehicleId: vehicle_id, order: entry_order, full: full_tank};
}

function checkChanged(row) {
  if (!row) throw Error('To tankowanie zostało zmienione lub usunięte na innym urządzeniu. Odśwież historię i otwórz wpis ponownie.');
  return row;
}

export function carStoryStorage(db) {
  const vehicles = () => db.from('carstory_vehicles');
  const fuel = () => db.from('carstory_fuel_entries');
  return {
    async load() {
      const [cars, entries] = await Promise.all([
        readAll(() => vehicles().select('id,name'), 'id'),
        readAll(() => fuel().select(fuelColumns), 'entry_order'),
      ]);
      return {
        vehicles: cars.sort((a, b) => a.name.localeCompare(b.name, 'pl')),
        entries: entries.map(fuelEntry),
      };
    },

    async addVehicle(id, name) {
      unwrap(await vehicles().upsert({id, name}, {onConflict: 'id', ignoreDuplicates: true}));
      return unwrap(await vehicles().select('id,name').eq('id', id).single());
    },

    async saveFuel(entry) {
      const {id, revision, vehicleId, date, odometer, liters, cents, full} = entry;
      const values = {date, odometer, liters, cents, full_tank: full};
      if (revision) {
        const row = unwrap(await fuel().update(values).eq('id', id).eq('revision', revision)
          .select(fuelColumns).maybeSingle());
        return fuelEntry(checkChanged(row));
      }
      unwrap(await fuel().upsert({id, vehicle_id: vehicleId, ...values}, {onConflict: 'id', ignoreDuplicates: true}));
      const saved = fuelEntry(unwrap(await fuel().select(fuelColumns).eq('id', id).single()));
      if (Object.entries({date, odometer, liters, cents, full}).some(([key, value]) => saved[key] !== value)) {
        throw Error('Poprzedni zapis tego tankowania dotarł już na serwer. Odśwież historię i edytuj zapisany wpis.');
      }
      return saved;
    },

    async removeFuel(entry) {
      checkChanged(unwrap(await fuel().delete().eq('id', entry.id).eq('revision', entry.revision)
        .select('id').maybeSingle()));
    },
  };
}
