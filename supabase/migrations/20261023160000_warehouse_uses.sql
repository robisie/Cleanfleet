-- Classify quantities outside investment and CleanFleet purchases without consuming them twice.
create table public.rs_ksef_stock_uses (
 owner_id uuid not null default auth.uid() references auth.users(id),
 ksef_number text not null,
 item_index integer not null check(item_index>0),
 category text not null check(category in ('auto','firmowe')),
 quantity numeric not null check(quantity>0 and quantity=round(quantity,6) and quantity<'Infinity'::numeric),
 revision bigint not null default 1,
 primary key(owner_id,ksef_number,item_index,category),
 foreign key(owner_id,ksef_number) references public.rs_ksef_documents(owner_id,ksef_number)
);
alter table public.rs_ksef_stock_uses enable row level security;
create policy rs_ksef_stock_uses_owner on public.rs_ksef_stock_uses for select to authenticated using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
revoke all on public.rs_ksef_stock_uses from public,anon;
grant select on public.rs_ksef_stock_uses to authenticated;

create function public.rs_ksef_used_quantity(p_number text,p_index integer) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(quantity),0) from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=p_number and item_index=p_index;
$$;
revoke all on function public.rs_ksef_used_quantity(text,integer) from public,anon;
grant execute on function public.rs_ksef_used_quantity(text,integer) to authenticated;

-- Writes are restricted to this RPC. Row locks and the invoice advisory lock serialize
-- against investment allocations, CleanFleet costs and manual returns.
create function public.rs_ksef_set_use(p_number text,p_index integer,p_category text,p_quantity numeric,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_quantity numeric;current_revision bigint; item jsonb; capacity numeric; allocated numeric; remaining numeric;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_category not in ('auto','firmowe') or p_index is null or p_index<=0 or p_quantity is null or p_quantity<0 or p_quantity<>round(p_quantity,6) or p_quantity>1000000000 or p_revision is null then raise exception 'Nieprawidłowe przypisanie.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select i into item from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i where d.owner_id=auth.uid() and d.ksef_number=p_number and (d.preview->>'canSelect')::boolean and d.metadata->>'invoiceType' not ilike 'kor%' and d.metadata->>'currency'='PLN' and (i->>'index')::integer=p_index and (i->>'quantity')::numeric>0 and (i->>'gross')::numeric>=0;
 if item is null then raise exception 'Nie znaleziono pozycji magazynu.';end if;
 capacity:=(item->>'quantity')::numeric;
 select quantity,revision into current_quantity,current_revision from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=p_number and item_index=p_index and category=p_category for update;
 if coalesce(current_revision,0)<>p_revision then raise exception 'Stan magazynu zmienił się. Odśwież i spróbuj ponownie.';end if;
 select coalesce(sum((e->>'quantity')::numeric),0) into allocated from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e where l.ksef_number=p_number and l.kind='purchases' and (e->>'index')::integer=p_index;
 if exists(select 1 from public.cf_purchases where source_ksef_number=p_number and source_ksef_index=p_index) then allocated:=allocated+capacity;end if;
 remaining:=capacity-allocated-public.rs_ksef_stock_deduction(p_number,p_index)-coalesce((select sum(quantity) from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=p_number and item_index=p_index),0)+coalesce(current_quantity,0);
 if p_quantity>remaining then raise exception 'Przypisanie przekracza dostępny stan: %.',greatest(remaining,0);end if;
 if p_quantity=0 then delete from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=p_number and item_index=p_index and category=p_category;
 else insert into public.rs_ksef_stock_uses(owner_id,ksef_number,item_index,category,quantity,revision) values(auth.uid(),p_number,p_index,p_category,p_quantity,1)
  on conflict(owner_id,ksef_number,item_index,category) do update set quantity=excluded.quantity,revision=public.rs_ksef_stock_uses.revision+1;
 end if;
end;$$;
revoke all on function public.rs_ksef_set_use(text,integer,text,numeric,bigint) from public,anon;
grant execute on function public.rs_ksef_set_use(text,integer,text,numeric,bigint) to authenticated;
create or replace function public.rs_ksef_guard_return() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;used numeric;deducted numeric;capacity numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.ksef_number,0));
 select i into item from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i where d.ksef_number=new.ksef_number and (i->>'index')::integer=new.item_index and (d.preview->>'canSelect')::boolean;
 capacity:=(item->>'quantity')::numeric;
 select coalesce(sum((e->>'quantity')::numeric),0) into used from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e where l.ksef_number=new.ksef_number and l.kind='purchases' and (e->>'index')::integer=new.item_index;
 if exists(select 1 from public.cf_purchases where source_ksef_number=new.ksef_number and source_ksef_index=new.item_index) then used:=used+capacity;end if;
 used:=used+public.rs_ksef_used_quantity(new.ksef_number,new.item_index);
 deducted:=public.rs_ksef_correction_returns(new.ksef_number,new.item_index);
 if capacity is null or greatest(new.quantity,deducted)+used>capacity and (tg_op='INSERT' or new.quantity>old.quantity) then raise exception 'Zwrot przekracza wolny stan.';end if;
 return new;
