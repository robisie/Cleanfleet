-- A checked NIP receipt is a warehouse source, never a KSeF invoice. Its scan is not stored.
create unique index rs_receipt_content_once on public.rs_ksef_documents(owner_id,(metadata->>'sourceHash')) where metadata->>'source'='nip-receipt';
create unique index rs_receipt_identity_once on public.rs_ksef_documents(owner_id,(metadata#>>'{seller,nip}'),(metadata->>'issueDate'),(metadata->>'invoiceNumber'),(metadata->>'grossAmount')) where metadata->>'source'='nip-receipt';

create function public.rs_receipt_save(p_hash text,p_data jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare i jsonb;items jsonb:='[]';n numeric;gross numeric;total numeric;idx integer:=0;number text;docdate date;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_data is null or jsonb_typeof(p_data)<>'object' or coalesce(p_data->>'buyerNip','')<>'6351861297' or coalesce(p_data->>'sellerNip','')!~'^[0-9]{10}$' or p_data->>'sellerNip'='6351861297'
 or length(trim(coalesce(p_data->>'seller','')))<2 or length(trim(coalesce(p_data->>'seller','')))>200 or length(trim(coalesce(p_data->>'number','')))<1 or length(trim(coalesce(p_data->>'number','')))>100 or coalesce(p_data->>'date','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 or coalesce(jsonb_typeof(p_data->'items'),'')<>'array' then raise exception 'Sprawdź datę, numer, oba NIP-y, sklep i pozycje paragonu.';end if;
 if jsonb_array_length(p_data->'items') not between 1 and 80 then raise exception 'Paragon musi zawierać od 1 do 80 pozycji.';end if;
 begin docdate:=(p_data->>'date')::date;total:=(p_data->>'total')::numeric;exception when others then raise exception 'Nieprawidłowa data lub kwota paragonu.';end;
 if docdate is null or total is null or docdate>current_date+1 or docdate<date '2000-01-01' or total<0 or total>1000000 or total::text in ('NaN','Infinity','-Infinity') or total<>round(total,2) then raise exception 'Nieprawidłowa data lub kwota paragonu.';end if;
 for i in select value from jsonb_array_elements(p_data->'items') loop
  idx:=idx+1;
  begin n:=(i->>'quantity')::numeric;gross:=(i->>'gross')::numeric;exception when others then raise exception 'Sprawdź ilość i cenę pozycji %.',idx;end;
  if length(trim(coalesce(i->>'name',''))) not between 2 and 200 or length(trim(coalesce(i->>'unit',''))) not between 1 and 25 or n is null or gross is null or n<=0 or n>1000000 or n<>round(n,6) or n::text in ('NaN','Infinity','-Infinity') or gross<0 or gross>1000000 or gross<>round(gross,2) or gross::text in ('NaN','Infinity','-Infinity') then raise exception 'Sprawdź pozycję %.',idx;end if;
  items:=items||jsonb_build_array(jsonb_build_object('index',idx,'name',trim(i->>'name'),'quantity',n,'unit',trim(i->>'unit'),'gross',gross));
 end loop;
 if (select sum((v->>'gross')::numeric) from jsonb_array_elements(items) v)<>total then raise exception 'Suma pozycji musi być równa kwocie paragonu.';end if;
 if exists(select 1 from public.rs_ksef_documents where owner_id=auth.uid() and metadata->>'source'='nip-receipt' and (metadata->>'sourceHash'=p_hash or (metadata#>>'{seller,nip}'=p_data->>'sellerNip' and metadata->>'issueDate'=p_data->>'date' and metadata->>'invoiceNumber'=p_data->>'number' and (metadata->>'grossAmount')::numeric=total))) then raise exception 'Ten paragon jest już w magazynie. Wyszukaj go po numerze.';end if;
 number:='PARAGON-'||gen_random_uuid()::text;
 insert into public.rs_ksef_documents(owner_id,ksef_number,metadata,preview) values(auth.uid(),number,
 jsonb_build_object('source','nip-receipt','sourceHash',p_hash,'ksefNumber',number,'invoiceNumber',trim(p_data->>'number'),'issueDate',docdate,'grossAmount',total,'currency','PLN','invoiceType','RECEIPT','seller',jsonb_build_object('name',trim(p_data->>'seller'),'nip',p_data->>'sellerNip'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value',p_data->>'buyerNip'))),
 jsonb_build_object('items',items,'gross',total,'currency','PLN','canSelect',true));
 return number;
end;$$;
revoke all on function public.rs_receipt_save(text,jsonb) from public,anon;
grant execute on function public.rs_receipt_save(text,jsonb) to authenticated;

-- The KSeF synchronizer must never request XML for a manually uploaded receipt.
create or replace function public.rs_ksef_document_index() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('metadata',metadata,'references',refs,'hasPreview',preview is not null)) from public.rs_ksef_documents where owner_id=auth.uid() and metadata->>'source' is distinct from 'nip-receipt'),'[]');
end;$$;

-- CleanFleet uses are recorded in the shared stock ledger without inventing a KSeF cost document.
alter table public.rs_ksef_stock_uses drop constraint rs_ksef_stock_uses_category_check;
alter table public.rs_ksef_stock_uses add constraint rs_ksef_stock_uses_category_check check(category in ('auto','firmowe','cleanfleet'));
create or replace function public.rs_ksef_set_use(p_number text,p_index integer,p_category text,p_quantity numeric,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_quantity numeric;current_revision bigint;item jsonb;capacity numeric;allocated numeric;remaining numeric;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_category not in ('auto','firmowe','cleanfleet') or (p_category='cleanfleet' and (select metadata->>'source' from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number) is distinct from 'nip-receipt')
 or p_index is null or p_index<=0 or p_quantity is null or p_quantity<0 or p_quantity<>round(p_quantity,6) or p_quantity>1000000000 or p_revision is null then raise exception 'Nieprawidłowe przypisanie.';end if;
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

create or replace function public.rs_ksef_stock() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb:='[]';d record;i jsonb;capacity numeric;assigned numeric;project_assigned numeric;cf_assigned numeric;manual numeric;auto_used numeric;company_used numeric;cf_used numeric;corrected numeric;returned numeric;available numeric;warning text;rev bigint;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 for d in select * from public.rs_ksef_documents where owner_id=auth.uid() and preview is not null and (preview->>'canSelect')::boolean and metadata->>'invoiceType' not ilike 'kor%' loop
  for i in select value from jsonb_array_elements(d.preview->'items') where (value->>'quantity')::numeric>0 and (value->>'gross')::numeric>=0 loop
   capacity:=(i->>'quantity')::numeric;
   select coalesce(sum((e->>'quantity')::numeric),0) into assigned from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e where l.ksef_number=d.ksef_number and l.kind='purchases' and e->>'index'=i->>'index';
   project_assigned:=assigned;cf_assigned:=0;
   if exists(select 1 from public.cf_purchases where source_ksef_number=d.ksef_number and source_ksef_index=(i->>'index')::integer) then cf_assigned:=capacity;assigned:=assigned+capacity;end if;
   select coalesce(sum(quantity) filter(where category='auto'),0),coalesce(sum(quantity) filter(where category='firmowe'),0),coalesce(sum(quantity) filter(where category='cleanfleet'),0) into auto_used,company_used,cf_used from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=d.ksef_number and item_index=(i->>'index')::integer;
   cf_assigned:=cf_assigned+cf_used;assigned:=assigned+auto_used+company_used+cf_used;
   select quantity,revision into manual,rev from public.rs_ksef_returns where owner_id=auth.uid() and ksef_number=d.ksef_number and item_index=(i->>'index')::integer;
   manual:=coalesce(manual,0);rev:=coalesce(rev,0);corrected:=public.rs_ksef_correction_returns(d.ksef_number,(i->>'index')::integer);returned:=greatest(manual,corrected);available:=greatest(0,capacity-assigned-returned);
   warning:='';
   if exists(select 1 from public.rs_ksef_documents c cross join lateral jsonb_array_elements(c.refs) r where c.metadata->>'invoiceType' ilike 'kor%' and (upper(r->>'ksefNumber')=upper(d.ksef_number) or (r->>'ksefNumber' is null and r->>'number'=d.metadata->>'invoiceNumber' and r->>'issueDate'=d.metadata->>'issueDate' and c.metadata#>>'{seller,nip}'=d.metadata#>>'{seller,nip}')) and (jsonb_array_length(c.refs)>1 or jsonb_array_length(c.preview->'items')=0)) then warning:='Korekta zbiorcza: sprawdź PDF i oznacz zwrócone ilości ręcznie.';end if;
   result:=result||jsonb_build_array(jsonb_build_object('metadata',d.metadata,'item',i,'capacity',capacity,'assigned',assigned,'projectAssigned',project_assigned,'cleanfleetAssigned',cf_assigned,'classifiedAuto',auto_used,'classifiedCompany',company_used,'uses',coalesce((select jsonb_object_agg(category,jsonb_build_object('quantity',quantity,'revision',revision)) from public.rs_ksef_stock_uses where owner_id=auth.uid() and ksef_number=d.ksef_number and item_index=(i->>'index')::integer),'{}'::jsonb),'manualReturned',manual,'correctedReturned',corrected,'returned',returned,'available',available,'revision',rev,'conflict',capacity-assigned-returned<0,'warning',warning));
  end loop;
 end loop;
 return result;
end;$$;

create function public.rs_receipt_assign_project(p_number text,p_project uuid,p_entries jsonb,p_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.rs_ksef_documents;p public.rs_projects;choice jsonb;purchase jsonb;document jsonb;result public.rs_projects;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into d from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number and metadata->>'source'='nip-receipt';
 if d.ksef_number is null then raise exception 'Nie znaleziono paragonu.';end if;
 select * into p from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if p.id is null or p.revision is distinct from p_revision then raise exception 'Inwestycja zmieniła się. Odśwież magazyn.';end if;
 if exists(select 1 from public.rs_ksef_links where ksef_number=p_number and project_id=p_project) or exists(select 1 from jsonb_array_elements(coalesce(p.payload->'purchases','[]')) x where x->>'sourceReceiptId'=p_number or (x->>'invoice'=d.metadata->>'invoiceNumber' and lower(x->>'shop')=lower(d.metadata#>>'{seller,name}'))) then raise exception 'Ten paragon jest już przypisany do inwestycji. Sprawdź duplikat.';end if;
 choice:=public.rs_ksef_select_quantities(p_number,p_project,d.preview,p_entries);
 purchase:=jsonb_build_object('id',gen_random_uuid(),'date',d.metadata->>'issueDate','shop',d.metadata#>>'{seller,name}','invoice',d.metadata->>'invoiceNumber','description',choice->>'description','amount',choice->'total','charge',choice->'total','paid',false,'paidAmount',0,'documentType','nip-receipt','sourceReceiptId',p_number,'supplierNip',d.metadata#>>'{seller,nip}','invoiceItems',choice->'items','selectedKsefRows',choice->'indices','selectedKsefQuantities',choice->'entries','invoiceGrossAmount',d.preview->'gross','allocatedInvoiceAmount',choice->'total');
 perform public.rs_validate_purchase_sources(jsonb_set(p.payload,'{purchases}',coalesce(p.payload->'purchases','[]')||jsonb_build_array(purchase)));
 document:=jsonb_build_object('id',gen_random_uuid(),'number',d.metadata->>'invoiceNumber','sourceReceipt',true,'originKind','purchases','grossAmount',d.preview->'gross','selectedIndices',choice->'indices','selectedQuantities',choice->'entries','selectedItems',choice->'items','payload',jsonb_build_object('currency','PLN','issueDate',d.metadata->>'issueDate','seller',d.metadata->'seller'));
 insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document,items) values(p_number,p_project,auth.uid(),'purchases',document,d.preview->'items');
 update public.rs_projects set payload=jsonb_set(payload-'_undo','{purchases}',coalesce(payload->'purchases','[]')||jsonb_build_array(purchase)),revision=revision+1,updated_at=now() where id=p_project returning * into result;
 return jsonb_build_object('project',to_jsonb(result),'purchase',purchase);
end;$$;
revoke all on function public.rs_receipt_assign_project(text,uuid,jsonb,bigint) from public,anon;
grant execute on function public.rs_receipt_assign_project(text,uuid,jsonb,bigint) to authenticated;

create function public.rs_receipt_assign_cleanfleet(p_number text,p_indices integer[]) returns void
language plpgsql security invoker set search_path='' as $$
declare d public.rs_ksef_documents;i jsonb;indices integer[];
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into d from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number and metadata->>'source'='nip-receipt';
 select array_agg((x->>'index')::integer order by (x->>'index')::integer) into indices from jsonb_array_elements(d.preview->'items') x;
 if d.ksef_number is null or p_indices is null or indices is distinct from (select array_agg(x order by x) from unnest(p_indices) x) then raise exception 'Pozycje paragonu zmieniły się. Odśwież magazyn.';end if;
 for i in select value from jsonb_array_elements(d.preview->'items') loop
  perform public.rs_ksef_set_use(p_number,(i->>'index')::integer,'cleanfleet',(i->>'quantity')::numeric,0);
 end loop;
end;$$;
revoke all on function public.rs_receipt_assign_cleanfleet(text,integer[]) from public,anon;
grant execute on function public.rs_receipt_assign_cleanfleet(text,integer[]) to authenticated;
