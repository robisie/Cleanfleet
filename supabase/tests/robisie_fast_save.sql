-- Verify real RPCs under authenticated RLS; every test edit is rolled back.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from public.rs_settings limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare original public.rs_projects; saved public.rs_projects; master public.rs_settings; meta jsonb; stamp text:='2026-10-15T18:00:00.000Z';
begin
 select * into original from public.rs_projects order by created_at desc limit 1;
 meta:=public.rs_save_project_fast(original.id,'{"name":"FAST SAVE ROLLBACK TEST","testTransient":1}',array[]::text[],original.revision,stamp);
 select * into saved from public.rs_projects where id=original.id;
 assert saved.revision=original.revision+1,'Revision not advanced';
 assert saved.payload->>'name'='FAST SAVE ROLLBACK TEST','Field not saved';
 assert saved.payload->'_undo'->'payload'=original.payload-'_undo','Full legacy undo was not preserved';
 assert saved.payload-'name'-'testTransient'-'_undo'=original.payload-'name'-'_undo','Unchanged data lost';
 assert not meta ? 'payload','Response contains full project';
 perform public.rs_save_project_fast(original.id,jsonb_build_object('name',original.payload->'name'),array['testTransient'],saved.revision,null);
 select * into saved from public.rs_projects where id=original.id;
 assert saved.payload=original.payload-'_undo','Undo/removal failed';
 begin
  perform public.rs_save_project_fast(original.id,'{}',array[]::text[],original.revision,stamp);
  raise exception 'Stale revision accepted';
 exception when others then if sqlerrm not like 'RS_CONFLICT:%' then raise;end if;end;
 select * into master from public.rs_settings where owner_id=auth.uid();
 perform public.rs_save_settings_fast('{"testTransient":1}',array[]::text[],master.revision,stamp);
 assert (select payload->'_undo'->'payload' from public.rs_settings where owner_id=auth.uid())=master.payload-'_undo','Settings undo lost';
 perform public.rs_save_settings_fast('{}',array['testTransient'],master.revision+1,null);
 assert (select payload from public.rs_settings where owner_id=auth.uid())=master.payload-'_undo','Settings restore failed';
 assert not has_function_privilege('anon','public.rs_save_project_fast(uuid,jsonb,text[],bigint,text)','execute'),'Anonymous execution granted';
end $$;
rollback;
