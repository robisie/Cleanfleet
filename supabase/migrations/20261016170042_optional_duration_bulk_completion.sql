CREATE OR REPLACE FUNCTION public.cf_complete_wash_record(p_wash_record_id uuid, p_wash_date date, p_start_time time without time zone, p_end_time time without time zone, p_performed_by text, p_cost numeric, p_service_ids uuid[], p_completion_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_employee_active boolean := false;
  v_company_id uuid;
  v_services jsonb := '[]'::jsonb;
  v_requested_count integer := 0;
  v_found_count integer := 0;
  v_catalog_total numeric := 0;
  v_duration integer := 0;
begin
  if v_uid is null then
    raise exception 'Brak aktywnej sesji.';
  end if;

  select role
    into v_role
  from public.user_roles
  where user_id = v_uid;

  if v_role = 'cleanfleet_employee' then
    select active
      into v_employee_active
    from public.cf_employee_profiles
    where user_id = v_uid;
    v_employee_active := coalesce(v_employee_active,false);
  end if;

  select company_id
    into v_company_id
  from public.wash_records
  where id = p_wash_record_id
  for update;

  if not found then
    raise exception 'Nie znaleziono wpisu prania.';
  end if;

  if v_role = 'admin' then
    null;
  elsif v_role = 'cleanfleet_employee'
        and v_employee_active
        and exists (
          select 1
          from public.company_users cu
          where cu.user_id = v_uid
            and cu.company_id = v_company_id
            and cu.active = true
            and cu.role = 'cleanfleet_employee'
        ) then
    null;
  else
    raise exception 'Brak uprawnień do zakończenia tego prania.';
  end if;

  if p_wash_date is null then
    raise exception 'Podaj datę prania.';
  end if;
  if (p_start_time is null) <> (p_end_time is null) then
    raise exception 'Uzupełnij obie godziny albo pozostaw obie puste.';
  end if;
  if exists(select 1 from public.wash_records where id=p_wash_record_id and (approved or paid)) then
    raise exception 'Wpis został już wykonany lub opłacony. Odśwież listę.';
  end if;
  if nullif(btrim(coalesce(p_performed_by,'')),'') is null then
    raise exception 'Podaj osobę wykonującą pranie.';
  end if;
  if p_cost is null or p_cost::text in ('NaN','Infinity','-Infinity') or p_cost < 0 then
    raise exception 'Kwota nie może być ujemna.';
  end if;

  select count(distinct x)
    into v_requested_count
  from unnest(coalesce(p_service_ids,'{}'::uuid[])) as x;

  if v_requested_count < 1 then
    raise exception 'Zaznacz co najmniej jeden zakres wykonanych prac.';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'price', s.price
        )
        order by s.sort_order, lower(s.name), s.id
      ),
      '[]'::jsonb
    ),
    count(*),
    coalesce(sum(s.price),0)
  into v_services, v_found_count, v_catalog_total
  from public.cf_service_catalog s
  where s.active = true
    and s.id = any(coalesce(p_service_ids,'{}'::uuid[]));

  if v_found_count <> v_requested_count then
    raise exception 'Co najmniej jedna wybrana usługa jest nieaktywna lub nie istnieje.';
  end if;

  v_duration := null;
  if p_start_time is not null then
    v_duration := floor(extract(epoch from (p_end_time - p_start_time))/60)::integer;
    if v_duration < 0 then v_duration := v_duration + 1440; end if;
    if v_duration <= 0 then raise exception 'Nieprawidłowy czas prania.'; end if;
  end if;

  update public.wash_records
  set wash_date = p_wash_date,
      wash_start_time = p_start_time,
      wash_end_time = p_end_time,
      duration_hours = v_duration::numeric / 60,
      performed_by = btrim(p_performed_by),
      cost = round(p_cost::numeric,2),
      work_items = v_services,
      completion_notes = btrim(coalesce(p_completion_notes,'')),
      approved = true
  where id = p_wash_record_id;

  return jsonb_build_object(
    'ok', true,
    'wash_record_id', p_wash_record_id,
    'duration_minutes', v_duration,
    'catalog_total', round(v_catalog_total,2),
    'saved_cost', round(p_cost::numeric,2),
    'work_items', v_services
  );
end;
$function$
;

-- One transaction for the whole selection: failures roll back washes, earnings and notifications.
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
 if p_cost is null or p_cost::text in ('NaN','Infinity','-Infinity') or p_cost<0 then
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
  -- Keep the established validation, service snapshot and earnings triggers.
  perform public.cf_complete_wash_record(v_id,p_wash_date,
   case when v_count=1 then p_start_time else null end,
   case when v_count=1 then p_end_time else null end,
   p_performed_by,p_cost,p_service_ids,p_completion_notes);
  update public.wash_records set duration_hours=v_hours where id=v_id;
 end loop;
 return jsonb_build_object('ok',true,'completed_count',v_count,
  'duration_hours_per_vehicle',v_hours,'total_duration_hours',v_total_hours);
end;
$$;
revoke all on function public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric) from public,anon;
grant execute on function public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric) to authenticated;
notify pgrst, 'reload schema';

