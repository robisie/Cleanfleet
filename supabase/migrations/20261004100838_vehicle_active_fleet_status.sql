alter table public.vehicles
  add column if not exists in_fleet boolean not null default true,
  add column if not exists fleet_removed_at timestamptz;

comment on column public.vehicles.in_fleet is
  'Czy pojazd należy obecnie do aktywnej floty. false zachowuje rekord pojazdu i całą historię.';

comment on column public.vehicles.fleet_removed_at is
  'Data i czas usunięcia pojazdu z aktywnej floty. NULL gdy pojazd jest aktywny.';
