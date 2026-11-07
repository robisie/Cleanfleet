-- Preserve the price agreed at order creation independently from the amount billed.
alter table public.wash_records
  add column order_cost numeric,
  add column order_currency text,
  add constraint wash_records_order_price_pair
    check ((order_cost is null) = (order_currency is null));

-- Open orders still carry the agreed amount in cost. Completed historical
-- records have no trustworthy original amount and retain NULL.
update public.wash_records
set order_cost=cost, order_currency=currency
where not approved and not paid;

create function private.cf_preserve_wash_order_price()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='UPDATE' then
    if old.order_cost is not null then
      new.order_cost:=old.order_cost;
      new.order_currency:=old.order_currency;
    end if;
  elsif not new.approved and not new.paid and new.order_cost is null then
    new.order_cost:=new.cost;
    new.order_currency:=new.currency;
  end if;
  return new;
end;
$$;

revoke all on function private.cf_preserve_wash_order_price() from public, anon, authenticated;
create trigger zz_cf_capture_wash_order_price
before insert or update of order_cost, order_currency on public.wash_records
for each row execute function private.cf_preserve_wash_order_price();

create or replace function public.cf_complete_wash_records(
 p_wash_record_ids uuid[], p_wash_date date,
 p_start_time time, p_end_time time, p_performed_by text,
 p_cost numeric, p_service_ids uuid[], p_completion_notes text,
 p_duration_hours numeric default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_ids uuid[];
 v_id uuid;
 v_count integer;
 v_total_hours numeric := p_duration_hours;
 v_hours numeric;
 v_cost numeric;
 v_cost_by_id jsonb := jsonb_build_object();
 v_row public.wash_records%rowtype;
 v_company uuid;
 v_currency text;
 v_role text;
begin
 if auth.uid() is null then raise exception 'Brak aktywnej sesji.'; end if;
 select role into v_role from public.user_roles where user_id=auth.uid();
 if v_role is null or v_role not in ('admin','cleanfleet_employee') then
  raise exception 'Brak uprawnień do zakończenia prania.';
 end if;
 select array_agg(distinct x order by x) into v_ids
 from unnest(p_wash_record_ids) as x where x is not null;
 v_count:=coalesce(cardinality(v_ids),0);
 if v_count=0 then raise exception 'Zaznacz co najmniej jeden wpis.'; end if;
 if (p_start_time is null) <> (p_end_time is null) then
  raise exception 'Uzupełnij obie godziny albo pozostaw obie puste.';
 end if;
 if p_duration_hours is not null and p_start_time is not null then
  raise exception 'Wybierz godziny od–do albo czas trwania.';
 end if;
 if p_start_time is not null then
  v_total_hours:=extract(epoch from (p_end_time-p_start_time))/3600;
  if v_total_hours<0 then v_total_hours:=v_total_hours+24; end if;
 end if;
 if v_total_hours is not null and
    (v_total_hours::text in ('NaN','Infinity','-Infinity') or v_total_hours<=0 or v_total_hours>168) then
  raise exception 'Nieprawidłowy czas prania (maksymalnie 168 godzin).';
 end if;
 if (p_cost is null and v_count=1) or p_cost::text in ('NaN','Infinity','-Infinity') or p_cost<0 then
  raise exception 'Podaj poprawną kwotę.';
 end if;
 v_hours:=v_total_hours/v_count;
 -- Lock in a stable order, authorize every row and reject a stale selection.
 foreach v_id in array v_ids loop
  select * into v_row from public.wash_records where id=v_id for update;
  if not found then raise exception 'Nie znaleziono jednego z zaznaczonych wpisów.'; end if;
  if v_role<>'admin' and not exists(
   select 1 from public.cf_employee_profiles ep
   join public.company_users cu on cu.user_id=ep.user_id
   where ep.user_id=auth.uid() and ep.active and cu.active
    and cu.company_id=v_row.company_id and cu.role='cleanfleet_employee'
  ) then raise exception 'Brak uprawnień do zakończenia tego prania.'; end if;
  if v_row.approved or v_row.paid then
   raise exception 'Wpis został już wykonany lub opłacony. Odśwież listę.';
  end if;
  if v_company is not null and v_company is distinct from v_row.company_id then
   raise exception 'Wybierz wpisy jednej firmy.';
  end if;
  if v_currency is not null and v_currency is distinct from v_row.currency then
   raise exception 'Wybierz wpisy w tej samej walucie.';
  end if;
  v_company:=v_row.company_id;
  v_currency:=v_row.currency;
 end loop;
 foreach v_id in array v_ids loop
  -- A blank bulk price keeps the amount of each order, under the same row locks.
  select coalesce(p_cost, case when order_currency=currency then order_cost end, cost)
    into v_cost from public.wash_records where id=v_id;
  v_cost:=round(v_cost,2);
  -- Keep the established validation, service snapshot and earnings triggers.
  perform public.cf_complete_wash_record(v_id,p_wash_date,
   case when v_count=1 then p_start_time else null end,
   case when v_count=1 then p_end_time else null end,
   p_performed_by,v_cost,p_service_ids,p_completion_notes);
  update public.wash_records set duration_hours=v_hours where id=v_id;
  v_cost_by_id:=v_cost_by_id || jsonb_build_object(v_id::text,v_cost);
 end loop;
 return jsonb_build_object('ok',true,'completed_count',v_count,
  'duration_hours_per_vehicle',v_hours,'total_duration_hours',v_total_hours,'cost_by_id',v_cost_by_id);
end;
$$;
revoke all on function public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric) from public,anon;
grant execute on function public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric) to authenticated;
notify pgrst, 'reload schema';
