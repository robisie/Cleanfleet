alter table public.carstory_vehicles
  add column fuel_type text check (fuel_type in ('diesel', '95', '98'));

alter table public.carstory_fuel_entries
  add column fuel_type text check (fuel_type in ('diesel', '95', '98'));

grant insert (fuel_type), update (fuel_type) on public.carstory_vehicles to authenticated;
grant insert (fuel_type), update (fuel_type) on public.carstory_fuel_entries to authenticated;
