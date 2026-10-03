-- Preserve excluded automatic entries privately before correcting the earnings list.
create schema if not exists cf_private;
revoke all on schema cf_private from public,anon,authenticated;
create table if not exists cf_private.excluded_wash_earnings (
 id uuid primary key default gen_random_uuid(),
 source_wash_record_id uuid not null,
 excluded_at timestamptz not null default now(),
 entry jsonb not null
);
alter table cf_private.excluded_wash_earnings enable row level security;
revoke all on cf_private.excluded_wash_earnings from public,anon,authenticated;

-- This existing trigger needs privileged access: workers can complete washes,
-- but only the administrator can read or edit the private earnings module.
create or replace function public.cf_add_tvm_approved_wash_to_earnings()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_company_short text;
 v_employee_percent numeric(5,2):=0;
 v_total numeric(12,2);
 v_employee numeric(12,2);
 v_mine numeric(12,2);
 v_description text;
begin
 select c.short_name into v_company_short from public.companies c where c.id=new.company_id;
 if coalesce(v_company_short,'')<>'TVM'
    or not coalesce(new.approved,false)
    or new.wash_date is null
    or upper(btrim(coalesce(new.performed_by,'')))<>'MICHAŁ' then
  with excluded as (
   delete from public.cf_earnings where source_wash_record_id=new.id returning *
  )
  insert into cf_private.excluded_wash_earnings(source_wash_record_id,entry)
  select e.source_wash_record_id,to_jsonb(e) from excluded e;
  return new;
 end if;
 if exists(select 1 from public.cf_earnings e where e.source_wash_record_id=new.id) then return new;end if;
 select r.employee_percent into v_employee_percent from public.cf_earning_rules r
 where lower(btrim(r.contractor))='tvm' limit 1;
 v_employee_percent:=coalesce(v_employee_percent,0);
 v_total:=coalesce(new.cost,0);
 v_employee:=round(v_total*v_employee_percent/100.0,2);
 v_mine:=round(v_total-v_employee,2);
 v_description:=concat_ws(' ',nullif(btrim(coalesce(new.type,'')),''),
  case when btrim(coalesce(new.brand,'')) in ('','----') then null else btrim(new.brand) end,
  nullif(btrim(coalesce(new.plate,'')),''));
 insert into public.cf_earnings(work_date,contractor,description,total_amount,my_amount,employee_amount,
  employee_name,employee_paid,note,created_by,source_wash_record_id)
 values(new.wash_date,'TVM',coalesce(nullif(v_description,''),coalesce(new.plate,'Pojazd')),
  v_total,v_mine,v_employee,case when v_employee>0 then 'Tata' else null end,false,
  'Dodano automatycznie po wykonaniu prania przez Michała w CleanFleet.',coalesce(auth.uid(),new.created_by),new.id)
 on conflict (source_wash_record_id) where source_wash_record_id is not null do nothing;
 return new;
end;$$;
revoke all on function public.cf_add_tvm_approved_wash_to_earnings() from public,anon,authenticated;
drop trigger if exists trg_cf_tvm_approved_to_earnings on public.wash_records;
create trigger trg_cf_tvm_approved_to_earnings
 after insert or update of approved,performed_by,wash_date,company_id on public.wash_records
 for each row execute function public.cf_add_tvm_approved_wash_to_earnings();

with excluded as (
 delete from public.cf_earnings e using public.wash_records w
 where e.source_wash_record_id=w.id and (
  upper(btrim(coalesce(w.performed_by,'')))<>'MICHAŁ'
  or not coalesce(w.approved,false) or w.wash_date is null
  or not exists(select 1 from public.companies c where c.id=w.company_id and c.short_name='TVM')
 ) returning e.*
)
insert into cf_private.excluded_wash_earnings(source_wash_record_id,entry)
select e.source_wash_record_id,to_jsonb(e) from excluded e;
