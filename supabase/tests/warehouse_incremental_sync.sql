begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare d public.rs_ksef_documents;old_ctid text;v jsonb;
begin
 assert not has_function_privilege('anon','public.rs_ksef_history_state()','execute');
 assert not has_function_privilege('anon','public.rs_ksef_mark_history(date)','execute');
 assert (select relrowsecurity from pg_class where oid='public.rs_ksef_history_checkpoints'::regclass);
 perform public.rs_ksef_mark_history((now() at time zone 'Europe/Warsaw')::date);
 perform public.rs_ksef_mark_history((now() at time zone 'Europe/Warsaw')::date-1);
 v:=public.rs_ksef_history_state();assert v->>'to'=((now() at time zone 'Europe/Warsaw')::date)::text;
 begin perform public.rs_ksef_mark_history((now() at time zone 'Europe/Warsaw')::date+1);assert false,'Future checkpoints must fail';exception when raise_exception then null;end;
 select * into d from public.rs_ksef_documents where owner_id=auth.uid() and preview is not null and metadata->>'invoiceType' ilike 'vat' limit 1;
 assert d.ksef_number is not null,'Need one existing verified invoice for rollback-only check';
 select ctid::text into old_ctid from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=d.ksef_number;
 perform public.rs_ksef_store_metadata(jsonb_build_array(d.metadata));
 assert (select ctid::text=old_ctid and preview=d.preview and refs=d.refs from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=d.ksef_number),'Unchanged metadata must not update the row';
 perform public.rs_ksef_store_metadata(jsonb_build_array(jsonb_set(d.metadata,'{invoiceType}','"Vat"'::jsonb)));
 assert (select ctid::text=old_ctid from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=d.ksef_number),'Case normalization must not rewrite';
 perform public.rs_ksef_store_metadata(jsonb_build_array(jsonb_set(d.metadata,'{invoiceHash}',to_jsonb('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='::text))));
 assert (select preview is null and refs='[]'::jsonb from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=d.ksef_number),'Changed hash must invalidate the parsed snapshot';
end;$$;
rollback;
select 'Warehouse incremental sync: permissions, owner checkpoint, no-op writes and hash invalidation passed; all fixture changes rolled back.' as result;
