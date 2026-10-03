-- Regression test against the migrated database; all test data is rolled back.
begin;
do $$
declare
 w public.wash_records%rowtype;
 record_id uuid;
 n integer;
 remaining integer;
begin
 select * into w from public.wash_records where performed_by='MICHAŁ' and approved and wash_date is not null and created_by is not null and company_id in(select id from public.companies where short_name='TVM') limit 1;
 if not found then raise exception 'Missing fixture';end if;
 select count(*) into remaining from public.cf_earnings e join public.wash_records r on r.id=e.source_wash_record_id where r.performed_by<>'MICHAŁ';
 if remaining<>0 then raise exception 'Old wrong entries remain';end if;
 insert into public.wash_records(company_id,plate,type,created_by,cost,wash_date,approved,performed_by)
 values(w.company_id,w.plate,w.type,w.created_by,100,current_date,true,'AGA') returning id into record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>0 then raise exception 'AGA was added';end if;
 update public.wash_records set performed_by='  Michał  ' where id=record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>1 then raise exception 'Changing performer to Michal did not add one entry';end if;
 update public.wash_records set approved=true,performed_by='MICHAŁ' where id=record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>1 then raise exception 'Duplicate earnings';end if;
 update public.wash_records set performed_by='AGA' where id=record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>0 then raise exception 'Changing performer away retained entry';end if;
 if not exists(select 1 from cf_private.excluded_wash_earnings where source_wash_record_id=record_id) then raise exception 'No backup';end if;
 update public.wash_records set performed_by='MICHAŁ',wash_date=null where id=record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>0 then raise exception 'Unfinished wash added';end if;
 update public.wash_records set wash_date=current_date where id=record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>1 then raise exception 'Michal completed wash not added';end if;
 update public.wash_records set approved=false where id=record_id;
 select count(*) into n from public.cf_earnings where source_wash_record_id=record_id;
 if n<>0 then raise exception 'Completion undo retained entry';end if;
 insert into public.cf_earnings(work_date,contractor,total_amount,my_amount,created_by) values(current_date,'Manual regression',10,10,w.created_by);
 if not exists(select 1 from public.cf_earnings where contractor='Manual regression' and source_wash_record_id is null) then raise exception 'Manual entry lost';end if;
end;$$;
select 'PASS: AGA excluded; Michał added; corrections synchronized; no duplicates; unfinished excluded; manual entries preserved; backups retained' result;

rollback;
