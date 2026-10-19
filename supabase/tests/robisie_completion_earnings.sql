-- Run as a database administrator. All fixtures and counters roll back.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; r public.rs_projects; n integer; failed boolean; e public.cf_earnings;
begin
 p:=public.rs_create_project('{"name":"TEST odbioru","investor":"TEST inwestora","status":"odbior","handover":{"date":"2026-10-19","accepted":true}}'::jsonb,current_date);
 r:=public.rs_finish_project_with_earnings(p.id,p.revision,1234.56);
 select * into e from public.cf_earnings where source_robisie_project_id=p.id;
 if r.payload->>'status'<>'zakonczona' or e.description<>'TEST odbioru' or e.total_amount<>1234.56
  or e.my_amount<>1234.56 or e.employee_amount<>0 or e.work_date<>'2026-10-19'::date then
  raise exception 'Incorrect completion/earnings';end if;
 r:=public.rs_finish_project_with_earnings(p.id,p.revision,1234.56);
 if r.revision<>p.revision+1 then raise exception 'Retry wrote twice';end if;
 failed:=false;
 begin perform public.rs_finish_project_with_earnings(p.id,p.revision,999);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale amount accepted';end if;
 r:=public.rs_finish_project_with_earnings(p.id,r.revision,1500);
 select count(*) into n from public.cf_earnings where source_robisie_project_id=p.id;
 if n<>1 or (select my_amount from public.cf_earnings where source_robisie_project_id=p.id)<>1500 then
  raise exception 'Repeated completion duplicated/missed amount';end if;
 failed:=false;
 begin perform public.rs_finish_project_with_earnings(p.id,r.revision,-1);exception when others then failed:=true;end;
 if not failed then raise exception 'Negative amount accepted';end if;
 p:=public.rs_create_project('{"name":"TEST invalid","status":"odbior","handover":{"date":"2026-10-19","accepted":false}}'::jsonb,current_date);
 failed:=false;
 begin perform public.rs_finish_project_with_earnings(p.id,p.revision,100);exception when others then failed:=true;end;
 if not failed or exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id)
  or (select payload->>'status' from public.rs_projects where id=p.id)<>'odbior' then
  raise exception 'Invalid handover was not atomic';end if;
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;
 begin perform public.rs_finish_project_with_earnings(p.id,p.revision,100);exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthenticated completion accepted';end if;
end;$$;
rollback;
