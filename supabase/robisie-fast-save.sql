-- Robisię 1.0.43: send changed fields only; preserve full, legacy-compatible undo in Postgres.
-- Existing save functions continue to enforce ownership, revisions, RLS and catalog corrections.
begin;
create or replace function public.rs_save_project_fast(p_id uuid,p_fields jsonb,p_remove_keys text[],p_revision bigint,p_undo_saved_at text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.rs_projects; saved public.rs_projects; data jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'Nieprawidłowe dane inwestycji.'; end if;
 select * into old from public.rs_projects where id=p_id and owner_id=auth.uid() and revision=p_revision for update;
 if old.id is null then raise exception 'RS_CONFLICT: Dane zmieniły się na innym urządzeniu. Odśwież widok.'; end if;
 data:=((old.payload-'_undo')-coalesce(p_remove_keys,array[]::text[]))||(p_fields-'_undo');
 if p_undo_saved_at is not null then
  if data is distinct from old.payload-'_undo' then data:=data||jsonb_build_object('_undo',jsonb_build_object('savedAt',p_undo_saved_at,'payload',old.payload-'_undo'));
  elsif old.payload ? '_undo' then data:=data||jsonb_build_object('_undo',old.payload->'_undo'); end if;
 end if;
 if data=old.payload then saved:=old; else saved:=public.rs_save_project(p_id,data,p_revision); end if;
 return jsonb_build_object('id',saved.id,'revision',saved.revision,'updated_at',saved.updated_at);
end;$$;
create or replace function public.rs_save_settings_fast(p_fields jsonb,p_remove_keys text[],p_revision bigint,p_undo_saved_at text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.rs_settings; saved public.rs_settings; previous jsonb; data jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'Nieprawidłowy cennik.'; end if;
 select * into old from public.rs_settings where owner_id=auth.uid() for update;
 if p_revision<>0 and (old.owner_id is null or old.revision<>p_revision) then raise exception 'RS_CONFLICT: Cennik zmienił się na innym urządzeniu. Odśwież widok.'; end if;
 previous:=coalesce(old.payload,'{}'::jsonb)-'_undo';data:=(previous-coalesce(p_remove_keys,array[]::text[]))||(p_fields-'_undo');
 if p_undo_saved_at is not null and old.owner_id is not null then
  if data is distinct from previous then data:=data||jsonb_build_object('_undo',jsonb_build_object('savedAt',p_undo_saved_at,'payload',previous));
  elsif old.payload ? '_undo' then data:=data||jsonb_build_object('_undo',old.payload->'_undo'); end if;
 end if;
 if old.owner_id is not null and data=old.payload then saved:=old;else saved:=public.rs_save_settings(data,p_revision);end if;
 return jsonb_build_object('owner_id',saved.owner_id,'revision',saved.revision,'updated_at',saved.updated_at);
end;$$;
revoke all on function public.rs_save_project_fast(uuid,jsonb,text[],bigint,text),public.rs_save_settings_fast(jsonb,text[],bigint,text) from public,anon;
grant execute on function public.rs_save_project_fast(uuid,jsonb,text[],bigint,text),public.rs_save_settings_fast(jsonb,text[],bigint,text) to authenticated;
notify pgrst,'reload schema';
commit;
