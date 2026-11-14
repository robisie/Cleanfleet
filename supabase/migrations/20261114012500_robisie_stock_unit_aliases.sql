-- Display-only warehouse unit aliases: never updates source invoices, KSeF XML or receipt scans.
create table if not exists public.rs_stock_unit_aliases (
 user_id uuid not null references auth.users(id) on delete cascade,
 source_key text not null check (length(source_key) between 1 and 80),
 canonical_unit text not null check (length(canonical_unit) between 1 and 40),
 updated_at timestamptz not null default now(),
 primary key (user_id,source_key)
);
alter table public.rs_stock_unit_aliases enable row level security;
revoke all on public.rs_stock_unit_aliases from public,anon;
grant select,insert,update,delete on public.rs_stock_unit_aliases to authenticated;
grant all on public.rs_stock_unit_aliases to service_role;
drop policy if exists rs_stock_units_owner_select on public.rs_stock_unit_aliases;
create policy rs_stock_units_owner_select on public.rs_stock_unit_aliases for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists rs_stock_units_owner_insert on public.rs_stock_unit_aliases;
create policy rs_stock_units_owner_insert on public.rs_stock_unit_aliases for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists rs_stock_units_owner_update on public.rs_stock_unit_aliases;
create policy rs_stock_units_owner_update on public.rs_stock_unit_aliases for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists rs_stock_units_owner_delete on public.rs_stock_unit_aliases;
create policy rs_stock_units_owner_delete on public.rs_stock_unit_aliases for delete to authenticated using (user_id=(select auth.uid()));
