alter table public.carstory_fuel_entries
  alter column odometer drop not null,
  alter column full_tank drop not null,
  drop constraint carstory_fuel_entries_fuel_type_check,
  add constraint carstory_fuel_entries_fuel_type_check
    check (fuel_type in ('diesel', 'diesel_premium', '95', '98'));
