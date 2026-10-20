-- Keep a receipt allocation valid even when another tab uses the older editor.
create function public.rs_guard_purchase_sources()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null then perform public.rs_validate_purchase_sources(new.payload);end if;
 return new;
end;$$;
revoke all on function public.rs_guard_purchase_sources() from public,anon,authenticated;
create trigger rs_purchase_source_guard before update of payload on public.rs_projects
for each row when (jsonb_path_exists(new.payload,'$.purchases[*].receiptPayments') or jsonb_path_exists(old.payload,'$.purchases[*].receiptPayments'))
execute function public.rs_guard_purchase_sources();
