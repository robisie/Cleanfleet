-- CiaoPack: independent, administrator-owned shopping rounds.
create table public.ciaopack_buyers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 120),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.ciaopack_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '',
  barcode text check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  unit text not null default 'szt.' check (length(trim(unit)) between 1 and 30),
  price_cents integer not null default 0 check (price_cents >= 0),
  photo_path text,
  barcode_photo_path text,
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index ciaopack_products_barcode_unique on public.ciaopack_products(owner_id, barcode) where barcode is not null;

create table public.ciaopack_rounds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 120),
  status text not null default 'open' check (status in ('open','shopping','closed')),
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.ciaopack_order_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  round_id uuid not null,
  buyer_id uuid not null,
  product_id uuid not null,
  source text not null default 'order' check (source in ('order','extra')),
  ordered_qty integer not null default 0 check (ordered_qty >= 0),
  delivered_qty integer not null default 0 check (delivered_qty >= 0),
  received boolean not null default false,
  price_cents integer not null check (price_cents >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  check ((source = 'order' and ordered_qty > 0) or (source = 'extra' and ordered_qty = 0)),
  check (received or delivered_qty = 0),
  foreign key (owner_id, round_id) references public.ciaopack_rounds(owner_id, id),
  foreign key (owner_id, buyer_id) references public.ciaopack_buyers(owner_id, id),
  foreign key (owner_id, product_id) references public.ciaopack_products(owner_id, id)
);
create index ciaopack_items_round on public.ciaopack_order_items(owner_id, round_id, product_id);
create index ciaopack_items_buyer on public.ciaopack_order_items(owner_id, buyer_id, round_id);

create table public.ciaopack_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  round_id uuid not null,
  product_id uuid not null,
  purchased_qty integer not null default 0 check (purchased_qty >= 0),
  foreign key (owner_id, round_id) references public.ciaopack_rounds(owner_id, id),
  foreign key (owner_id, product_id) references public.ciaopack_products(owner_id, id),
  unique (owner_id, round_id, product_id)
);

alter table public.ciaopack_buyers enable row level security;
alter table public.ciaopack_products enable row level security;
alter table public.ciaopack_rounds enable row level security;
alter table public.ciaopack_order_items enable row level security;
alter table public.ciaopack_purchases enable row level security;

revoke all on public.ciaopack_buyers, public.ciaopack_products, public.ciaopack_rounds,
  public.ciaopack_order_items, public.ciaopack_purchases from public, anon, authenticated;
grant select, insert, update, delete on public.ciaopack_buyers, public.ciaopack_products,
  public.ciaopack_rounds, public.ciaopack_order_items, public.ciaopack_purchases to authenticated;

create policy ciaopack_buyers_admin on public.ciaopack_buyers for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));
create policy ciaopack_products_admin on public.ciaopack_products for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));
create policy ciaopack_rounds_admin on public.ciaopack_rounds for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));
create policy ciaopack_items_admin on public.ciaopack_order_items for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));
create policy ciaopack_purchases_admin on public.ciaopack_purchases for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.cf_is_admin()))
  with check (owner_id = (select auth.uid()) and (select public.cf_is_admin()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ciaopack-products', 'ciaopack-products', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy ciaopack_images_read on storage.objects for select to authenticated
  using (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cf_is_admin()));
create policy ciaopack_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cf_is_admin()));
create policy ciaopack_images_update on storage.objects for update to authenticated
  using (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cf_is_admin()))
  with check (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cf_is_admin()));
create policy ciaopack_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ciaopack-products' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.cf_is_admin()));
