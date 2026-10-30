-- A completed purchase-history cursor belongs to the admin, not one browser.
create table public.rs_ksef_history_checkpoints (
 owner_id uuid primary key references auth.users(id),
 checked_through date not null,
 checked_at timestamptz not null default now()
);
alter table public.rs_ksef_history_checkpoints enable row level security;
create policy rs_ksef_history_owner on public.rs_ksef_history_checkpoints for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
revoke all on public.rs_ksef_history_checkpoints from public,anon,authenticated;
grant select,insert,update on public.rs_ksef_history_checkpoints to authenticated;

create function public.rs_ksef_history_state() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return (select jsonb_build_object('to',checked_through,'checkedAt',floor(extract(epoch from checked_at)*1000))
  from public.rs_ksef_history_checkpoints where owner_id=auth.uid());
end;$$;
create function public.rs_ksef_mark_history(p_to date) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_to is null or p_to<date '2026-01-01' or p_to>(now() at time zone 'Europe/Warsaw')::date then raise exception 'Nieprawidłowy koniec synchronizacji.';end if;
 insert into public.rs_ksef_history_checkpoints(owner_id,checked_through,checked_at) values(auth.uid(),p_to,now())
 on conflict(owner_id) do update set checked_through=excluded.checked_through,checked_at=excluded.checked_at
 where excluded.checked_through>=rs_ksef_history_checkpoints.checked_through;
end;$$;
revoke all on function public.rs_ksef_history_state(),public.rs_ksef_mark_history(date) from public,anon;
grant execute on function public.rs_ksef_history_state(),public.rs_ksef_mark_history(date) to authenticated;

-- Do not rewrite every old document on every overlap scan. A changed content hash
-- invalidates parsed rows/references; stable hashes preserve the verified preview.
create or replace function public.rs_ksef_store_metadata(p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1250 then raise exception 'Nieprawidłowa lista faktur.';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or coalesce(r->>'ksefNumber','')!~*'^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$'
   or r#>>'{buyer,identifier,value}' is distinct from '6351861297'
   or r#>>'{seller,nip}' is distinct from left(r->>'ksefNumber',10) then raise exception 'Nieprawidłowa faktura zakupowa.';end if;
  if jsonb_typeof(r->'invoiceType')='string' then r:=jsonb_set(r,'{invoiceType}',to_jsonb(upper(r->>'invoiceType')));end if;
  insert into public.rs_ksef_documents(owner_id,ksef_number,metadata) values(auth.uid(),r->>'ksefNumber',r)
  on conflict(owner_id,ksef_number) do update set metadata=excluded.metadata,
   preview=case when rs_ksef_documents.metadata->>'invoiceHash' is distinct from excluded.metadata->>'invoiceHash' then null else rs_ksef_documents.preview end,
   refs=case when rs_ksef_documents.metadata->>'invoiceHash' is distinct from excluded.metadata->>'invoiceHash' then '[]'::jsonb else rs_ksef_documents.refs end
  where rs_ksef_documents.metadata is distinct from excluded.metadata;
 end loop;
end;$$;
