-- Persistent invoice index is separate from project allocations. RLS scopes it to its owner.
create table public.rs_ksef_documents (
 owner_id uuid not null default auth.uid() references auth.users(id),
 ksef_number text not null,
 metadata jsonb not null,
 preview jsonb,
 refs jsonb not null default '[]',
 primary key(owner_id,ksef_number)
);
alter table public.rs_ksef_documents enable row level security;
create policy rs_ksef_documents_owner on public.rs_ksef_documents for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
grant select,insert,update on public.rs_ksef_documents to authenticated;
revoke all on public.rs_ksef_documents from anon;

create table public.rs_ksef_returns (
 owner_id uuid not null default auth.uid() references auth.users(id),
 ksef_number text not null,
 item_index integer not null check(item_index>0),
 quantity numeric not null check(quantity>=0 and quantity=round(quantity,6) and quantity<'Infinity'::numeric),
 revision bigint not null default 1,
 primary key(owner_id,ksef_number,item_index),
 foreign key(owner_id,ksef_number) references public.rs_ksef_documents(owner_id,ksef_number)
);
alter table public.rs_ksef_returns enable row level security;
create policy rs_ksef_returns_owner on public.rs_ksef_returns for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
grant select,insert,update on public.rs_ksef_returns to authenticated;
revoke all on public.rs_ksef_returns from anon;

create function public.rs_ksef_store_metadata(p_rows jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1250 then raise exception 'Nieprawidłowa lista faktur.';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if coalesce(r->>'ksefNumber','')!~*'^\d{10}-\d{8}-[a-f0-9]{12}-[a-f0-9]{2}$' or r#>>'{buyer,identifier,value}' is distinct from '6351861297' or r#>>'{seller,nip}' is distinct from left(r->>'ksefNumber',10) then raise exception 'Nieprawidłowa faktura zakupowa.';end if;
  insert into public.rs_ksef_documents(owner_id,ksef_number,metadata) values(auth.uid(),r->>'ksefNumber',r)
  on conflict(owner_id,ksef_number) do update set metadata=excluded.metadata;
 end loop;
end;$$;

-- A row-level guard also covers direct writes by older clients.
create function public.rs_ksef_guard_return() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;used numeric;deducted numeric;capacity numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.ksef_number,0));
 select i into item from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i where d.ksef_number=new.ksef_number and (i->>'index')::integer=new.item_index and (d.preview->>'canSelect')::boolean;
 capacity:=(item->>'quantity')::numeric;
 select coalesce(sum((e->>'quantity')::numeric),0) into used from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e where l.ksef_number=new.ksef_number and l.kind='purchases' and (e->>'index')::integer=new.item_index;
 if exists(select 1 from public.cf_purchases where source_ksef_number=new.ksef_number and source_ksef_index=new.item_index) then used:=used+capacity;end if;
 deducted:=public.rs_ksef_correction_returns(new.ksef_number,new.item_index);
 if capacity is null or greatest(new.quantity,deducted)+used>capacity and (tg_op='INSERT' or new.quantity>old.quantity) then raise exception 'Zwrot przekracza wolny stan.';end if;
 return new;
end;$$;
create trigger rs_ksef_guard_return before insert or update on public.rs_ksef_returns for each row execute function public.rs_ksef_guard_return();
revoke all on function public.rs_ksef_guard_return() from public,anon,authenticated;