end;$$;


create or replace function public.rs_ksef_stock() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb:='[]';d record;i jsonb;capacity numeric;assigned numeric;project_assigned numeric;cf_assigned numeric;manual numeric;auto_used numeric;company_used numeric;corrected numeric;returned numeric;available numeric;warning text; rev bigint;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 for d in select * from public.rs_ksef_documents where preview is not null and (preview->>'canSelect')::boolean and metadata->>'invoiceType' not ilike 'kor%' loop
  for i in select value from jsonb_array_elements(d.preview->'items') where (value->>'quantity')::numeric>0 and (value->>'gross')::numeric>=0 loop
   capacity:=(i->>'quantity')::numeric;
   select coalesce(sum((e->>'quantity')::numeric),0) into assigned from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e where l.ksef_number=d.ksef_number and l.kind='purchases' and e->>'index'=i->>'index';
   project_assigned:=assigned;cf_assigned:=0;
   if exists(select 1 from public.cf_purchases where source_ksef_number=d.ksef_number and source_ksef_index=(i->>'index')::integer) then cf_assigned:=capacity;assigned:=assigned+capacity;end if;
   select coalesce(sum(quantity) filter(where category='auto'),0),coalesce(sum(quantity) filter(where category='firmowe'),0) into auto_used,company_used from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=d.ksef_number and item_index=(i->>'index')::integer;
   assigned:=assigned+auto_used+company_used;
   select quantity,revision into manual,rev from public.rs_ksef_returns where ksef_number=d.ksef_number and item_index=(i->>'index')::integer;
   manual:=coalesce(manual,0);rev:=coalesce(rev,0);corrected:=public.rs_ksef_correction_returns(d.ksef_number,(i->>'index')::integer);returned:=greatest(manual,corrected);available:=greatest(0,capacity-assigned-returned);
   warning:='';
   if exists(select 1 from public.rs_ksef_documents c cross join lateral jsonb_array_elements(c.refs) r where c.metadata->>'invoiceType' ilike 'kor%' and (upper(r->>'ksefNumber')=upper(d.ksef_number) or (r->>'ksefNumber' is null and r->>'number'=d.metadata->>'invoiceNumber' and r->>'issueDate'=d.metadata->>'issueDate' and c.metadata#>>'{seller,nip}'=d.metadata#>>'{seller,nip}')) and (jsonb_array_length(c.refs)>1 or jsonb_array_length(c.preview->'items')=0)) then warning:='Korekta zbiorcza: sprawdź PDF i oznacz zwrócone ilości ręcznie.';end if;
   if capacity>0 then result:=result||jsonb_build_array(jsonb_build_object('metadata',d.metadata,'item',i,'capacity',capacity,'assigned',assigned,'projectAssigned',project_assigned,'cleanfleetAssigned',cf_assigned,'classifiedAuto',auto_used,'classifiedCompany',company_used,'uses',coalesce((select jsonb_object_agg(category,jsonb_build_object('quantity',quantity,'revision',revision)) from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=d.ksef_number and item_index=(i->>'index')::integer),'{}'::jsonb),'manualReturned',manual,'correctedReturned',corrected,'returned',returned,'available',available,'revision',rev,'conflict',capacity-assigned-returned<0,'warning',warning));end if;
  end loop;
 end loop;
 return result;
end;$$;


create or replace function public.rs_ksef_guard_stock_allocation() returns trigger language plpgsql security invoker set search_path='' as $$
declare e jsonb;i jsonb;used numeric;capacity numeric;
begin
 if tg_table_name='cf_purchases' then
  if new.source_ksef_number is not null then
   perform pg_advisory_xact_lock(hashtextextended(new.source_ksef_number,0));
   if public.rs_ksef_stock_deduction(new.source_ksef_number,new.source_ksef_index)>0 or public.rs_ksef_used_quantity(new.source_ksef_number,new.source_ksef_index)>0 then raise exception 'Pozycja zawiera zwrócony towar. Nie można przypisać całej pozycji do CleanFleet.';end if;
  end if;
 else
  if new.kind<>'purchases' or coalesce((new.document->>'referenceOnly')::boolean,false) then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended(new.ksef_number,0));
  for e in select value from jsonb_array_elements(public.rs_ksef_entries(new.document,new.items)) loop
   select x into i from jsonb_array_elements(new.items) with ordinality a(x,ord) where coalesce((x->>'index')::integer,ord)=(e->>'index')::integer;
   capacity:=case when (i->>'quantity')::numeric>0 then (i->>'quantity')::numeric else 1 end;
   select coalesce(sum((x->>'quantity')::numeric),0) into used from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) x where l.ksef_number=new.ksef_number and l.kind='purchases' and l.project_id<>new.project_id and x->>'index'=e->>'index';
   if used+(e->>'quantity')::numeric+public.rs_ksef_stock_deduction(new.ksef_number,(e->>'index')::integer)+public.rs_ksef_used_quantity(new.ksef_number,(e->>'index')::integer)>capacity then raise exception 'Przypisanie przekracza stan po odjęciu zwrotów. Odśwież pozycje faktury.';end if;
  end loop;
 end if;
 return new;
end;$$;


create or replace function public.rs_ksef_select_quantities(p_number text,p_project uuid,p_preview jsonb,p_entries jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e jsonb; i jsonb; n numeric; capacity numeric; used numeric; used_gross numeric; gross numeric; selected jsonb:='[]'; entries jsonb:='[]'; total numeric:=0; indices integer[]:='{}'; full_document boolean;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 if p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)=0 then raise exception 'Wybierz przynajmniej jedną pozycję.';end if;
 for e in select value from jsonb_array_elements(p_entries) order by (value->>'index')::integer loop
  select value into i from jsonb_array_elements(p_preview->'items') where value->>'index'=e->>'index';
  n:=(e->>'quantity')::numeric;capacity:=case when (i->>'quantity')::numeric>0 then (i->>'quantity')::numeric else 1 end;
  if i is null or n is null or n::text in ('NaN','Infinity','-Infinity') or n<=0 or n<>round(n,6) or (e->>'index')::integer=any(indices) then raise exception 'Nieprawidłowe pozycje lub ilości.';end if;
  if exists(select 1 from public.cf_purchases where source_ksef_number=p_number and source_ksef_index=(e->>'index')::integer) then raise exception 'Pozycja jest już kosztem w CleanFleet.';end if;
  select coalesce(sum((a->>'quantity')::numeric),0),coalesce(sum(coalesce((a->>'gross')::numeric,round((i->>'gross')::numeric*(a->>'quantity')::numeric/capacity,2))),0) into used,used_gross
   from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) a
   where l.ksef_number=p_number and l.kind='purchases' and l.project_id<>p_project and a->>'index'=e->>'index';
  used:=used+public.rs_ksef_stock_deduction(p_number,(e->>'index')::integer)+public.rs_ksef_used_quantity(p_number,(e->>'index')::integer);
  used_gross:=used_gross+round((i->>'gross')::numeric*(public.rs_ksef_stock_deduction(p_number,(e->>'index')::integer)+public.rs_ksef_used_quantity(p_number,(e->>'index')::integer))/capacity,2);
  if used+n>capacity then raise exception 'Pozycja %: dostępna ilość %. Odśwież przypisania.',i->>'name',greatest(0,capacity-used);end if;
  gross:=case when used+n=capacity then (i->>'gross')::numeric-used_gross else case when (i->>'gross')::numeric>=0 then least((i->>'gross')::numeric-used_gross,round((i->>'gross')::numeric*n/capacity,2)) else greatest((i->>'gross')::numeric-used_gross,round((i->>'gross')::numeric*n/capacity,2)) end end;
  selected:=selected||jsonb_build_array(i||jsonb_build_object('invoiceQuantity',i->'quantity','quantity',n,'gross',gross));
  entries:=entries||jsonb_build_array(jsonb_build_object('index',i->'index','quantity',n,'gross',gross));
  total:=total+coalesce(gross,0);indices:=array_append(indices,(i->>'index')::integer);
 end loop;
 full_document:=cardinality(indices)=jsonb_array_length(p_preview->'items') and not exists(select 1 from jsonb_array_elements(selected) a where (a->>'quantity')::numeric<>case when (a->>'invoiceQuantity')::numeric>0 then (a->>'invoiceQuantity')::numeric else 1 end);
 if not coalesce((p_preview->>'canSelect')::boolean,false) then
  if not full_document or exists(select 1 from public.rs_ksef_links where ksef_number=p_number and project_id<>p_project) then raise exception 'Ta faktura wymaga przypisania w całości do jednej inwestycji.';end if;
  total:=(p_preview->>'gross')::numeric;
 end if;
 if total is null or total::text in ('NaN','Infinity','-Infinity') or total<0 or total>(p_preview->>'gross')::numeric then raise exception 'Nieprawidłowa kwota pozycji.';end if;
 return jsonb_build_object('entries',entries,'items',selected,'indices',to_jsonb(indices),'total',total,'description',(select string_agg(concat_ws(' ',a->>'name',a->>'quantity',a->>'unit'),'; ' order by (a->>'index')::integer) from jsonb_array_elements(selected) a));
