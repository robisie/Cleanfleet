-- Reopening through any authorized project save removes only that project's
-- automatic earnings. The update and removal commit/roll back together.
create function public.rs_remove_reopened_earnings()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.payload->>'status'='zakonczona' and new.payload->>'status' is distinct from 'zakonczona' then
  delete from public.cf_earnings where source_robisie_project_id=new.id and created_by=new.owner_id;
 end if;
 return new;
end;$$;
revoke all on function public.rs_remove_reopened_earnings() from public,anon,authenticated;
create trigger rs_remove_reopened_earnings after update of payload on public.rs_projects
 for each row execute function public.rs_remove_reopened_earnings();
