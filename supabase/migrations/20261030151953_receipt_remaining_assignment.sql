-- Assign only the currently free receipt quantities, atomically and revision checked.
create function public.rs_receipt_assign_remaining(p_number text,p_category text,p_entries jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare rows jsonb;expected jsonb;actual jsonb;r jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_category is null or p_category not in ('auto','firmowe','cleanfleet') or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 80 then raise exception 'Nieprawidłowe przypisanie paragonu.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 if not exists(select 1 from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number and metadata->>'source'='nip-receipt') then raise exception 'Nie znaleziono paragonu.';end if;
 select coalesce(jsonb_agg(x order by (x#>>'{item,index}')::integer),'[]'::jsonb) into rows
 from jsonb_array_elements(public.rs_ksef_stock()) x
 where x#>>'{metadata,ksefNumber}'=p_number and (x->>'available')::numeric>0 and not coalesce((x->>'conflict')::boolean,false)
 and not exists(select 1 from public.rs_stock_hidden h where h.owner_id=auth.uid() and h.ksef_number=p_number and h.item_index=(x#>>'{item,index}')::integer);
 select jsonb_agg(jsonb_build_object('index',(x#>>'{item,index}')::integer,'quantity',(x->>'available')::numeric) order by (x#>>'{item,index}')::integer) into actual from jsonb_array_elements(rows) x;
 select jsonb_agg(jsonb_build_object('index',(x->>'index')::integer,'quantity',(x->>'quantity')::numeric) order by (x->>'index')::integer) into expected from jsonb_array_elements(p_entries) x;
 if actual is null or actual is distinct from expected then raise exception 'Dostępne pozycje paragonu zmieniły się. Odśwież magazyn i spróbuj ponownie.';end if;
 for r in select value from jsonb_array_elements(rows) loop
  perform public.rs_ksef_set_use(p_number,(r#>>'{item,index}')::integer,p_category,
   coalesce((r#>>array['uses',p_category,'quantity'])::numeric,0)+(r->>'available')::numeric,
   coalesce((r#>>array['uses',p_category,'revision'])::bigint,0));
 end loop;
end;$$;
revoke all on function public.rs_receipt_assign_remaining(text,text,jsonb) from public,anon;
grant execute on function public.rs_receipt_assign_remaining(text,text,jsonb) to authenticated;
