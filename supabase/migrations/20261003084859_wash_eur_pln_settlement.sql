create table if not exists public.cf_exchange_rates (
 rate_date date not null, rate_time time not null, rate numeric(12,6) not null check(rate>0),
 source text not null, table_ref text, checked_at timestamptz not null,
 primary key(rate_date,rate_time)
);
alter table public.cf_exchange_rates enable row level security;
revoke all on public.cf_exchange_rates from anon,authenticated;
grant select on public.cf_exchange_rates to authenticated;
grant all on public.cf_exchange_rates to service_role;
create policy cf_exchange_rates_read on public.cf_exchange_rates for select to authenticated using(true);
alter table public.wash_records
 add column if not exists paid_at timestamptz,
 add column if not exists pln_rate numeric(12,6),
 add column if not exists pln_rate_date date,
 add column if not exists pln_rate_time time,
 add column if not exists pln_amount numeric(12,2);
create or replace function public.cf_freeze_wash_pln() returns trigger
language plpgsql security invoker set search_path='' as $$
declare quote public.cf_exchange_rates%rowtype;
begin
 if not coalesce(new.paid,false) then
  new.paid_at:=null;new.pln_rate:=null;new.pln_rate_date:=null;new.pln_rate_time:=null;new.pln_amount:=null;
  return new;
 end if;
 if tg_op='UPDATE' and coalesce(old.paid,false) then
  new.paid_at:=old.paid_at;
 else
  -- Restores by the trusted backup service retain the original payment snapshot.
  if current_user not in ('service_role','postgres','supabase_admin') then new.paid_at:=statement_timestamp();
  else new.paid_at:=coalesce(new.paid_at,statement_timestamp());end if;
 end if;
 if coalesce(new.currency,'PLN')<>'EUR' then
  new.pln_rate:=null;new.pln_rate_date:=null;new.pln_rate_time:=null;new.pln_amount:=round(coalesce(new.cost,0),2);
  return new;
 end if;
 if tg_op='UPDATE' and old.paid and old.currency='EUR' and old.pln_rate is not null then
  new.pln_rate:=old.pln_rate;new.pln_rate_date:=old.pln_rate_date;new.pln_rate_time:=old.pln_rate_time;
 elsif not (current_user in ('service_role','postgres','supabase_admin') and new.pln_rate>0 and new.pln_rate_date is not null and new.paid_at is not null) then
  select * into quote from public.cf_exchange_rates order by rate_date desc,rate_time desc limit 1;
  if not found or quote.checked_at<statement_timestamp()-interval '1 hour' then
   raise exception 'Brak aktualnego kursu mBanku. Odśwież dane i ponów oznaczenie płatności.';
  end if;
  new.pln_rate:=quote.rate;new.pln_rate_date:=quote.rate_date;new.pln_rate_time:=quote.rate_time;
 end if;
 new.pln_amount:=round(coalesce(new.cost,0)*new.pln_rate,2);
 return new;
end;$$;
revoke all on function public.cf_freeze_wash_pln() from public,anon,authenticated;
create trigger zz_cf_freeze_wash_pln before insert or update on public.wash_records for each row execute function public.cf_freeze_wash_pln();
