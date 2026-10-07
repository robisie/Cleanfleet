-- Robisię only: owner/admin deletion, guarded against stale revisions.
-- This migration grants a capability; it does not delete existing investments.
grant delete on public.rs_projects to authenticated;
create policy rs_projects_delete on public.rs_projects for delete to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create function public.rs_delete_project(p_id uuid,p_revision bigint)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 delete from public.rs_projects where id=p_id and owner_id=auth.uid() and revision=p_revision returning id into v_id;
 if v_id is null then raise exception 'RS_CONFLICT: Inwestycja zmieniła się lub została usunięta. Odśwież listę przed usunięciem.'; end if;
 return v_id;
end;$$;
revoke all on function public.rs_delete_project(uuid,bigint) from public,anon;
grant execute on function public.rs_delete_project(uuid,bigint) to authenticated;
