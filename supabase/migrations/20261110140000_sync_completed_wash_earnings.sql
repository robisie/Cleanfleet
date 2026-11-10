create or replace function public.cf_add_tvm_approved_wash_to_earnings()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_company_short text;
 v_employee_percent numeric(5,2):=0;
 v_total numeric(12,2);
 v_employee numeric(12,2);
 v_mine numeric(12,2);
 v_description text;
 v_existing public.cf_earnings%rowtype;
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
 select r.employee_percent into v_employee_percent from public.cf_earning_rules r
 where lower(btrim(r.contractor))='tvm' limit 1;
 v_employee_percent:=coalesce(v_employee_percent,0);
 v_total:=coalesce(new.cost,0);
 v_employee:=round(v_total*v_employee_percent/100.0,2);
 select * into v_existing from public.cf_earnings
 where source_wash_record_id=new.id for update;
 if found then
  if tg_op<>'UPDATE' or old.cost is not distinct from new.cost
     or v_existing.total_amount=v_total then
   return new;
  end if;
  if v_existing.employee_paid then
   v_employee:=v_existing.employee_amount;
   -- Older EUR earnings may store the split in PLN. Match the existing
   -- exchange display by converting the saved share to the wash currency.
   if old.currency='EUR' and v_existing.total_amount>0 then
    v_employee:=round(coalesce(old.cost,0)*v_employee/v_existing.total_amount,2);
   end if;
   if v_total<v_employee then
    raise exception 'Kwota finalna jest niższa od wypłaty zapisanej w Moich zarobkach. Sprawdź wypłatę przed zmianą kwoty.'
     using errcode='22023';
   end if;
  end if;
  update public.cf_earnings
  set total_amount=v_total,my_amount=v_total-v_employee,employee_amount=v_employee,
      employee_name=coalesce(employee_name,case when v_employee>0 then 'Tata' end)
  where id=v_existing.id;
  return new;
 end if;
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
 after insert or update of approved,performed_by,wash_date,company_id,cost on public.wash_records
 for each row execute function public.cf_add_tvm_approved_wash_to_earnings();

-- Repair untouched automatic PLN entries. Older EUR rows may intentionally
-- have a different stored total from the nominal wash price.
with rule as (
 select coalesce((
  select employee_percent from public.cf_earning_rules
  where lower(btrim(contractor))='tvm' limit 1
 ),0) as employee_percent
)
update public.cf_earnings e
set total_amount=w.cost,
    employee_amount=round(w.cost*rule.employee_percent/100.0,2),
    my_amount=w.cost-round(w.cost*rule.employee_percent/100.0,2),
    employee_name=coalesce(e.employee_name,case when round(w.cost*rule.employee_percent/100.0,2)>0 then 'Tata' end)
from public.wash_records w join public.companies c on c.id=w.company_id
cross join rule
where e.source_wash_record_id=w.id
  and c.short_name='TVM' and w.approved and w.wash_date is not null
  and upper(btrim(w.performed_by))='MICHAŁ' and coalesce(w.currency,'PLN')='PLN'
  and not e.employee_paid and e.updated_at=e.created_at
  and e.note='Dodano automatycznie po wykonaniu prania przez Michała w CleanFleet.'
  and w.cost>=0 and w.cost<>e.total_amount;
