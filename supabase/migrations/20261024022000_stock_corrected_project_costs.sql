-- Warehouse cost totals follow the investment's actual purchase cost after corrections.
create function public.rs_ksef_project_cost(p_number text,p_index integer) returns numeric
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(case when (e->>'index')::integer=stats.last_index then (purchase->>'amount')::numeric-coalesce(other.value,0)
  when stats.total<>0 then round((purchase->>'amount')::numeric*coalesce((e->>'gross')::numeric,0)/stats.total,2) else 0 end),0)
 from public.rs_ksef_links l join public.rs_projects p on p.id=l.project_id and p.owner_id=auth.uid()
 cross join lateral jsonb_array_elements(coalesce(p.payload->'purchases','[]')) purchase
 cross join lateral (select max((a->>'index')::integer) last_index,sum(coalesce((a->>'gross')::numeric,0)) total from jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) a) stats
 cross join lateral (select sum(case when stats.total<>0 then round((purchase->>'amount')::numeric*coalesce((a->>'gross')::numeric,0)/stats.total,2) else 0 end) value from jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) a where (a->>'index')::integer<>stats.last_index) other
 cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e
 where l.owner_id=auth.uid() and l.ksef_number=p_number and l.kind='purchases' and not coalesce((l.document->>'referenceOnly')::boolean,false)
 and purchase->>'sourceKsefNumber'=p_number and (e->>'index')::integer=p_index;
$$;
revoke all on function public.rs_ksef_project_cost(text,integer) from public,anon;
grant execute on function public.rs_ksef_project_cost(text,integer) to authenticated;
do $$declare definition text;begin
 select pg_get_functiondef('public.rs_ksef_stock()'::regprocedure) into definition;
 if position('''projectAssigned'',project_assigned,' in definition)=0 then raise exception 'Nieoczekiwana wersja magazynu.';end if;
 execute replace(definition,'''projectAssigned'',project_assigned,','''projectAssigned'',project_assigned,''projectCost'',public.rs_ksef_project_cost(d.ksef_number,(i->>''index'')::integer),');
end;$$;
