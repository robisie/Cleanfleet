-- CiaoPack administrators share one catalogue, buyer list and shopping rounds.
-- Membership is managed only by a trusted database administrator, not by clients.
create table public.ciaopack_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);
alter table public.ciaopack_members enable row level security;
revoke all on public.ciaopack_members from public, anon, authenticated;

-- Keep the existing records under their original owner ID.
insert into public.ciaopack_members(user_id, owner_id)
select id, id from auth.users where id = '10888ed8-c21a-4c0c-a99e-e592170506dd';

create function public.ciaopack_owner_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.owner_id from public.ciaopack_members m
  where m.user_id = (select auth.uid()) and m.role = 'admin'
$$;
revoke all on function public.ciaopack_owner_id() from public, anon;
grant execute on function public.ciaopack_owner_id() to authenticated;

drop policy if exists ciaopack_buyers_admin on public.ciaopack_buyers;
drop policy if exists ciaopack_products_admin on public.ciaopack_products;
drop policy if exists ciaopack_rounds_admin on public.ciaopack_rounds;
drop policy if exists ciaopack_items_admin on public.ciaopack_order_items;
drop policy if exists ciaopack_purchases_admin on public.ciaopack_purchases;

create policy ciaopack_buyers_admin on public.ciaopack_buyers for all to authenticated
  using (owner_id = (select public.ciaopack_owner_id()))
  with check (owner_id = (select public.ciaopack_owner_id()));
create policy ciaopack_products_admin on public.ciaopack_products for all to authenticated
  using (owner_id = (select public.ciaopack_owner_id()))
  with check (owner_id = (select public.ciaopack_owner_id()));
create policy ciaopack_rounds_admin on public.ciaopack_rounds for all to authenticated
  using (owner_id = (select public.ciaopack_owner_id()))
  with check (owner_id = (select public.ciaopack_owner_id()));
create policy ciaopack_items_admin on public.ciaopack_order_items for all to authenticated
  using (owner_id = (select public.ciaopack_owner_id()))
  with check (owner_id = (select public.ciaopack_owner_id()));
create policy ciaopack_purchases_admin on public.ciaopack_purchases for all to authenticated
  using (owner_id = (select public.ciaopack_owner_id()))
  with check (owner_id = (select public.ciaopack_owner_id()));

drop policy if exists ciaopack_images_read on storage.objects;
drop policy if exists ciaopack_images_insert on storage.objects;
drop policy if exists ciaopack_images_update on storage.objects;
drop policy if exists ciaopack_images_delete on storage.objects;
create policy ciaopack_images_read on storage.objects for select to authenticated
  using (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select public.ciaopack_owner_id())::text);
create policy ciaopack_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select public.ciaopack_owner_id())::text);
create policy ciaopack_images_update on storage.objects for update to authenticated
  using (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select public.ciaopack_owner_id())::text)
  with check (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select public.ciaopack_owner_id())::text);
create policy ciaopack_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select public.ciaopack_owner_id())::text);
