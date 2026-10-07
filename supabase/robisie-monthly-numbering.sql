-- Robisię only: monthly counters; existing contracts and attachments stay unchanged.
lock table public.rs_number_counters,public.rs_projects in access exclusive mode;
alter table public.rs_number_counters add column month integer;
-- Retain counters even if a year has no saved projects; derive used months from contracts.
update public.rs_number_counters c set
 month=coalesce((select p.month from public.rs_projects p where p.year=c.year order by p.serial desc limit 1),1),
 last_number=coalesce((select max(p.serial) from public.rs_projects p where p.year=c.year and p.month=(select q.month from public.rs_projects q where q.year=c.year order by q.serial desc limit 1)),c.last_number);
alter table public.rs_number_counters alter column month set not null;
alter table public.rs_number_counters add constraint rs_number_counters_month_check check(month between 1 and 12);
alter table public.rs_number_counters drop constraint rs_number_counters_pkey;
alter table public.rs_number_counters add primary key(year,month);
insert into public.rs_number_counters(year,month,last_number)
 select year,month,max(serial) from public.rs_projects group by year,month
 on conflict(year,month) do update set last_number=greatest(rs_number_counters.last_number,excluded.last_number);
alter table public.rs_projects drop constraint rs_projects_year_serial_key;
alter table public.rs_projects add constraint rs_projects_year_month_serial_key unique(year,month,serial);
create or replace function public.rs_create_project(p_payload jsonb,p_date date default current_date)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare v_year integer; v_month integer; v_serial integer; v_row public.rs_projects;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_date is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Nieprawidłowe dane inwestycji.'; end if;
 v_year:=extract(year from p_date);v_month:=extract(month from p_date);
 insert into public.rs_number_counters(year,month,last_number) values(v_year,v_month,1)
 on conflict(year,month) do update set last_number=rs_number_counters.last_number+1
 returning last_number into v_serial;
 insert into public.rs_projects(contract_number,year,month,serial,payload)
 values('UUR-RS/'||v_year||'/'||lpad(v_month::text,2,'0')||'/'||case when v_serial<1000 then lpad(v_serial::text,3,'0') else v_serial::text end,v_year,v_month,v_serial,p_payload)
 returning * into v_row;
 return v_row;
end;$$;
