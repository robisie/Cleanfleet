begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; r public.rs_projects; e public.cf_earnings; e2 public.cf_earnings; failed boolean;
begin
 p:=public.rs_create_project('{"name":"TEST nowe zamknięcie","investor":"TEST inwestor","status":"odbior","handover":{"date":"2026-10-22","accepted":true}}',current_date);
 failed:=false;begin perform public.rs_add_project_earnings(p.id,p.revision,100);exception when others then failed:=true;end;
 if not failed then raise exception 'Earnings before completion';end if;
 r:=public.rs_finish_project(p.id,p.revision);
 if r.payload->>'status'<>'zakonczona' or exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id) then raise exception 'Completion created earnings';end if;
 if (public.rs_finish_project(p.id,p.revision)).revision<>r.revision then raise exception 'Completion retry not idempotent';end if;
 failed:=false;begin perform public.rs_add_project_earnings(p.id,p.revision,100);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale earnings accepted';end if;
 failed:=false;begin perform public.rs_add_project_earnings(p.id,r.revision,-1);exception when others then failed:=true;end;
 if not failed then raise exception 'Negative earnings accepted';end if;
 e:=public.rs_add_project_earnings(p.id,r.revision,1234.56);
 if e.my_amount<>1234.56 or e.description<>'TEST nowe zamknięcie' or e.work_date<>'2026-10-22'::date then raise exception 'Wrong earnings snapshot';end if;
 e2:=public.rs_add_project_earnings(p.id,r.revision,999);
 if e2.id<>e.id or e2.my_amount<>1234.56 or (select count(*) from public.cf_earnings where source_robisie_project_id=p.id)<>1 then raise exception 'Duplicated/overwritten earnings';end if;
 -- Reopen removes only the linked entry and permits a new explicit addition.
 update public.rs_projects set payload=jsonb_set(payload,'{status}','"prace"'),revision=revision+1 where id=p.id returning * into r;
 if exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id) then raise exception 'Reopen left earnings';end if;
 r:=public.rs_finish_project(r.id,r.revision);
 if exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id) then raise exception 'Repeat finish auto-created earnings';end if;
 e:=public.rs_add_project_earnings(p.id,r.revision,100);
 failed:=false;begin perform public.rs_finish_project_with_earnings(p.id,r.revision,999);exception when others then failed:=true;end;
 if not failed then raise exception 'Cached old client still active';end if;
 update public.rs_projects set payload=jsonb_set(payload,'{handover,accepted}','false'),revision=revision+1 where id=p.id returning * into r;
 update public.rs_projects set payload=jsonb_set(payload,'{status}','"prace"'),revision=revision+1 where id=p.id returning * into r;
 failed:=false;begin perform public.rs_finish_project(r.id,r.revision);exception when others then failed:=true;end;
 if not failed then raise exception 'Unaccepted handover closed';end if;
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;begin perform public.rs_finish_project(r.id,r.revision);exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthenticated finish';end if;
 failed:=false;begin perform public.rs_add_project_earnings(r.id,r.revision,100);exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthenticated earnings';end if;
end;$$;
rollback;
