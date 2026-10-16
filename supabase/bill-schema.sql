-- Bill 1.0.0. Server-owned invoice lifecycle, one shared monthly sequence.
create table public.bill_parties (
 id uuid primary key default gen_random_uuid(), payload jsonb not null,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create unique index bill_parties_nip on public.bill_parties ((payload->>'nip')) where coalesce(payload->>'nip','')<>'';
create table public.bill_counters (
 period text primary key check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 last_number integer not null check(last_number>=0)
);
insert into public.bill_counters values ('2026-10',2);
create table public.bill_settings (
 id boolean primary key default true check(id),payload jsonb not null default '{"bank":""}'::jsonb
);
insert into public.bill_settings(id) values(true);
create table public.bill_invoices (
 id uuid primary key, creator_id uuid not null references auth.users(id),
 number text unique, payload jsonb not null, revision integer not null default 1,
 status text not null default 'draft' check(status in ('draft','issued','sending','pending','accepted','rejected','uncertain')),
 send_attempt uuid, xml text, ksef_number text, ksef_session text, ksef_reference text, ksef_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index bill_invoices_date on public.bill_invoices (created_at desc);
create table public.bill_ksef_state (
 invoice_id uuid primary key references public.bill_invoices(id), encrypted_state text not null
);
-- No browser writes, including status, XML, counter and KSeF metadata.
alter table public.bill_parties enable row level security;
alter table public.bill_counters enable row level security;
alter table public.bill_settings enable row level security;
alter table public.bill_invoices enable row level security;
alter table public.bill_ksef_state enable row level security;
revoke all on public.bill_parties,public.bill_counters,public.bill_settings,public.bill_invoices,public.bill_ksef_state from public,anon,authenticated;
grant all on public.bill_parties,public.bill_counters,public.bill_settings,public.bill_invoices,public.bill_ksef_state to service_role;
create function public.bill_issue(p_id uuid,p_revision integer)
returns public.bill_invoices language plpgsql security invoker set search_path='' as $$
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
 update public.bill_invoices set number='A'||n||'/'||to_char(issue_date,'MM/YYYY'),status='issued',revision=revision+1,updated_at=now()
 where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.bill_issue(uuid,integer) from public,anon,authenticated;
grant execute on function public.bill_issue(uuid,integer) to service_role;
