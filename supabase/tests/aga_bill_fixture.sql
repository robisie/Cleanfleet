-- LOCAL DATABASE ONLY: synthetic schema and records for Aga/Bill regression tests.
create role service_role;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.cf_is_admin() returns boolean language sql as $$select false$$;
create table public.user_roles(user_id uuid primary key,role text);
create table public.rs_settings(owner_id uuid primary key,payload jsonb,revision bigint default 1,updated_at timestamptz default now());
create table public.bill_invoices(id uuid primary key,creator_id uuid,payload jsonb,status text default 'draft',number text,revision integer default 1,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.bill_counters(period text primary key,last_number integer);
grant usage on schema public,auth to service_role;
grant all on all tables in schema public to service_role;
insert into user_roles values('10000000-0000-4000-8000-000000000001','admin');
insert into rs_settings(owner_id,payload) values('10000000-0000-4000-8000-000000000001','{"agaAnnual":{"invoices":[],"taxes":[]},"preserveOtherSettings":true}');
insert into bill_invoices(id,creator_id,payload,status,number) values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"buyer":{"name":"AGAR SERWIS synthetic fixture"},"currency":"PLN","brand":"cleanfleet","payment":"transfer","issueDate":"2026-10-01","dueDate":"2026-10-15","lines":[{"name":"Usługi sprzątające","qty":"1","price":"100"}]}','issued','LOCAL/1');

CREATE OR REPLACE FUNCTION public.bill_issue(p_id uuid, p_revision integer)
 RETURNS bill_invoices
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.bill_invoices; n integer; v_period text; issue_date date;
begin
 select * into r from public.bill_invoices where id=p_id for update;
 if not found then raise exception 'Nie znaleziono faktury.'; end if;
 if r.status<>'draft' then return r; end if;
 if r.revision<>p_revision then raise exception 'Faktura zmieniona na innym urządzeniu. Odśwież dane.'; end if;
 issue_date:=(r.payload->>'issueDate')::date;
 if issue_date<>(now() at time zone 'Europe/Warsaw')::date then raise exception 'W trybie online data wystawienia musi być dzisiejsza.'; end if;
 v_period:=to_char(issue_date,'YYYY-MM');
 insert into public.bill_counters(period,last_number) values(v_period,1)
 on conflict(period) do update set last_number=bill_counters.last_number+1 returning last_number into n;
 update public.bill_invoices set number=(case when r.payload->'correction'->>'originalId' is not null then 'KA' else 'A' end)||n||'/'||to_char(issue_date,'MM/YYYY'),status='issued',revision=revision+1,updated_at=now()
 where id=p_id returning * into r;
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.bill_issue_prepared(p_id uuid, p_revision integer, p_payload jsonb)
 RETURNS bill_invoices
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.bill_invoices;
begin
 select * into r from public.bill_invoices where id=p_id for update;
 if not found then raise exception 'Nie znaleziono faktury.';end if;
 if r.status<>'draft' then return r;end if;
 if r.revision<>p_revision then raise exception 'Szkic zmienił się. Odśwież dane.';end if;
 update public.bill_invoices set payload=p_payload where id=p_id;
 return public.bill_issue(p_id,p_revision);
end $function$;

