-- Keep fully corrected purchases visible in the Returned stock filter.
create or replace function public.rs_ksef_stock() returns jsonb language plpgsql security invoker set search_path='' as $$
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
   if available>0 or returned>0 or capacity-assigned-returned<0 then result:=result||jsonb_build_array(jsonb_build_object('metadata',d.metadata,'item',i,'capacity',capacity,'assigned',assigned,'manualReturned',manual,'correctedReturned',corrected,'returned',returned,'available',available,'revision',rev,'conflict',capacity-assigned-returned<0,'warning',warning));end if;
  end loop;
 end loop;
 return result;
end;$$;

