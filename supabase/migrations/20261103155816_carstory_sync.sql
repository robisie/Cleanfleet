create table public.carstory_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  unique (owner_id, id)
);

create unique index carstory_vehicle_name_per_owner
  on public.carstory_vehicles (owner_id, lower(name));

create table public.carstory_fuel_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  vehicle_id uuid not null,
  date date not null check (date between date '0001-01-01' and (now() at time zone 'Europe/Warsaw')::date),
  odometer integer not null check (odometer between 0 and 99999999),
  liters numeric(10,3) not null check (liters > 0 and liters <> 'NaN'::numeric),
  cents integer not null check (cents between 0 and 999999999),
  full_tank boolean not null,
  entry_order bigint generated always as identity unique,
  revision uuid not null default gen_random_uuid(),
  foreign key (owner_id, vehicle_id)
    references public.carstory_vehicles (owner_id, id) on delete cascade
);

create index carstory_fuel_owner_order on public.carstory_fuel_entries (owner_id, entry_order);
create index carstory_fuel_vehicle_date on public.carstory_fuel_entries (owner_id, vehicle_id, date);

alter table public.carstory_vehicles enable row level security;
alter table public.carstory_fuel_entries enable row level security;

revoke all on public.carstory_vehicles, public.carstory_fuel_entries from public, anon, authenticated;
grant select, insert (id, name) on public.carstory_vehicles to authenticated;
grant select, insert (id, vehicle_id, date, odometer, liters, cents, full_tank),
  update (date, odometer, liters, cents, full_tank), delete
  on public.carstory_fuel_entries to authenticated;

create policy carstory_vehicles_owner on public.carstory_vehicles for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));

create policy carstory_fuel_owner on public.carstory_fuel_entries for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));

create function public.carstory_validate_fuel_entry() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  -- Serialize odometer checks for a car even when two devices save simultaneously.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.vehicle_id::text, 0));
  if exists (
    select 1 from public.carstory_fuel_entries as entry
    where entry.owner_id = new.owner_id and entry.vehicle_id = new.vehicle_id
      and entry.id <> new.id
      and ((entry.date < new.date and entry.odometer > new.odometer)
        or (entry.date > new.date and entry.odometer < new.odometer))
  ) then
    raise exception using errcode = '23514', message = 'carstory_odometer_order';
  end if;
  if tg_op = 'UPDATE' then
    new.revision := pg_catalog.gen_random_uuid();
  end if;
  return new;
end;
$$;

revoke all on function public.carstory_validate_fuel_entry() from public, anon, authenticated;
create trigger carstory_validate_fuel_entry before insert or update on public.carstory_fuel_entries
  for each row execute function public.carstory_validate_fuel_entry();
