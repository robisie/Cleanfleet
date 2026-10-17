-- Vehicle prices remain exact when Bill supports calculation discounts.
create or replace function public.bill_fleet_on_issue() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.bill_fleet_attachments; linked uuid; cents bigint; cur text; snap jsonb;
begin
 select * into a from public.bill_fleet_attachments where invoice_id=new.id for update;
 if not found then return new; end if;
 if a.cf_invoice_id is not null then return new; end if;
 if exists(select 1 from jsonb_array_elements(new.payload->'lines') l where coalesce((l->>'discount')::numeric,0)<>0) then raise exception 'Kwoty aut nie mogą mieć dodatkowych rabatów ani wyrównań.';end if;
 select sum(round((x->>'cost')::numeric*100)),min(x->>'currency') into cents,cur from jsonb_array_elements(a.snapshot) x;
 if new.payload->'source'->>'fleetId' is distinct from new.id::text or new.payload->'source'->>'id' is distinct from a.company_id::text or new.payload->>'currency' is distinct from cur then raise exception 'Nieprawidłowe powiązanie lub waluta aut.';end if;
 if a.options->>'layout'='vehicle-lines' then
  if new.payload->'source'->>'fleetLayout' is distinct from 'vehicle-lines' or jsonb_array_length(new.payload->'lines')<>jsonb_array_length(a.snapshot) or exists(
   select 1 from jsonb_array_elements(a.snapshot) with ordinality as items(x,ord)
   where (new.payload->'lines'->(ord::integer-1)->>'qty')::numeric<>1
   or round((new.payload->'lines'->(ord::integer-1)->>'price')::numeric*100)<>round((x->>'cost')::numeric*100)
   or right(new.payload->'lines'->(ord::integer-1)->>'name',length(' — '||(x->>'plate'))) is distinct from ' — '||(x->>'plate')
  ) then raise exception 'Każda pozycja musi zawierać tablicę i cenę właściwego auta, z ilością 1.';end if;
 elsif jsonb_array_length(new.payload->'lines')<>1 or (new.payload->'lines'->0->>'qty')::numeric<>1 or round((new.payload->'lines'->0->>'price')::numeric*100)<>cents then raise exception 'Kwota faktury musi odpowiadać wybranym autom. Zmień wybór w CleanFleet.';end if;
 perform id from public.wash_records where id in (select wash_record_id from public.bill_fleet_items where invoice_id=new.id) order by id for update;
 if exists(select 1 from public.invoice_items where wash_record_id in (select wash_record_id from public.bill_fleet_items where invoice_id=new.id)) then raise exception 'Wybrane auto zostało już przypisane do innej faktury.'; end if;
 for snap in select * from jsonb_array_elements(a.snapshot) loop
  if not exists(select 1 from public.wash_records w where w.id=(snap->>'id')::uuid and approved and lower(btrim(performed_by))='michał' and company_id=a.company_id and billing_company_id is not distinct from (snap->>'billing_company_id')::uuid and cost=(snap->>'cost')::numeric and currency=cur and wash_date=(snap->>'wash_date')::date and plate=snap->>'plate') then raise exception 'Dane wybranych aut zmieniły się. Utwórz nowy szkic z aktualnych danych.'; end if;
 end loop;
 insert into public.invoices(user_id,company_id,billing_company_id,invoice_number,invoice_date,period,amount,currency,status)
 values(new.creator_id,a.company_id,a.billing_company_id,new.number,(new.payload->>'issueDate')::date,a.period,cents/100.0,cur,'pending') returning id into linked;
 insert into public.invoice_items(invoice_id,wash_record_id,plate,cost,currency)
 select linked,(x->>'id')::uuid,x->>'plate',(x->>'cost')::numeric,cur from jsonb_array_elements(a.snapshot) x;
 update public.bill_fleet_attachments set cf_invoice_id=linked where invoice_id=new.id;
 return new;
end $$;
