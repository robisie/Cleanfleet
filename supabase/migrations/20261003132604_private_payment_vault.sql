-- Only client-encrypted ciphertext is stored. PIN and bank data never reach Postgres in plaintext.
create table public.cf_payment_vaults (
 user_id uuid primary key references auth.users(id) on delete cascade,
 envelope jsonb not null,
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 constraint cf_payment_envelope_valid check (
   envelope ?& array['version','iterations','salt','iv','ciphertext']
   and envelope->>'version'='1' and envelope->>'iterations'='600000'
   and jsonb_typeof(envelope->'salt')='string' and length(envelope->>'salt')=24
   and jsonb_typeof(envelope->'iv')='string' and length(envelope->>'iv')=16
   and jsonb_typeof(envelope->'ciphertext')='string'
   and length(envelope->>'ciphertext') between 24 and 24000000
 )
);
alter table public.cf_payment_vaults enable row level security;
revoke all on public.cf_payment_vaults from public,anon,authenticated;
grant select,insert,update on public.cf_payment_vaults to authenticated;
create policy cf_payment_select on public.cf_payment_vaults for select to authenticated
 using(user_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy cf_payment_insert on public.cf_payment_vaults for insert to authenticated
 with check(user_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy cf_payment_update on public.cf_payment_vaults for update to authenticated
 using(user_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(user_id=(select auth.uid()) and (select public.cf_is_admin()));

create function public.cf_save_payment_vault(p_envelope jsonb,p_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare next_revision bigint;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_envelope is null or p_revision is null or p_revision<0 then raise exception 'Nieprawidłowe dane zapisu.';end if;
 if p_revision=0 then
   insert into public.cf_payment_vaults(user_id,envelope,revision) values(auth.uid(),p_envelope,1)
   on conflict(user_id) do nothing returning revision into next_revision;
 else
   update public.cf_payment_vaults set envelope=p_envelope,revision=revision+1,updated_at=now()
   where user_id=auth.uid() and revision=p_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'PAYMENT_CONFLICT';end if;
 return next_revision;
end;
$$;
revoke all on function public.cf_save_payment_vault(jsonb,bigint) from public,anon;
grant execute on function public.cf_save_payment_vault(jsonb,bigint) to authenticated;
comment on table public.cf_payment_vaults is 'Separate private payment tool: per-admin AES-GCM ciphertext, PIN-derived key only in browser; excluded from CleanFleet backups.';
