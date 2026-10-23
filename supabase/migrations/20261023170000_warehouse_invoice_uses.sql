-- Classify every eligible line of one invoice in a single transaction.
create function public.rs_ksef_set_invoice_use(p_number text,p_category text,p_expected_indices integer[]) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; indices integer[]; capacity numeric;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_number is null or p_category not in ('auto','firmowe') or p_expected_indices is null or cardinality(p_expected_indices)=0 then raise exception 'Nieprawidłowe przypisanie faktury.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select array_agg((i->>'index')::integer order by (i->>'index')::integer) into indices
 from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i
 where d.owner_id=auth.uid() and d.ksef_number=p_number and (d.preview->>'canSelect')::boolean
 and d.metadata->>'invoiceType' not ilike 'kor%' and d.metadata->>'currency'='PLN'
 and (i->>'quantity')::numeric>0 and (i->>'gross')::numeric>=0;
 if indices is null or indices <> (select array_agg(x order by x) from unnest(p_expected_indices) x)
 or cardinality(indices)<>cardinality(p_expected_indices) then raise exception 'Lista pozycji faktury zmieniła się. Odśwież Magazyn.'; end if;
 for item in select i from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i
  where d.owner_id=auth.uid() and d.ksef_number=p_number and (i->>'index')::integer=any(indices)
  order by (i->>'index')::integer loop
  capacity:=(item->>'quantity')::numeric;
  perform public.rs_ksef_set_use(p_number,(item->>'index')::integer,p_category,capacity,0);
 end loop;
end;$$;
revoke all on function public.rs_ksef_set_invoice_use(text,text,integer[]) from public,anon;
grant execute on function public.rs_ksef_set_invoice_use(text,text,integer[]) to authenticated;
