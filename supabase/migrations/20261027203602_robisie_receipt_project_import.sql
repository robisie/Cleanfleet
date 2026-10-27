-- Saving the source and assigning its rows is one transaction.
create function public.rs_receipt_import_project(p_hash text,p_data jsonb,p_project uuid,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare number text; entries jsonb; result jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 number:=public.rs_receipt_save(p_hash,p_data);
 select jsonb_agg(jsonb_build_object('index',ordinality,'quantity',value->'quantity') order by ordinality) into entries from jsonb_array_elements(p_data->'items') with ordinality;
 result:=public.rs_receipt_assign_project(number,p_project,entries,p_revision);
 return result||jsonb_build_object('number',number);
end;$$;
revoke all on function public.rs_receipt_import_project(text,jsonb,uuid,bigint) from public,anon;
grant execute on function public.rs_receipt_import_project(text,jsonb,uuid,bigint) to authenticated;
