-- Visibility only: no quantity, allocation, return or cost is changed.
create table public.rs_stock_hidden (
 owner_id uuid not null default auth.uid(),
 ksef_number text not null,
 item_index integer not null check(item_index>0),
 created_at timestamptz not null default now(),
 primary key(owner_id,ksef_number,item_index),
 foreign key(owner_id,ksef_number) references public.rs_ksef_documents(owner_id,ksef_number) on delete cascade
);
alter table public.rs_stock_hidden enable row level security;
revoke all on table public.rs_stock_hidden from public,anon,authenticated;
grant select,insert,delete on table public.rs_stock_hidden to authenticated;
create policy rs_stock_hidden_read on public.rs_stock_hidden for select to authenticated using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy rs_stock_hidden_add on public.rs_stock_hidden for insert to authenticated with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy rs_stock_hidden_remove on public.rs_stock_hidden for delete to authenticated using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create function public.rs_ksef_set_hidden(p_number text,p_index integer,p_hidden boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.' using errcode='42501';end if;
 if p_hidden is null or p_index is null or p_index<=0 then raise exception 'Wybierz pozycję dokumentu.' using errcode='22023';end if;
 if p_hidden then
  if not exists(select 1 from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i where d.owner_id=auth.uid() and d.ksef_number=p_number and (i->>'index')::integer=p_index) then raise exception 'Nie znaleziono pozycji. Odśwież magazyn.' using errcode='22023';end if;
  insert into public.rs_stock_hidden(owner_id,ksef_number,item_index) values(auth.uid(),p_number,p_index) on conflict do nothing;
 else
  delete from public.rs_stock_hidden where owner_id=auth.uid() and ksef_number=p_number and item_index=p_index;
 end if;
end;$$;
revoke all on function public.rs_ksef_set_hidden(text,integer,boolean) from public,anon;
grant execute on function public.rs_ksef_set_hidden(text,integer,boolean) to authenticated;
