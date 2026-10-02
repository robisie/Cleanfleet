alter table public.wash_records add column if not exists duration_hours numeric;
alter table public.wash_records add constraint wash_duration_hours_valid check (duration_hours is null or (duration_hours > 0 and duration_hours <= 168));
comment on column public.wash_records.duration_hours is 'Czas trwania w godzinach, bez ustalania godzin rozpoczęcia i zakończenia.';
create or replace function public.cf_import_wash_sheet(p_company_id uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  item jsonb; v public.vehicles%rowtype; w public.wash_records%rowtype;
  result jsonb := '[]'::jsonb; key text; d date; h numeric; amount numeric; target uuid; cur text; n integer;
begin
  if auth.uid() is null or not public.cf_is_admin() then raise exception 'Import dostępny tylko dla administratora.'; end if;
  if p_company_id is null then raise exception 'Wybierz firmę.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>100 then raise exception 'Wybierz od 1 do 100 prań.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wash-sheet:'||p_company_id::text,0));
  for item in select value from jsonb_array_elements(p_rows) loop
    key := regexp_replace(upper(coalesce(item->>'plate','')),'[^A-Z0-9]','','g');
    select count(*) into n from public.vehicles where company_id=p_company_id and regexp_replace(upper(plate),'[^A-Z0-9]','','g')=key;
    if n<>1 then raise exception 'Nie znaleziono jednoznacznie pojazdu: %',key; end if;
    select * into v from public.vehicles where company_id=p_company_id and regexp_replace(upper(plate),'[^A-Z0-9]','','g')=key;
    if coalesce(item->>'wash_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Nieprawidłowa data: %',key; end if;
    d := (item->>'wash_date')::date; h := (item->>'duration_hours')::numeric; amount := (item->>'cost')::numeric;
    if h is null or h<=0 or h>168 or h::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowy czas: %',key; end if;
    if amount is null or amount<0 or amount>1000000 or amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowa cena: %',key; end if;
    if exists(select 1 from public.wash_records where company_id=p_company_id and regexp_replace(upper(plate),'[^A-Z0-9]','','g')=key and wash_date=d) then raise exception 'Pranie % z dnia % już istnieje. Żadne dane nie zostały zapisane.',key,d; end if;
    cur := coalesce((select currency from public.billing_companies where id=v.billing_company_id and company_id=p_company_id),v.currency,'PLN');
    target := nullif(item->>'target_id','')::uuid;
    if target is not null then
      select * into w from public.wash_records where id=target and company_id=p_company_id for update;
      if not found or regexp_replace(upper(w.plate),'[^A-Z0-9]','','g')<>key or w.wash_date is not null or w.approved or w.paid then raise exception 'Wpis % zmienił się. Odśwież listę.',key; end if;
      update public.wash_records set wash_date=d,duration_hours=h,wash_start_time=null,wash_end_time=null,cost=round(amount,2),approved=true,paid=false,billing_company_id=v.billing_company_id,currency=cur where id=target;
    else
      if exists(select 1 from public.wash_records where company_id=p_company_id and regexp_replace(upper(plate),'[^A-Z0-9]','','g')=key and wash_date is null and not approved and not paid) then raise exception 'Wybierz istniejący wpis do zakończenia dla %.',key; end if;
      insert into public.wash_records(company_id,plate,type,brand,wash_date,duration_hours,cost,approved,paid,billing_company_id,currency,created_by)
      values(p_company_id,v.plate,v.type,v.brand,d,h,round(amount,2),false,false,v.billing_company_id,cur,auth.uid()) returning id into target;
      update public.wash_records set approved=true where id=target;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('id',target,'plate',v.plate,'duration_hours',h));
  end loop;
  return jsonb_build_object('ok',true,'rows',result);
end $$;
revoke all on function public.cf_import_wash_sheet(uuid,jsonb) from public,anon;
grant execute on function public.cf_import_wash_sheet(uuid,jsonb) to authenticated;
