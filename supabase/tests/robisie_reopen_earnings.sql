begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; other public.rs_projects; r public.rs_projects; failed boolean;
begin
 p:=public.rs_create_project('{"name":"TEST reopen","status":"odbior","handover":{"date":"2026-10-20","accepted":true}}'::jsonb,current_date);
 other:=public.rs_create_project('{"name":"TEST keep","status":"odbior","handover":{"date":"2026-10-20","accepted":true}}'::jsonb,current_date);
 p:=public.rs_finish_project_with_earnings(p.id,p.revision,500);
 other:=public.rs_finish_project_with_earnings(other.id,other.revision,700);
 r:=public.rs_save_project(p.id,jsonb_set(p.payload,'{name}','"TEST still completed"'),p.revision);
 if not exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id) then raise exception 'Ordinary edit removed earnings';end if;
 failed:=false;
 begin perform public.rs_save_project(r.id,jsonb_set(r.payload,'{status}','"prace"'),r.revision-1);exception when others then failed:=true;end;
 if not failed or not exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id) then raise exception 'Stale reopen changed earnings';end if;
 r:=public.rs_save_project(r.id,jsonb_set(r.payload,'{status}','"prace"'),r.revision);
 if exists(select 1 from public.cf_earnings where source_robisie_project_id=p.id) then raise exception 'Reopened earnings retained';end if;
 if not exists(select 1 from public.cf_earnings where source_robisie_project_id=other.id) then raise exception 'Other investment affected';end if;
 r:=public.rs_finish_project_with_earnings(r.id,r.revision,550);
 if (select count(*) from public.cf_earnings where source_robisie_project_id=p.id)<>1 then raise exception 'Recompletion failed';end if;
end;$$;
rollback;
