alter table public.wash_records add column wash_base_cost numeric,add column additional_services jsonb not null default '[]'::jsonb;

create function public.cf_normalize_additional_services(p_items jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; result jsonb:='[]'; v_name text; v_price numeric;
begin
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>20 then raise exception 'Możesz dodać maksymalnie 20 usług dodatkowych.';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  v_name:=btrim(item->>'name');
  if v_name is null or length(v_name) not between 1 and 400 or v_name ~ '[[:cntrl:]]' then raise exception 'Wpisz opis każdej usługi dodatkowej (do 400 znaków).';end if;
  if coalesce(item->>'price','')!~'^[0-9]{1,7}([.][0-9]{1,2})?$' then raise exception 'Nieprawidłowa kwota usługi dodatkowej.';end if;
  v_price:=round((item->>'price')::numeric,2);
  if item ? 'catalog_id' and coalesce(item->>'catalog_id','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'Nieprawidłowa pozycja cennika.';end if;
  result:=result||jsonb_build_array(jsonb_build_object('name',v_name,'price',v_price)||case when item ? 'catalog_id' then jsonb_build_object('catalog_id',item->>'catalog_id') else '{}'::jsonb end);
 end loop;
 return result;
end;$$;
create function public.cf_wash_additional_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare extra numeric;
begin
 new.additional_services:=public.cf_normalize_additional_services(new.additional_services);
 select coalesce(sum((s->>'price')::numeric),0) into extra from jsonb_array_elements(new.additional_services) s;
 if tg_op='UPDATE' and new.cost is distinct from old.cost and new.wash_base_cost is not distinct from old.wash_base_cost and new.additional_services=old.additional_services and new.wash_base_cost is not null then
  new.wash_base_cost:=new.cost-extra;
 end if;
 if new.wash_base_cost is not null or jsonb_array_length(new.additional_services)>0 then
  new.wash_base_cost:=round(coalesce(new.wash_base_cost,new.cost-extra),2);
  if new.wash_base_cost::text in ('NaN','Infinity','-Infinity') or new.wash_base_cost<0 then raise exception 'Kwota prania nie może być ujemna.';end if;
  new.cost:=new.wash_base_cost+extra;
 end if;
 if tg_op='UPDATE' and (new.additional_services is distinct from old.additional_services or new.wash_base_cost is distinct from old.wash_base_cost) and
   (jsonb_array_length(new.additional_services)>0 or jsonb_array_length(old.additional_services)>0) and
   (old.paid or exists(select 1 from public.invoice_items where wash_record_id=old.id) or exists(select 1 from public.bill_fleet_items where wash_record_id=old.id)) then
  raise exception 'To zlecenie jest opłacone lub powiązane z fakturą / szkicem. Najpierw rozwiąż powiązanie z dokumentem.';
 end if;
 return new;
end;$$;
revoke all on function public.cf_wash_additional_guard() from public,anon,authenticated;
create trigger a_cf_wash_additional_guard before insert or update on public.wash_records for each row execute function public.cf_wash_additional_guard();

-- The established completion function still validates access, company, status, hours and catalog.
-- Set the complete amount before approving, so existing earnings and payment triggers see it once.
create function public.cf_complete_wash_with_extras(
 p_wash_record_ids uuid[],p_wash_date date,p_start_time time,p_end_time time,p_performed_by text,
 p_cost numeric,p_service_ids uuid[],p_completion_notes text,p_duration_hours numeric,
 p_condition_level smallint,p_condition_factors text[],p_additional_services jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare extra_items jsonb; extra numeric; result jsonb; v_id uuid; role_name text;
begin
 if auth.uid() is null then raise exception 'Brak aktywnej sesji.';end if;
 select role into role_name from public.user_roles where user_id=auth.uid();
 if role_name is null or role_name not in ('admin','cleanfleet_employee') then raise exception 'Brak uprawnień do zakończenia prania.';end if;
 extra_items:=public.cf_normalize_additional_services(p_additional_services);
 if jsonb_array_length(extra_items)>0 and cardinality(p_wash_record_ids)<>1 then raise exception 'Usługi dodatkowe dodawaj osobno do konkretnego pojazdu.';end if;
 select coalesce(sum((x->>'price')::numeric),0) into extra from jsonb_array_elements(extra_items) x;
 if cardinality(p_wash_record_ids)=1 then
  v_id:=p_wash_record_ids[1];
  perform id from public.wash_records where id=v_id for update;
  update public.wash_records set wash_base_cost=p_cost,additional_services=extra_items where id=v_id;
 end if;
 result:=public.cf_complete_wash_records(p_wash_record_ids,p_wash_date,p_start_time,p_end_time,p_performed_by,
  case when cardinality(p_wash_record_ids)=1 then p_cost+extra else p_cost end,p_service_ids,p_completion_notes,p_duration_hours,p_condition_level,p_condition_factors);
 return result||jsonb_build_object('wash_base_cost',p_cost,'additional_services',extra_items);
end;$$;
revoke all on function public.cf_normalize_additional_services(jsonb),public.cf_complete_wash_with_extras(uuid[],date,time,time,text,numeric,uuid[],text,numeric,smallint,text[],jsonb) from public,anon;
grant execute on function public.cf_normalize_additional_services(jsonb),public.cf_complete_wash_with_extras(uuid[],date,time,time,text,numeric,uuid[],text,numeric,smallint,text[],jsonb) to authenticated;

-- Only service-side billing may use the invoice expansion helper.
create function public.bill_fleet_lines(p_snapshot jsonb,p_service text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare vehicle jsonb; item jsonb; result jsonb:='[]'; base numeric;
begin
 for vehicle in select value from jsonb_array_elements(p_snapshot) loop
  base:=coalesce(nullif(vehicle->>'wash_base_cost','')::numeric,(vehicle->>'cost')::numeric);
  result:=result||jsonb_build_array(jsonb_build_object('name',p_service||' — '||(vehicle->>'plate'),'unit','szt.','qty','1','price',to_char(base,'FM9999999990.00')));
  for item in select value from jsonb_array_elements(coalesce(vehicle->'additional_services','[]'::jsonb)) loop
   result:=result||jsonb_build_array(jsonb_build_object('name','Usługa dodatkowa — '||(item->>'name'),'unit','szt.','qty','1','price',to_char((item->>'price')::numeric,'FM9999999990.00')));
  end loop;
 end loop;
 return result;
end;$$;
revoke all on function public.bill_fleet_lines(jsonb,text) from public,anon,authenticated;
grant execute on function public.bill_fleet_lines(jsonb,text) to service_role;

create function public.bill_fleet_lines_valid(p_lines jsonb,p_snapshot jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare vehicle jsonb; item jsonb; line jsonb; n integer:=0; base numeric; suffix text;
begin
 if jsonb_typeof(p_lines) is distinct from 'array' then return false;end if;
 for vehicle in select value from jsonb_array_elements(p_snapshot) loop
  line:=p_lines->n;n:=n+1;suffix:=' — '||(vehicle->>'plate');
  base:=coalesce(nullif(vehicle->>'wash_base_cost','')::numeric,(vehicle->>'cost')::numeric);
  if (line->>'qty')::numeric is distinct from 1 or round((line->>'price')::numeric,2) is distinct from base
    or right(line->>'name',length(suffix)) is distinct from suffix or length(coalesce(line->>'name',''))<=length(suffix) then return false;end if;
  for item in select value from jsonb_array_elements(coalesce(vehicle->'additional_services','[]'::jsonb)) loop
   line:=p_lines->n;n:=n+1;
   if (line->>'qty')::numeric is distinct from 1 or round((line->>'price')::numeric,2) is distinct from (item->>'price')::numeric or line->>'name' is distinct from 'Usługa dodatkowa — '||(item->>'name') then return false;end if;
  end loop;
 end loop;
 return jsonb_array_length(p_lines)=n;
end;$$;
revoke all on function public.bill_fleet_lines_valid(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bill_fleet_lines_valid(jsonb,jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.bill_create_fleet_draft(p_id uuid, p_user uuid, p_company uuid, p_billing uuid, p_period text, p_ids uuid[], p_payload jsonb, p_options jsonb, p_expected bigint)
 RETURNS bill_invoices
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.bill_invoices; rows_json jsonb; cents bigint; cur text; count_rows integer; currency_count integer; v_service text; v_lines jsonb;
begin
 if not exists(select 1 from public.user_roles where user_id=p_user and role='admin') then raise exception 'Brak uprawnień administratora.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.bill_invoices where id=p_id;
 if found then
  if r.creator_id<>p_user or not exists(select 1 from public.bill_fleet_attachments where invoice_id=p_id and company_id=p_company) then raise exception 'Nieprawidłowe powiązanie szkicu.'; end if;
  return r;
 end if;
 if cardinality(p_ids) not between 1 and 200 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Wybierz od 1 do 200 różnych wpisów.'; end if;
 if p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Nieprawidłowy miesiąc.'; end if;
 if not exists(select 1 from public.companies where id=p_company and active) then raise exception 'Nieaktywna firma.'; end if;
 if p_billing is not null and not exists(select 1 from public.billing_companies where id=p_billing and company_id=p_company and active) then raise exception 'Spółka nie należy do wybranej firmy.'; end if;
 perform id from public.wash_records where id=any(p_ids) order by id for update;
 if exists(select 1 from public.invoice_items where wash_record_id=any(p_ids)) or exists(select 1 from public.bill_fleet_items where wash_record_id=any(p_ids)) then raise exception 'Co najmniej jeden wpis ma już fakturę lub szkic w Bill. Otwórz istniejący dokument.'; end if;
 select count(*),count(distinct currency),min(currency),sum(round(cost*100)),jsonb_agg(to_jsonb(w) order by wash_date,id)
 into count_rows,currency_count,cur,cents,rows_json from public.wash_records w
 where id=any(p_ids) and company_id=p_company and (billing_company_id is not distinct from p_billing or (p_billing is not null and coalesce((p_options->>'includeUnassigned')::boolean,false) and billing_company_id is null))
 and approved and wash_date is not null and to_char(wash_date,'YYYY-MM')=p_period
 and lower(btrim(performed_by))='michał' and cost>=0 and currency in ('PLN','EUR');
 if count_rows<>cardinality(p_ids) then raise exception 'Lista aut zmieniła się. Wybierz zatwierdzone prania Michała z tej samej firmy, spółki i miesiąca.'; end if;
 if currency_count<>1 or cents<=0 or cents<>p_expected then raise exception 'Kwota lub waluta aut zmieniła się. Odśwież dane i wybierz auta ponownie.'; end if;
 if p_billing is not null and cur<>(select currency from public.billing_companies where id=p_billing) then raise exception 'Waluta aut nie zgadza się ze spółką.'; end if;
 v_service:=btrim(p_payload->'lines'->0->>'name');
 if v_service is null or length(v_service) not between 1 and 400 then raise exception 'Podaj nazwę usługi (do 400 znaków).';end if;
 v_lines:=public.bill_fleet_lines(rows_json,v_service);
 if jsonb_array_length(v_lines)>200 then raise exception 'Faktura wraz z usługami dodatkowymi przekracza 200 pozycji. Wybierz mniej pojazdów.';end if;
 p_options:=jsonb_build_object('layout','vehicle-lines','includeUnassigned',coalesce((p_options->>'includeUnassigned')::boolean,false),'serviceName',v_service);
 p_payload:=p_payload||jsonb_build_object('brand','cleanfleet','currency',cur,'source',jsonb_build_object('app','cleanfleet','id',p_company,'fleetId',p_id,'fleetLayout','vehicle-lines'),'lines',v_lines,'saleDate',rows_json->-1->>'wash_date');
 insert into public.bill_invoices(id,creator_id,payload) values(p_id,p_user,p_payload) returning * into r;
 insert into public.bill_fleet_attachments(invoice_id,company_id,billing_company_id,period,snapshot,options) values(p_id,p_company,p_billing,p_period,rows_json,p_options);
 insert into public.bill_fleet_items(wash_record_id,invoice_id) select x,p_id from unnest(p_ids) x;
 return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.bill_fleet_on_issue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.bill_fleet_attachments; linked uuid; cents bigint; cur text; snap jsonb;
begin
 select * into a from public.bill_fleet_attachments where invoice_id=new.id for update;
 if not found then return new; end if;
 if a.cf_invoice_id is not null then return new; end if;
 if coalesce(nullif(new.payload->>'documentType',''),'standard')<>'standard' or nullif(new.payload->'correction','null'::jsonb) is not null then
  raise exception 'Wybrane auta można rozliczyć tylko zwykłą fakturą.';
 end if;
 if coalesce(nullif(btrim(replace(new.payload->>'globalDiscount',',','.')),''),'0')::numeric<>0
    or exists(select 1 from jsonb_array_elements(new.payload->'lines') l where coalesce((l->>'discount')::numeric,0)<>0) then
  raise exception 'Kwoty aut nie mogą mieć dodatkowych rabatów ani wyrównań.';
 end if;
 select sum(round((x->>'cost')::numeric*100)),min(x->>'currency') into cents,cur from jsonb_array_elements(a.snapshot) x;
 if new.payload->'source'->>'fleetId' is distinct from new.id::text or new.payload->'source'->>'id' is distinct from a.company_id::text or new.payload->>'currency' is distinct from cur then raise exception 'Nieprawidłowe powiązanie lub waluta aut.';end if;
 if a.options->>'layout'='vehicle-lines' then
  if new.payload->'source'->>'fleetLayout' is distinct from 'vehicle-lines' or not public.bill_fleet_lines_valid(new.payload->'lines',a.snapshot) then raise exception 'Pozycje prania i usług dodatkowych muszą odpowiadać wybranym pojazdom.';end if;
 elsif jsonb_array_length(new.payload->'lines') is distinct from 1 or (new.payload->'lines'->0->>'qty')::numeric is distinct from 1 or round((new.payload->'lines'->0->>'price')::numeric*100) is distinct from cents then raise exception 'Kwota faktury musi odpowiadać wybranym autom. Zmień wybór w CleanFleet.';end if;
 if (select sum(round((l->>'price')::numeric*(l->>'qty')::numeric*100))
     from jsonb_array_elements(new.payload->'lines') l) is distinct from cents then
  raise exception 'Kwota faktury musi odpowiadać wybranym autom. Zmień wybór w CleanFleet.';
 end if;
 perform id from public.wash_records where id in (select wash_record_id from public.bill_fleet_items where invoice_id=new.id) order by id for update;
 if exists(select 1 from public.invoice_items where wash_record_id in (select wash_record_id from public.bill_fleet_items where invoice_id=new.id)) then raise exception 'Wybrane auto zostało już przypisane do innej faktury.'; end if;
 for snap in select * from jsonb_array_elements(a.snapshot) loop
  if not exists(select 1 from public.wash_records w where w.id=(snap->>'id')::uuid and approved and lower(btrim(performed_by))='michał' and company_id=a.company_id and billing_company_id is not distinct from (snap->>'billing_company_id')::uuid and cost=(snap->>'cost')::numeric and currency=cur and wash_date=(snap->>'wash_date')::date and plate=snap->>'plate' and (not(snap ? 'additional_services') or (w.additional_services=coalesce(snap->'additional_services','[]'::jsonb) and w.wash_base_cost is not distinct from nullif(snap->>'wash_base_cost','')::numeric))) then raise exception 'Dane wybranych aut zmieniły się. Utwórz nowy szkic z aktualnych danych.'; end if;
 end loop;
 insert into public.invoices(user_id,company_id,billing_company_id,invoice_number,invoice_date,period,amount,currency,status)
 values(new.creator_id,a.company_id,a.billing_company_id,new.number,(new.payload->>'issueDate')::date,a.period,cents/100.0,cur,'pending') returning id into linked;
 insert into public.invoice_items(invoice_id,wash_record_id,plate,cost,currency)
 select linked,(x->>'id')::uuid,x->>'plate',(x->>'cost')::numeric,cur from jsonb_array_elements(a.snapshot) x;
 update public.bill_fleet_attachments set cf_invoice_id=linked where invoice_id=new.id;
 return new;
end $function$
;

notify pgrst,'reload schema';
CREATE OR REPLACE FUNCTION public.cf_review_change_request(p_request_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.wash_change_requests%ROWTYPE;
  v_result JSONB;
BEGIN

  -- Tylko administrator
  IF NOT public.cf_is_admin() THEN
    RAISE EXCEPTION 'Tylko administrator może rozpatrywać wnioski.';
  END IF;

  -- Dozwolone decyzje
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Nieprawidłowa decyzja.';
  END IF;

  -- Pobierz wniosek i zablokuj go na czas operacji
  SELECT *
  INTO v_req
  FROM public.wash_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znaleziono wniosku.';
  END IF;

  -- Wniosek musi być jeszcze oczekujący
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Ten wniosek został już rozpatrzony.';
  END IF;

  -- ==========================================
  -- AKCEPTACJA
  -- ==========================================
  IF p_decision = 'approved' THEN

    -- ------------------------------------------
    -- ZMIANA WPISU
    -- ------------------------------------------
    IF v_req.request_type = 'edit' THEN

      UPDATE public.wash_records
      SET
        additional_services = CASE WHEN v_req.proposed_data ? 'additional_services' THEN public.cf_normalize_additional_services(v_req.proposed_data->'additional_services') ELSE additional_services END,
        wash_base_cost = CASE WHEN v_req.proposed_data ? 'wash_base_cost' THEN nullif(v_req.proposed_data->>'wash_base_cost','')::numeric ELSE wash_base_cost END,
        plate = CASE
          WHEN v_req.proposed_data ? 'tablica'
          THEN v_req.proposed_data->>'tablica'
          ELSE plate
        END,

        type = CASE
          WHEN v_req.proposed_data ? 'typ'
          THEN v_req.proposed_data->>'typ'
          ELSE type
        END,

        brand = CASE
          WHEN v_req.proposed_data ? 'marka'
          THEN v_req.proposed_data->>'marka'
          ELSE brand
        END,

        billing_category = CASE
          WHEN v_req.proposed_data ? 'billing_category'
          THEN v_req.proposed_data->>'billing_category'
          ELSE billing_category
        END,

        ordered = CASE
          WHEN v_req.proposed_data ? 'zlecone'
          THEN (v_req.proposed_data->>'zlecone')::boolean
          ELSE ordered
        END,

        ordered_by = CASE
          WHEN v_req.proposed_data ? 'kto_zlecil'
          THEN v_req.proposed_data->>'kto_zlecil'
          ELSE ordered_by
        END,

        order_date = CASE
          WHEN v_req.proposed_data ? 'data_zlecenia'
               AND NULLIF(v_req.proposed_data->>'data_zlecenia', '') IS NOT NULL
          THEN (v_req.proposed_data->>'data_zlecenia')::date
          WHEN v_req.proposed_data ? 'data_zlecenia'
               AND NULLIF(v_req.proposed_data->>'data_zlecenia', '') IS NULL
          THEN NULL
          ELSE order_date
        END,

        order_due_date = CASE
          WHEN v_req.proposed_data ? 'data_zlecenia_do'
               AND NULLIF(v_req.proposed_data->>'data_zlecenia_do', '') IS NOT NULL
          THEN (v_req.proposed_data->>'data_zlecenia_do')::date
          WHEN v_req.proposed_data ? 'data_zlecenia_do'
               AND NULLIF(v_req.proposed_data->>'data_zlecenia_do', '') IS NULL
          THEN NULL
          ELSE order_due_date
        END,

        notes = CASE
          WHEN v_req.proposed_data ? 'uwagi'
          THEN v_req.proposed_data->>'uwagi'
          ELSE notes
        END,

        wash_date = CASE
          WHEN v_req.proposed_data ? 'data_prania'
               AND NULLIF(v_req.proposed_data->>'data_prania', '') IS NOT NULL
          THEN (v_req.proposed_data->>'data_prania')::date
          WHEN v_req.proposed_data ? 'data_prania'
               AND NULLIF(v_req.proposed_data->>'data_prania', '') IS NULL
          THEN NULL
          ELSE wash_date
        END,

        performed_by = CASE
          WHEN v_req.proposed_data ? 'kto_wykonal'
          THEN v_req.proposed_data->>'kto_wykonal'
          ELSE performed_by
        END,

        cost = CASE
          WHEN v_req.proposed_data ? 'koszt'
               AND NULLIF(v_req.proposed_data->>'koszt', '') IS NOT NULL
          THEN (v_req.proposed_data->>'koszt')::numeric
          WHEN v_req.proposed_data ? 'koszt'
               AND NULLIF(v_req.proposed_data->>'koszt', '') IS NULL
          THEN NULL
          ELSE cost
        END

      WHERE id = v_req.wash_record_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Nie znaleziono wpisu, którego dotyczy wniosek.';
      END IF;

    -- ------------------------------------------
    -- ANULOWANIE WPISU
    -- ------------------------------------------
    ELSIF v_req.request_type = 'cancel' THEN

      DELETE FROM public.wash_records
      WHERE id = v_req.wash_record_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Nie znaleziono wpisu, którego dotyczy anulowanie.';
      END IF;

    ELSE
      RAISE EXCEPTION 'Nieobsługiwany typ wniosku.';
    END IF;

  END IF;

  -- ==========================================
  -- ZMIEŃ STATUS WNIOSKU
  -- ==========================================

  UPDATE public.wash_change_requests
  SET status = p_decision
  WHERE id = v_req.id;

  -- ==========================================
  -- ZWRÓĆ WYNIK
  -- ==========================================

  v_result := jsonb_build_object(
    'request_id', v_req.id,
    'status', p_decision,
    'request_type', v_req.request_type,
    'wash_record_id', v_req.wash_record_id
  );

  RETURN v_result;

END;
$function$

;

