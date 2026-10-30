-- Read-only destination details accompany the warehouse's existing quantity totals.
create function public.rs_ksef_stock_destinations(p_number text,p_index integer,p_capacity numeric)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return coalesce((select jsonb_agg(x.value order by x.sort_key,x.name) from (
  select 1 sort_key,coalesce(p.payload->>'name','') name,
   jsonb_build_object('kind','robisie','name',coalesce(nullif(p.payload->>'name',''),'Inwestycja Robisię'),'projectId',p.id,'number',p.contract_number,'quantity',sum((e->>'quantity')::numeric)) value
  from public.rs_ksef_links l join public.rs_projects p on p.id=l.project_id and p.owner_id=auth.uid()
  cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e
  where l.owner_id=auth.uid() and l.ksef_number=p_number and l.kind='purchases' and (e->>'index')::integer=p_index and (e->>'quantity')::numeric>0
  group by p.id,p.payload->>'name',p.contract_number
  union all
  select 2,coalesce(c.name,''),jsonb_build_object('kind','cleanfleet','name',coalesce(c.name,''),'quantity',p_capacity)
  from public.cf_purchases cp left join public.companies c on c.id=cp.company_id
  where cp.source_ksef_number=p_number and cp.source_ksef_index=p_index
  union all
  select case u.category when 'auto' then 3 when 'firmowe' then 4 else 2 end,'',
   jsonb_build_object('kind',u.category,'name','','quantity',u.quantity)
  from public.rs_ksef_stock_uses u where u.owner_id=auth.uid() and u.ksef_number=p_number and u.item_index=p_index and u.quantity>0
 ) x),'[]'::jsonb);
end;$$;
revoke all on function public.rs_ksef_stock_destinations(text,integer,numeric) from public,anon;
grant execute on function public.rs_ksef_stock_destinations(text,integer,numeric) to authenticated;

-- Preserve all current stock/return/correction calculations and enrich each result row.
do $$declare definition text;begin
 select pg_get_functiondef('public.rs_ksef_stock()'::regprocedure) into definition;
 if position('''metadata'',d.metadata,' in definition)=0 or position('''destinations''' in definition)>0 then raise exception 'Nieoczekiwana wersja magazynu.';end if;
 execute replace(definition,'''metadata'',d.metadata,','''metadata'',d.metadata,''destinations'',public.rs_ksef_stock_destinations(d.ksef_number,(i->>''index'')::integer,capacity),');
end;$$;
