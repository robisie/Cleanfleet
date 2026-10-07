-- Robisię 1.0.0. Independent admin-only project workspace.
create table public.rs_number_counters (
 year integer primary key check(year between 2000 and 9999),
 last_number integer not null check(last_number > 0)
);
create table public.rs_projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 contract_number text not null unique,
 year integer not null,
 month integer not null check(month between 1 and 12),
 serial integer not null,
 payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
 revision bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(year,serial)
);
create index rs_projects_owner on public.rs_projects(owner_id,created_at desc);
create table public.rs_settings (
 owner_id uuid primary key default auth.uid() references auth.users(id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.rs_number_counters enable row level security;
alter table public.rs_projects enable row level security;
alter table public.rs_settings enable row level security;
revoke all on public.rs_number_counters,public.rs_projects,public.rs_settings from public,anon,authenticated;
grant select,insert,update on public.rs_number_counters to authenticated;
grant select,insert on public.rs_projects to authenticated;
grant update(payload,revision,updated_at) on public.rs_projects to authenticated;
grant select,insert,update on public.rs_settings to authenticated;
create policy rs_counters_admin on public.rs_number_counters for all to authenticated
 using((select public.cf_is_admin())) with check((select public.cf_is_admin()));
create policy rs_projects_read on public.rs_projects for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy rs_projects_insert on public.rs_projects for insert to authenticated
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy rs_projects_update on public.rs_projects for update to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy rs_settings_admin on public.rs_settings for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create function public.rs_create_project(p_payload jsonb,p_date date default current_date)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare v_year integer; v_month integer; v_serial integer; v_row public.rs_projects;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_date is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Nieprawidłowe dane inwestycji.'; end if;
 v_year:=extract(year from p_date);v_month:=extract(month from p_date);
 insert into public.rs_number_counters(year,last_number) values(v_year,1)
 on conflict(year) do update set last_number=rs_number_counters.last_number+1
 returning last_number into v_serial;
 insert into public.rs_projects(contract_number,year,month,serial,payload)
 values('UUR-RS/'||v_year||'/'||lpad(v_month::text,2,'0')||'/'||case when v_serial<1000 then lpad(v_serial::text,3,'0') else v_serial::text end,v_year,v_month,v_serial,p_payload)
 returning * into v_row;
 return v_row;
end;$$;
create function public.rs_save_project(p_id uuid,p_payload jsonb,p_revision bigint)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare v_row public.rs_projects;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 update public.rs_projects set payload=p_payload,revision=revision+1,updated_at=now()
 where id=p_id and owner_id=auth.uid() and revision=p_revision returning * into v_row;
 if v_row.id is null then raise exception 'RS_CONFLICT: Dane zmieniły się na innym urządzeniu. Odśwież widok.'; end if;
 return v_row;
end;$$;
create function public.rs_save_settings(p_payload jsonb,p_revision bigint)
returns public.rs_settings language plpgsql security invoker set search_path='' as $$
declare v_row public.rs_settings;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_revision=0 then
  insert into public.rs_settings(payload) values(p_payload) on conflict(owner_id) do nothing returning * into v_row;
 else
  update public.rs_settings set payload=p_payload,revision=revision+1,updated_at=now()
  where owner_id=auth.uid() and revision=p_revision returning * into v_row;
 end if;
 if v_row.owner_id is null then raise exception 'RS_CONFLICT: Cennik zmienił się na innym urządzeniu. Odśwież widok.';end if;
 return v_row;
end;$$;
revoke all on function public.rs_create_project(jsonb,date),public.rs_save_project(uuid,jsonb,bigint),public.rs_save_settings(jsonb,bigint) from public,anon;
grant execute on function public.rs_create_project(jsonb,date),public.rs_save_project(uuid,jsonb,bigint),public.rs_save_settings(jsonb,bigint) to authenticated;
