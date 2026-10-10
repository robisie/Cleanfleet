-- Robisię 1.0.21: freeze base prices for existing investments before annual corrections.
-- Only rs_ tables and rs_ functions are modified; offers and financial data are preserved.
begin;
update public.rs_projects as p
set payload=p.payload||jsonb_build_object('catalog',coalesce(p.payload->'catalog',s.payload->'catalog','[]'::jsonb),'markup',coalesce(p.payload->'markup',s.payload->'markup','35'::jsonb)),revision=p.revision+1,updated_at=now()
from public.rs_settings as s
where p.owner_id=s.owner_id and (not p.payload ? 'catalog' or not p.payload ? 'markup');
create or replace function public.rs_create_project(p_payload jsonb,p_date date default current_date)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare v_year integer; v_month integer; v_serial integer; v_row public.rs_projects; v_settings jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_date is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Nieprawidłowe dane inwestycji.'; end if;
 select payload into v_settings from public.rs_settings where owner_id=auth.uid() for share;
 if v_settings is null then raise exception 'Zapisz cennik bazowy przed utworzeniem inwestycji.'; end if;
 p_payload:=p_payload||jsonb_build_object('catalog',coalesce(v_settings->'catalog','[]'::jsonb),'markup',coalesce(v_settings->'markup','35'::jsonb));
 v_year:=extract(year from p_date);v_month:=extract(month from p_date);
 insert into public.rs_number_counters(year,month,last_number) values(v_year,v_month,1)
 on conflict(year,month) do update set last_number=rs_number_counters.last_number+1
 returning last_number into v_serial;
 insert into public.rs_projects(contract_number,year,month,serial,payload)
 values('UUR-RS/'||v_year||'/'||lpad(v_month::text,2,'0')||'/'||case when v_serial<1000 then lpad(v_serial::text,3,'0') else v_serial::text end,v_year,v_month,v_serial,p_payload)
 returning * into v_row;
 return v_row;
end;$$;
create or replace function public.rs_save_project(p_id uuid,p_payload jsonb,p_revision bigint)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare v_row public.rs_projects; v_previous jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 select payload into v_previous from public.rs_projects where id=p_id and owner_id=auth.uid() and revision=p_revision for update;
 if v_previous is null then raise exception 'RS_CONFLICT: Dane zmieniły się na innym urządzeniu. Odśwież widok.'; end if;
 -- Retain catalog snapshots if an older client submits a payload without them.
 if not p_payload ? 'catalog' then p_payload:=p_payload||jsonb_build_object('catalog',coalesce(v_previous->'catalog','[]'::jsonb)); end if;
 if not p_payload ? 'markup' then p_payload:=p_payload||jsonb_build_object('markup',coalesce(v_previous->'markup','35'::jsonb)); end if;
 update public.rs_projects set payload=p_payload,revision=revision+1,updated_at=now()
 where id=p_id and owner_id=auth.uid() and revision=p_revision returning * into v_row;
 if v_row.id is null then raise exception 'RS_CONFLICT: Dane zmieniły się na innym urządzeniu. Odśwież widok.'; end if;
 return v_row;
end;$$;

-- Freeze services added since an investment's last save before correcting the master.
create or replace function public.rs_save_settings(p_payload jsonb,p_revision bigint)
returns public.rs_settings language plpgsql security invoker set search_path='' as $$
declare v_row public.rs_settings; v_previous public.rs_settings;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Nieprawidłowy cennik.'; end if;
 select * into v_previous from public.rs_settings where owner_id=auth.uid() for update;
 if p_revision=0 then
  insert into public.rs_settings(payload) values(p_payload) on conflict(owner_id) do nothing returning * into v_row;
 else
  if v_previous.owner_id is null or v_previous.revision<>p_revision then raise exception 'RS_CONFLICT: Cennik zmienił się na innym urządzeniu. Odśwież widok.'; end if;
  if coalesce(p_payload->'catalogCorrections','[]'::jsonb) is distinct from coalesce(v_previous.payload->'catalogCorrections','[]'::jsonb) then
   update public.rs_projects as p set
    payload=jsonb_set(p.payload,'{catalog}',coalesce(p.payload->'catalog','[]'::jsonb)||(
     select jsonb_agg(item) from jsonb_array_elements(v_previous.payload->'catalog') as source(item)
     where not exists(select 1 from jsonb_array_elements(coalesce(p.payload->'catalog','[]'::jsonb)) as snapshot(value) where value->>'id'=item->>'id')
    )),revision=p.revision+1,updated_at=now()
   where p.owner_id=auth.uid() and exists(
    select 1 from jsonb_array_elements(v_previous.payload->'catalog') as source(item)
    where not exists(select 1 from jsonb_array_elements(coalesce(p.payload->'catalog','[]'::jsonb)) as snapshot(value) where value->>'id'=item->>'id')
   );
  end if;
  update public.rs_settings set payload=p_payload,revision=revision+1,updated_at=now()
  where owner_id=auth.uid() and revision=p_revision returning * into v_row;
 end if;
 if v_row.owner_id is null then raise exception 'RS_CONFLICT: Cennik zmienił się na innym urządzeniu. Odśwież widok.'; end if;
 return v_row;
end;$$;
commit;