create function public.rs_ksef_store_xml(p_number text,p_xml text) returns void language plpgsql security invoker set search_path='' as $$
declare d public.rs_ksef_documents; v_preview jsonb; v_refs jsonb; info record; doc xml;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 select * into d from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number;
 if d.ksef_number is null then raise exception 'Najpierw pobierz metadane faktury.';end if;
 v_preview:=public.rs_ksef_purchase_preview(p_xml);doc:=xmlparse(document p_xml);
 select * into info from xmltable('/*[local-name()="Faktura"]' passing doc columns
  number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',
  issued text path '*[local-name()="Fa"]/*[local-name()="P_1"]',
  kind text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
  nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]');
 if info.number is distinct from d.metadata->>'invoiceNumber' or info.issued is distinct from d.metadata->>'issueDate' or info.nip is distinct from left(p_number,10) or (v_preview->>'gross')::numeric is distinct from (d.metadata->>'grossAmount')::numeric or v_preview->>'currency' is distinct from d.metadata->>'currency' then raise exception 'XML nie zgadza się z metadanymi KSeF.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('number',r.number,'issueDate',r.issued,'ksefNumber',nullif(r.ksef,''))),'[]') into v_refs
 from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="DaneFaKorygowanej"]' passing doc columns
  number text path '*[local-name()="NrFaKorygowanej"]',issued text path '*[local-name()="DataWystFaKorygowanej"]',ksef text path '*[local-name()="NrKSeFFaKorygowanej"]') r;
 -- Before/after corrections carry positive quantities on both sides; preserve their sign.
 v_preview:=jsonb_set(v_preview,'{items}',coalesce((select jsonb_agg(i||jsonb_build_object('before',exists(select 1 from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="FaWiersz"]' passing doc columns idx for ordinality,before text path '*[local-name()="StanPrzed"]') x where x.idx=(i->>'index')::integer and x.before='1')) order by (i->>'index')::integer) from jsonb_array_elements(v_preview->'items') i),'[]'));
 update public.rs_ksef_documents set preview=v_preview,refs=v_refs,metadata=jsonb_set(metadata,'{invoiceType}',to_jsonb(info.kind)) where owner_id=auth.uid() and ksef_number=p_number;
end;$$;

create function public.rs_ksef_document_index() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('metadata',metadata,'references',refs,'hasPreview',preview is not null)) from public.rs_ksef_documents),'[]');
end;$$;

-- Only a single explicit invoice and an unambiguous product name/unit can change stock.
-- Price-only corrections (zero quantity difference) never remove pieces.
create function public.rs_ksef_correction_returns(p_number text,p_index integer) returns numeric language sql stable security invoker set search_path='' as $$
 with original as (
  select d.metadata,d.preview,i from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i
  where d.ksef_number=p_number and (i->>'index')::integer=p_index
 ), corrections as (
  select c.* from public.rs_ksef_documents c,original o where c.metadata->>'invoiceType' ilike 'kor%' and jsonb_array_length(c.refs)=1
  and (upper(c.refs#>>'{0,ksefNumber}')=upper(p_number) or (c.refs#>>'{0,ksefNumber}' is null and c.refs#>>'{0,number}'=o.metadata->>'invoiceNumber' and c.refs#>>'{0,issueDate}'=o.metadata->>'issueDate' and c.metadata#>>'{seller,nip}'=o.metadata#>>'{seller,nip}'))
 ), deltas as (
  select c.ksef_number,sum((case when coalesce((x->>'before')::boolean,false) then -1 else 1 end)*(x->>'quantity')::numeric) delta
  from corrections c cross join lateral jsonb_array_elements(c.preview->'items') x,original o
  where lower(trim(x->>'name'))=lower(trim(o.i->>'name')) and coalesce(x->>'unit','')=coalesce(o.i->>'unit','')
  and 1=(select count(*) from jsonb_array_elements(o.preview->'items') y where lower(trim(y->>'name'))=lower(trim(x->>'name')) and coalesce(y->>'unit','')=coalesce(x->>'unit',''))
  group by c.ksef_number
 ) select coalesce(sum(greatest(0,-delta)),0) from deltas;
$$;

create function public.rs_ksef_stock_deduction(p_number text,p_index integer) returns numeric language sql stable security invoker set search_path='' as $$
 select greatest(coalesce((select quantity from public.rs_ksef_returns where ksef_number=p_number and item_index=p_index),0),public.rs_ksef_correction_returns(p_number,p_index));
$$;

create function public.rs_ksef_stock() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb:='[]';d record;i jsonb;capacity numeric;assigned numeric;manual numeric;corrected numeric;returned numeric;available numeric;warning text; rev bigint;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 for d in select * from public.rs_ksef_documents where preview is not null and (preview->>'canSelect')::boolean and metadata->>'invoiceType' not ilike 'kor%' loop
  for i in select value from jsonb_array_elements(d.preview->'items') where (value->>'quantity')::numeric>0 and (value->>'gross')::numeric>=0 loop
   capacity:=(i->>'quantity')::numeric;
   select coalesce(sum((e->>'quantity')::numeric),0) into assigned from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e where l.ksef_number=d.ksef_number and l.kind='purchases' and e->>'index'=i->>'index';
   if exists(select 1 from public.cf_purchases where source_ksef_number=d.ksef_number and source_ksef_index=(i->>'index')::integer) then assigned:=assigned+capacity;end if;
   select quantity,revision into manual,rev from public.rs_ksef_returns where ksef_number=d.ksef_number and item_index=(i->>'index')::integer;
   manual:=coalesce(manual,0);rev:=coalesce(rev,0);corrected:=public.rs_ksef_correction_returns(d.ksef_number,(i->>'index')::integer);returned:=greatest(manual,corrected);available:=greatest(0,capacity-assigned-returned);
   warning:='';
   if exists(select 1 from public.rs_ksef_documents c cross join lateral jsonb_array_elements(c.refs) r where c.metadata->>'invoiceType' ilike 'kor%' and (upper(r->>'ksefNumber')=upper(d.ksef_number) or (r->>'ksefNumber' is null and r->>'number'=d.metadata->>'invoiceNumber' and r->>'issueDate'=d.metadata->>'issueDate' and c.metadata#>>'{seller,nip}'=d.metadata#>>'{seller,nip}')) and (jsonb_array_length(c.refs)>1 or jsonb_array_length(c.preview->'items')=0)) then warning:='Korekta zbiorcza: sprawdź PDF i oznacz zwrócone ilości ręcznie.';end if;
   if available>0 or manual>0 or capacity-assigned-returned<0 then result:=result||jsonb_build_array(jsonb_build_object('metadata',d.metadata,'item',i,'capacity',capacity,'assigned',assigned,'manualReturned',manual,'correctedReturned',corrected,'returned',returned,'available',available,'revision',rev,'conflict',capacity-assigned-returned<0,'warning',warning));end if;
  end loop;
 end loop;
 return result;
end;$$;

create function public.rs_ksef_set_return(p_number text,p_index integer,p_quantity numeric,p_revision bigint) returns void language plpgsql security invoker set search_path='' as $$
declare current_quantity numeric;current_revision bigint;row jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select quantity,revision into current_quantity,current_revision from public.rs_ksef_returns where ksef_number=p_number and item_index=p_index for update;
 if coalesce(current_revision,0) is distinct from p_revision then raise exception 'Stan zmienił się. Odśwież Towar.';end if;
 select x into row from jsonb_array_elements(public.rs_ksef_stock()) x where x#>>'{metadata,ksefNumber}'=p_number and (x#>>'{item,index}')::integer=p_index;
 if row is null or p_quantity is null or p_quantity<0 or p_quantity<>round(p_quantity,6) or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowy zwrot.';end if;
 -- Additional manual returns include quantities already confirmed by corrections.
 if p_quantity>greatest(coalesce(current_quantity,0),(row->>'correctedReturned')::numeric)+(row->>'available')::numeric then raise exception 'Zwrot przekracza dostępną ilość.';end if;
 insert into public.rs_ksef_returns(owner_id,ksef_number,item_index,quantity) values(auth.uid(),p_number,p_index,p_quantity)
 on conflict(owner_id,ksef_number,item_index) do update set quantity=excluded.quantity,revision=rs_ksef_returns.revision+1;
end;$$;

revoke all on function public.rs_ksef_store_metadata(jsonb),public.rs_ksef_store_xml(text,text),public.rs_ksef_document_index(),public.rs_ksef_correction_returns(text,integer),public.rs_ksef_stock_deduction(text,integer),public.rs_ksef_stock(),public.rs_ksef_set_return(text,integer,numeric,bigint) from public,anon;
grant execute on function public.rs_ksef_store_metadata(jsonb),public.rs_ksef_store_xml(text,text),public.rs_ksef_document_index(),public.rs_ksef_correction_returns(text,integer),public.rs_ksef_stock_deduction(text,integer),public.rs_ksef_stock(),public.rs_ksef_set_return(text,integer,numeric,bigint) to authenticated;

create function public.rs_ksef_guard_stock_allocation() returns trigger language plpgsql security invoker set search_path='' as $$
declare e jsonb;i jsonb;used numeric;capacity numeric;
begin
 if tg_table_name='cf_purchases' then
  if new.source_ksef_number is not null then
   perform pg_advisory_xact_lock(hashtextextended(new.source_ksef_number,0));
   if public.rs_ksef_stock_deduction(new.source_ksef_number,new.source_ksef_index)>0 then raise exception 'Pozycja zawiera zwrócony towar. Nie można przypisać całej pozycji do CleanFleet.';end if;
  end if;
 else
  if new.kind<>'purchases' or coalesce((new.document->>'referenceOnly')::boolean,false) then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended(new.ksef_number,0));
  for e in select value from jsonb_array_elements(public.rs_ksef_entries(new.document,new.items)) loop
   select x into i from jsonb_array_elements(new.items) with ordinality a(x,ord) where coalesce((x->>'index')::integer,ord)=(e->>'index')::integer;
   capacity:=case when (i->>'quantity')::numeric>0 then (i->>'quantity')::numeric else 1 end;
   select coalesce(sum((x->>'quantity')::numeric),0) into used from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) x where l.ksef_number=new.ksef_number and l.kind='purchases' and l.project_id<>new.project_id and x->>'index'=e->>'index';
   if used+(e->>'quantity')::numeric+public.rs_ksef_stock_deduction(new.ksef_number,(e->>'index')::integer)>capacity then raise exception 'Przypisanie przekracza stan po odjęciu zwrotów. Odśwież pozycje faktury.';end if;
  end loop;
 end if;
 return new;
end;$$;
create trigger rs_ksef_guard_stock_allocation before insert or update on public.rs_ksef_links for each row execute function public.rs_ksef_guard_stock_allocation();
create trigger cf_ksef_guard_stock_allocation before insert or update on public.cf_purchases for each row execute function public.rs_ksef_guard_stock_allocation();
revoke all on function public.rs_ksef_guard_stock_allocation() from public,anon,authenticated;

-- All allocation entry points, including old clients, subtract returned stock.
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
  used:=used+public.rs_ksef_stock_deduction(p_number,(e->>'index')::integer);
  used_gross:=used_gross+round((i->>'gross')::numeric*public.rs_ksef_stock_deduction(p_number,(e->>'index')::integer)/capacity,2);
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
 return jsonb_build_object('links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('project_name',p.payload->>'name')) from public.rs_ksef_links l join public.rs_projects p on p.id=l.project_id where l.ksef_number=p_number and l.kind='purchases'),'[]')||coalesce((select jsonb_build_array(jsonb_build_object('kind','purchases','project_id',null,'project_name','Zwrócono (w tym korekty)','document',jsonb_build_object('selectedQuantities',jsonb_agg(jsonb_build_object('index',i->'index','quantity',public.rs_ksef_stock_deduction(p_number,(i->>'index')::integer),'gross',round((i->>'gross')::numeric*public.rs_ksef_stock_deduction(p_number,(i->>'index')::integer)/(i->>'quantity')::numeric,2)))))) from public.rs_ksef_documents d cross join lateral jsonb_array_elements(d.preview->'items') i where d.ksef_number=p_number and (i->>'quantity')::numeric>0 and public.rs_ksef_stock_deduction(p_number,(i->>'index')::integer)>0 having count(*)>0),'[]'::jsonb),
 'blocked',coalesce((select jsonb_agg(source_ksef_index) from public.cf_purchases where source_ksef_number=p_number),'[]'));
end;$$;

