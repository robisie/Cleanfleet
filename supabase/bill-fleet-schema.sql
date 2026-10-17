-- Bill / CleanFleet: immutable vehicle snapshots, service-only drafting and atomic issue.
create table public.bill_fleet_attachments (
 invoice_id uuid primary key references public.bill_invoices(id) on delete cascade,
 company_id uuid not null references public.companies(id),
 billing_company_id uuid references public.billing_companies(id),
 period text not null, snapshot jsonb not null, options jsonb not null default '{}',
 cf_invoice_id uuid unique references public.invoices(id), created_at timestamptz not null default now()
);
create table public.bill_fleet_items (
 wash_record_id uuid primary key references public.wash_records(id),
 invoice_id uuid not null references public.bill_fleet_attachments(invoice_id) on delete cascade
);
create index bill_fleet_items_invoice on public.bill_fleet_items(invoice_id);
alter table public.bill_fleet_attachments enable row level security;
alter table public.bill_fleet_items enable row level security;
revoke all on public.bill_fleet_attachments,public.bill_fleet_items from public,anon,authenticated;
grant all on public.bill_fleet_attachments,public.bill_fleet_items to service_role;

create function public.bill_create_fleet_draft(p_id uuid,p_user uuid,p_company uuid,p_billing uuid,p_period text,p_ids uuid[],p_payload jsonb,p_options jsonb,p_expected bigint)
returns public.bill_invoices language plpgsql security invoker set search_path='' as $$
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
 select jsonb_agg(jsonb_build_object('name',v_service||' — '||(x->>'plate'),'unit','szt.','qty','1','price',to_char(round((x->>'cost')::numeric*100)/100.0,'FM9999999990.00')) order by ord) into v_lines from jsonb_array_elements(rows_json) with ordinality as items(x,ord);
 p_options:=jsonb_build_object('layout','vehicle-lines','includeUnassigned',coalesce((p_options->>'includeUnassigned')::boolean,false),'serviceName',v_service);
 p_payload:=p_payload||jsonb_build_object('brand','cleanfleet','currency',cur,'source',jsonb_build_object('app','cleanfleet','id',p_company,'fleetId',p_id,'fleetLayout','vehicle-lines'),'lines',v_lines,'saleDate',rows_json->-1->>'wash_date');
 insert into public.bill_invoices(id,creator_id,payload) values(p_id,p_user,p_payload) returning * into r;
 insert into public.bill_fleet_attachments(invoice_id,company_id,billing_company_id,period,snapshot,options) values(p_id,p_company,p_billing,p_period,rows_json,p_options);
 insert into public.bill_fleet_items(wash_record_id,invoice_id) select x,p_id from unnest(p_ids) x;
 return r;
end $$;
revoke all on function public.bill_create_fleet_draft(uuid,uuid,uuid,uuid,text,uuid[],jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.bill_create_fleet_draft(uuid,uuid,uuid,uuid,text,uuid[],jsonb,jsonb,bigint) to service_role;

create function public.bill_fleet_on_issue() returns trigger language plpgsql security invoker set search_path='' as $$
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
revoke all on function public.bill_fleet_on_issue() from public,anon,authenticated;
create trigger bill_fleet_on_issue after update of status on public.bill_invoices for each row when(old.status='draft' and new.status='issued') execute function public.bill_fleet_on_issue();
