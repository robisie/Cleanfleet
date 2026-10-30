-- The parsed invoice type and the KSeF display type differ only in case.
-- Treat them as the same version without rewriting any saved row.
create or replace function public.rs_ksef_store_metadata(p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1250 then raise exception 'Nieprawidłowa lista faktur.';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or coalesce(r->>'ksefNumber','')!~*'^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$'
   or r#>>'{buyer,identifier,value}' is distinct from '6351861297'
   or r#>>'{seller,nip}' is distinct from left(r->>'ksefNumber',10) then raise exception 'Nieprawidłowa faktura zakupowa.';end if;
  insert into public.rs_ksef_documents(owner_id,ksef_number,metadata) values(auth.uid(),r->>'ksefNumber',r)
  on conflict(owner_id,ksef_number) do update set metadata=excluded.metadata,
   preview=case when rs_ksef_documents.metadata->>'invoiceHash' is distinct from excluded.metadata->>'invoiceHash' then null else rs_ksef_documents.preview end,
   refs=case when rs_ksef_documents.metadata->>'invoiceHash' is distinct from excluded.metadata->>'invoiceHash' then '[]'::jsonb else rs_ksef_documents.refs end
  where (rs_ksef_documents.metadata-'invoiceType') is distinct from (excluded.metadata-'invoiceType')
   or upper(rs_ksef_documents.metadata->>'invoiceType') is distinct from upper(excluded.metadata->>'invoiceType');
 end loop;
end;$$;
