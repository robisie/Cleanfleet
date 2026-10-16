-- Integration checks; every fixture, notification and earning is rolled back.
begin;
do $$
declare
 admin_id uuid; company uuid; service uuid; ids uuid[] := '{}'; rid uuid;
 result jsonb; n integer; failed boolean; total numeric;
begin
 select user_id into admin_id from public.user_roles where role='admin' limit 1;
 select id into company from public.companies where short_name='TVM' limit 1;
 select id into service from public.cf_service_catalog where active limit 1;
 if admin_id is null or company is null or service is null then raise exception 'Missing fixture'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 for n in 1..12 loop
  insert into public.wash_records(company_id,plate,type,brand,created_by,cost)
  values(company,'CF-REGRESSION-'||n,'CIĄGNIK','TEST',admin_id,100) returning id into rid;
  ids:=array_append(ids,rid);
 end loop;
 -- No time is a completed wash and adds one earning for Michał.
 result:=public.cf_complete_wash_records(ids[1:1],current_date,null,null,'Michał',100,array[service],null);
 if not exists(select 1 from public.wash_records where id=ids[1] and approved and wash_date=current_date and duration_hours is null) then raise exception 'No-time completion failed'; end if;
 if (select count(*) from public.cf_earnings where source_wash_record_id=ids[1])<>1 then raise exception 'No-time earning missing'; end if;
 -- Other performers do not add earnings; duration without fictitious clock times.
 result:=public.cf_complete_wash_records(ids[2:2],current_date,null,null,'AGA',100,array[service],null,1.5);
 if not exists(select 1 from public.wash_records where id=ids[2] and approved and duration_hours=1.5 and wash_start_time is null and wash_end_time is null) then raise exception 'Manual duration failed'; end if;
 if exists(select 1 from public.cf_earnings where source_wash_record_id=ids[2]) then raise exception 'Wrong performer earning'; end if;
 -- Four cars / four hours: equal allocation and separate earnings.
 result:=public.cf_complete_wash_records(ids[3:6],current_date,'08:00','12:00','Michał',100,array[service],null);
 if (result->>'completed_count')::integer<>4 then raise exception 'Wrong batch count'; end if;
 if (select count(*) from public.wash_records where id=any(ids[3:6]) and approved and duration_hours=1 and wash_start_time is null and wash_end_time is null)<>4 then raise exception 'Batch allocation failed'; end if;
 if (select count(*) from public.cf_earnings where source_wash_record_id=any(ids[3:6]))<>4 then raise exception 'Batch earnings missing'; end if;
 -- Crossing midnight; duplicate IDs cannot dilute the time allocation.
 result:=public.cf_complete_wash_records(array[ids[7],ids[7]],current_date,'23:00','01:00','Michał',100,array[service],null);
 if not exists(select 1 from public.wash_records where id=ids[7] and duration_hours=2 and wash_start_time='23:00' and wash_end_time='01:00') then raise exception 'Midnight duration failed'; end if;
 -- Fractional minutes retained; sum stays one hour.
 result:=public.cf_complete_wash_records(ids[8:10],current_date,null,null,'Michał',100,array[service],null,1);
 select sum(duration_hours) into total from public.wash_records where id=any(ids[8:10]);
 if abs(total-1)>0.000000001 then raise exception 'Fractional duration lost'; end if;
 -- Stale selection rejects the entire batch, without changing the pending row.
 failed:=false;
 begin
  perform public.cf_complete_wash_records(array[ids[11],ids[1]],current_date,null,null,'Michał',100,array[service],null);
 exception when others then failed:=true; end;
 if not failed or exists(select 1 from public.wash_records where id=ids[11] and approved) then raise exception 'Partial batch saved'; end if;
 -- Incomplete clocks cannot mark a wash done.
 failed:=false;
 begin
  perform public.cf_complete_wash_records(ids[11:11],current_date,'08:00',null,'Michał',100,array[service],null);
 exception when others then failed:=true; end;
 if not failed then raise exception 'Incomplete times accepted'; end if;
 -- No session cannot write.
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;
 begin
  perform public.cf_complete_wash_records(ids[12:12],current_date,null,null,'Michał',100,array[service],null);
 exception when others then failed:=true; end;
 if not failed or exists(select 1 from public.wash_records where id=ids[12] and approved) then raise exception 'Unauthenticated write'; end if;
 if has_function_privilege('anon','public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric)','execute') then raise exception 'Anonymous execute granted'; end if;
end;$$;
rollback;
select 'PASS: optional time, manual duration, batch allocation, midnight, fractions, earnings, atomicity and authentication' as result;