end;$$;




create or replace function public.rs_ksef_allocation_context(p_number text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return jsonb_build_object('links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('project_name',p.payload->>'name')) from public.rs_ksef_links l join public.rs_projects p on p.id=l.project_id where l.ksef_number=p_number and l.kind='purchases'),'[]')||coalesce((select jsonb_build_array(jsonb_build_object('kind','purchases','project_id',null,'project_name','Zwrócono / Auto / Koszty firmowe','document',jsonb_build_object('selectedQuantities',jsonb_agg(jsonb_build_object('index',i->'index','quantity',(public.rs_ksef_stock_deduction(p_number,(i->>'index')::integer)+public.rs_ksef_used_quantity(p_number,(i->>'index')::integer)),'gross',round((i->>'gross')::numeric*(public.rs_ksef_stock_deduction(p_number,(i->>'index')::integer)+public.rs_ksef_used_quantity(p_number,(i->>'index')::integer))/(i->>'quantity')::numeric,2)))))) from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i where d.ksef_number=p_number and (i->>'quantity')::numeric>0 and (public.rs_ksef_stock_deduction(p_number,(i->>'index')::integer)+public.rs_ksef_used_quantity(p_number,(i->>'index')::integer))>0 having count(*)>0),'[]'::jsonb),
 'blocked',coalesce((select jsonb_agg(source_ksef_index) from public.cf_purchases where source_ksef_number=p_number),'[]'));
end;$$;
