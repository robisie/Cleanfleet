-- Existing purchases keep their reservation; subsequent imports may use the remainder.
alter table public.rs_ksef_links drop constraint rs_ksef_links_pkey;
alter table public.rs_ksef_links add primary key(ksef_number,project_id);
create unique index rs_ksef_sales_one_project on public.rs_ksef_links(ksef_number) where kind='sales';

create function public.rs_ksef_entries(p_document jsonb,p_items jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select coalesce(nullif(p_document->'selectedQuantities','null'),
 (select coalesce(jsonb_agg(jsonb_build_object('index',coalesce(i->'index',to_jsonb(ord)),'quantity',case when (i->>'quantity')::numeric>0 then (i->>'quantity')::numeric else 1 end,'gross',i->'gross') order by ord),'[]')
 from jsonb_array_elements(p_items) with ordinality a(i,ord) where p_document->'selectedIndices' is null or p_document->'selectedIndices'='null' or p_document->'selectedIndices' @> jsonb_build_array(coalesce(i->'index',to_jsonb(ord)))));
$$;

create function public.rs_ksef_allocation_context(p_number text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return jsonb_build_object('links',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('project_name',p.payload->>'name')) from public.rs_ksef_links l join public.rs_projects p on p.id=l.project_id where l.ksef_number=p_number and l.kind='purchases'),'[]'),
 'blocked',coalesce((select jsonb_agg(source_ksef_index) from public.cf_purchases where source_ksef_number=p_number),'[]'));
end;$$;

create function public.rs_ksef_select_quantities(p_number text,p_project uuid,p_preview jsonb,p_entries jsonb)
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

create function public.rs_allocate_ksef_purchase(p_project uuid,p_number text,p_xml text,p_entries jsonb,p_revision bigint,p_expected_document jsonb default null,p_replace_purchase uuid default null,p_payload jsonb default null,p_bill_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; link public.rs_ksef_links; result public.rs_projects; preview jsonb; choice jsonb; d record; purchase jsonb; old_purchase jsonb; payload jsonb; normalized jsonb; purchaseid uuid; reference_only boolean;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_number is null or p_number!~*'^\d{10}-\d{8}-[a-f0-9]{12}-[a-f0-9]{2}$' then raise exception 'Nieprawidłowy numer KSeF.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if project.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 if p_revision is null or project.revision<>p_revision then raise exception 'RS_CONFLICT: Inwestycja zmieniła się. Otwórz przypisanie ponownie.';end if;
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project and owner_id=auth.uid() for update;
 if link.document is distinct from p_expected_document then raise exception 'RS_CONFLICT: Przypisanie faktury zmieniło się. Odśwież widok.';end if;
 if link.ksef_number is not null and link.kind<>'purchases' then raise exception 'To jest faktura sprzedażowa.';end if;
 if exists(select 1 from public.rs_ksef_links where ksef_number=p_number and kind='sales') then raise exception 'Dokument jest już przypisany jako sprzedażowy.';end if;
 if p_xml is null and link.ksef_number is not null then
  preview:=jsonb_build_object('items',link.items,'gross',link.document->'grossAmount','currency',link.document#>'{payload,currency}','canSelect',coalesce((link.document->>'quantitySelectable')::boolean,(select count(*)>0 and bool_and(i->'gross'<>'null'::jsonb) and sum((i->>'gross')::numeric)=(link.document->>'grossAmount')::numeric from jsonb_array_elements(link.items) i)));
 else
  preview:=public.rs_ksef_purchase_preview(p_xml);
  select * into d from xmltable('/*[local-name()="Faktura"]' passing xmlparse(document p_xml) columns
   invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',issue_date date path '*[local-name()="Fa"]/*[local-name()="P_1"]',kind text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
   seller text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]',seller_address text path '*[local-name()="Podmiot1"]/*[local-name()="Adres"]/*[local-name()="AdresL1"]',buyer text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',due_date text path '*[local-name()="Fa"]/*[local-name()="Platnosc"]/*[local-name()="TerminPlatnosci"][1]/*[local-name()="Termin"]');
  if d.seller_nip is distinct from left(p_number,10) or d.invoice_number is null or d.issue_date is null or d.seller is null then raise exception 'Nieprawidłowe dane faktury.';end if;
  if link.ksef_number is not null and (d.invoice_number is distinct from link.document->>'number' or preview->'gross' is distinct from link.document->'grossAmount' or preview->>'currency' is distinct from link.document#>>'{payload,currency}' or preview->'items' is distinct from link.items) then raise exception 'XML nie zgadza się z przypisaną fakturą.';end if;
 end if;
 reference_only:=preview->>'currency'<>'PLN' or (preview->>'gross')::numeric<0 or coalesce(link.document->>'referenceOnly','false')='true';
 if p_xml is not null then reference_only:=reference_only or coalesce(d.kind,'') like 'KOR%';end if;
 if reference_only then raise exception 'Podział zakupów obsługuje faktury w PLN. Korekty i waluty obce wymagają osobnego rozliczenia.';end if;
 choice:=public.rs_ksef_select_quantities(p_number,p_project,preview,p_entries);
 if link.ksef_number is not null then
  select x into old_purchase from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=p_number;
  if old_purchase is null then raise exception 'Nie znaleziono powiązanego zakupu. Odłącz dokument przed ponownym importem.';end if;
 elsif p_replace_purchase is not null then
  select x into old_purchase from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'id'=p_replace_purchase::text;
  if old_purchase is null or nullif(old_purchase->>'sourceKsefNumber','') is not null or (old_purchase->>'amount')::numeric is distinct from (choice->>'total')::numeric then raise exception 'Zakup nie pasuje do wybranych pozycji faktury.';end if;
 end if;
 purchaseid:=coalesce((old_purchase->>'id')::uuid,gen_random_uuid());
 if p_payload is not null then
  if old_purchase is null or jsonb_typeof(p_payload)<>'object' or (select count(*) from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=purchaseid::text)<>1 then raise exception 'Nieprawidłowe dane zakupu.';end if;
  select x into purchase from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=purchaseid::text;
  if purchase->>'sourceKsefNumber' is distinct from p_number then raise exception 'Nie można zmienić źródła zakupu.';end if;
  payload:=p_payload-'_undo';
 else
  payload:=project.payload-'_undo';
  if old_purchase is not null then
   purchase:=old_purchase;
   if link.ksef_number is not null and (select jsonb_agg(e-'gross' order by (e->>'index')::integer) from jsonb_array_elements(public.rs_ksef_entries(link.document,link.items)) e) is distinct from (select jsonb_agg(e-'gross' order by (e->>'index')::integer) from jsonb_array_elements(choice->'entries') e) then purchase:=purchase||jsonb_build_object('amount',choice->'total','charge',choice->'total');end if;
  else
   purchase:=jsonb_build_object('id',purchaseid,'date',d.issue_date,'shop',d.seller,'invoice',d.invoice_number,'amount',choice->'total','charge',choice->'total','paid',false,'paidAmount',0,'supplierNip',d.seller_nip,'supplierAddress',d.seller_address,'dueDate',d.due_date);
  end if;
 end if;
 if (purchase->>'amount')::numeric is null or (purchase->>'amount')::numeric<0 or (purchase->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowa kwota zakupu.';end if;
 purchase:=purchase||jsonb_build_object('sourceKsefNumber',p_number,'documentType','invoice','description',choice->'description','selectedKsefRows',choice->'indices','selectedKsefQuantities',choice->'entries','invoiceItems',choice->'items','invoiceGrossAmount',preview->'gross','allocatedInvoiceAmount',choice->'total');
 if old_purchase is not null then
  payload:=jsonb_set(payload,'{purchases}',(select jsonb_agg(case when x->>'id'=purchaseid::text then purchase else x end order by ord) from jsonb_array_elements(payload->'purchases') with ordinality a(x,ord)));
 else payload:=jsonb_set(payload,'{purchases}',coalesce(payload->'purchases','[]')||jsonb_build_array(purchase));end if;
 if old_purchase is not null and (purchase->>'charge')::numeric<coalesce((old_purchase->>'charge')::numeric,0) and (select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(coalesce(payload->'invoiceSettlements','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'allocations','[]')) a where a->>'kind'='purchase' and a->>'id'=purchaseid::text)>(purchase->>'charge')::numeric then raise exception 'Koszt jest niższy niż przypisane należności. Najpierw zmień rozliczenie zakupu.';end if;
 perform public.rs_validate_purchase_sources(payload);
 if link.ksef_number is null then
  normalized:=jsonb_build_object('id',coalesce(p_bill_id,gen_random_uuid()),'number',d.invoice_number,'status','accepted','ksef_number',p_number,'originKind','purchases','externalKsef',true,'sourceBillId',p_bill_id,'referenceOnly',false,'grossAmount',preview->'gross',
   'payload',jsonb_build_object('brand','robisie','currency',preview->>'currency','issueDate',d.issue_date,'dueDate',d.due_date,'buyer',jsonb_build_object('name',d.buyer,'nip','6351861297'),'seller',jsonb_build_object('name',d.seller,'nip',d.seller_nip,'address',d.seller_address),'source',jsonb_build_object('app','robisie','id',p_project),'lines',jsonb_build_array(jsonb_build_object('name',d.invoice_number,'qty','1','price',preview->>'gross','unit','kpl'))));
 else normalized:=link.document;end if;
 normalized:=normalized||jsonb_build_object('selectedIndices',choice->'indices','selectedQuantities',choice->'entries','selectedItems',choice->'items','importedAmount',choice->'total','quantitySelectable',preview->'canSelect');
 insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document,items) values(p_number,p_project,auth.uid(),'purchases',normalized,preview->'items')
 on conflict(ksef_number,project_id) do update set document=excluded.document,items=excluded.items returning * into link;
 result:=public.rs_save_project(p_project,payload,p_revision);
 return jsonb_build_object('link',to_jsonb(link),'project',to_jsonb(result));
end;$$;
revoke all on function public.rs_ksef_entries(jsonb,jsonb),public.rs_ksef_allocation_context(text),public.rs_ksef_select_quantities(text,uuid,jsonb,jsonb),public.rs_allocate_ksef_purchase(uuid,text,text,jsonb,bigint,jsonb,uuid,jsonb,uuid) from public,anon;
grant execute on function public.rs_ksef_entries(jsonb,jsonb),public.rs_ksef_allocation_context(text),public.rs_ksef_select_quantities(text,uuid,jsonb,jsonb),public.rs_allocate_ksef_purchase(uuid,text,text,jsonb,bigint,jsonb,uuid,jsonb,uuid) to authenticated;

-- Old cached clients use these wrappers; every write still validates global reservations.
create function public.rs_ksef_legacy_entries(p_xml text,p_indices integer[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare preview jsonb;
begin
 preview:=public.rs_ksef_purchase_preview(p_xml);
 if p_indices is not null and (cardinality(p_indices)=0 or cardinality(p_indices)<>(select count(distinct n) from unnest(p_indices) n) or array_position(p_indices,null) is not null or exists(select 1 from unnest(p_indices) n where not exists(select 1 from jsonb_array_elements(preview->'items') i where (i->>'index')::integer=n))) then raise exception 'Nieprawidłowe pozycje.';end if;
 return public.rs_ksef_entries(jsonb_build_object('selectedIndices',to_jsonb(p_indices)),preview->'items');
end;$$;
create or replace function public.rs_import_ksef_purchase(p_project uuid,p_number text,p_xml text,p_indices integer[],p_bill_id uuid,p_expected_revision bigint,p_replace_purchase uuid default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare result jsonb; link public.rs_ksef_links; entries jsonb;
begin
 entries:=public.rs_ksef_legacy_entries(p_xml,p_indices);
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project;
 if link.ksef_number is not null then
  if public.rs_ksef_entries(link.document,link.items)<>entries then raise exception 'Faktura została już przypisana z innym wyborem pozycji. Otwórz edycję.';end if;
  return link;
 end if;
 result:=public.rs_allocate_ksef_purchase(p_project,p_number,p_xml,entries,p_expected_revision,null,p_replace_purchase,null,p_bill_id);
 return jsonb_populate_record(null::public.rs_ksef_links,result->'link');
end;$$;
create or replace function public.rs_assign_ksef_selected(p_project uuid,p_number text,p_xml text,p_indices integer[] default null,p_bill_id uuid default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare revision bigint;
begin
 select p.revision into revision from public.rs_projects p where id=p_project and owner_id=auth.uid();
 return public.rs_import_ksef_purchase(p_project,p_number,p_xml,p_indices,p_bill_id,revision,null);
end;$$;
create or replace function public.rs_edit_ksef_purchase(p_project uuid,p_number text,p_xml text,p_indices integer[],p_expected_project uuid,p_expected_indices integer[] default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare link public.rs_ksef_links; revision bigint; result jsonb;
begin
 if p_project is distinct from p_expected_project then raise exception 'Wybierz docelową inwestycję i przypisz dostępne ilości. Aby przenieść zakup, odłącz go najpierw od poprzedniej inwestycji.';end if;
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project;
 if link.document->'selectedIndices' is distinct from to_jsonb(p_expected_indices) then raise exception 'RS_CONFLICT: Odśwież przypisanie.';end if;
 select p.revision into revision from public.rs_projects p where id=p_project and owner_id=auth.uid();
 result:=public.rs_allocate_ksef_purchase(p_project,p_number,p_xml,public.rs_ksef_legacy_entries(p_xml,p_indices),revision,link.document);
 return jsonb_populate_record(null::public.rs_ksef_links,result->'link');
end;$$;
create or replace function public.rs_save_purchase_ksef_form(p_project uuid,p_revision bigint,p_number text,p_xml text,p_indices integer[],p_expected_indices integer[],p_payload jsonb)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare link public.rs_ksef_links; result jsonb;
begin
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project;
 if link.document->'selectedIndices' is distinct from to_jsonb(p_expected_indices) then raise exception 'RS_CONFLICT: Odśwież przypisanie.';end if;
 result:=public.rs_allocate_ksef_purchase(p_project,p_number,p_xml,public.rs_ksef_legacy_entries(p_xml,p_indices),p_revision,link.document,null,p_payload);
 return jsonb_populate_record(null::public.rs_projects,result->'project');
end;$$;
create or replace function public.rs_save_purchase_ksef_settlement(p_project uuid,p_revision bigint,p_number text,p_xml text,p_indices integer[],p_expected_indices integer[],p_payload jsonb)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare link public.rs_ksef_links; result jsonb;
begin
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project;
 if link.document->'selectedIndices' is distinct from to_jsonb(p_expected_indices) then raise exception 'RS_CONFLICT: Odśwież przypisanie.';end if;
 result:=public.rs_allocate_ksef_purchase(p_project,p_number,p_xml,public.rs_ksef_legacy_entries(p_xml,p_indices),p_revision,link.document,null,p_payload);
 return jsonb_populate_record(null::public.rs_projects,result->'project');
end;$$;

create or replace function public.rs_assign_ksef(p_project uuid,p_number text,p_kind text,p_xml text,p_bill_id uuid default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; existing public.rs_ksef_links; result public.rs_ksef_links; doc xml; data record; items jsonb; description text; normalized jsonb; purchase jsonb; docid uuid; purchaseid uuid; reference_only boolean;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_kind='purchases' and (public.rs_ksef_purchase_preview(p_xml)->>'currency')='PLN' and (public.rs_ksef_purchase_preview(p_xml)->>'gross')::numeric>=0 and not xmlexists('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="RodzajFaktury"][starts-with(text(),"KOR")]' passing xmlparse(document p_xml)) then return public.rs_assign_ksef_selected(p_project,p_number,p_xml,null,p_bill_id);end if;
 if p_number is null or p_number!~*'^\d{10}-\d{8}-[a-f0-9]{12}-[a-f0-9]{2}$' or p_kind not in ('sales','purchases') or p_kind is null then raise exception 'Nieprawidłowy dokument KSeF.';end if;
 if p_xml is null or length(p_xml)>10000000 or p_xml~*'<!DOCTYPE|<!ENTITY' then raise exception 'Nieprawidłowy XML.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into existing from public.rs_ksef_links where ksef_number=p_number;
 if existing.ksef_number is not null then
  if existing.project_id<>p_project or existing.kind<>p_kind then raise exception 'Ta faktura jest już przypisana do innej inwestycji lub rodzaju rozliczenia.';end if;
  return existing;
 end if;
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if project.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 doc:=xmlparse(document p_xml);
 select * into data from xmltable('/*[local-name()="Faktura"]' passing doc columns
  invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',
  issue_date date path '*[local-name()="Fa"]/*[local-name()="P_1"]',
  gross numeric path '*[local-name()="Fa"]/*[local-name()="P_15"]',
  currency text path '*[local-name()="Fa"]/*[local-name()="KodWaluty"]',
  invoice_type text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
  seller text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',
  seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]',
  buyer text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',
  buyer_nip text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]',
  seller_address text path '*[local-name()="Podmiot1"]/*[local-name()="Adres"]/*[local-name()="AdresL1"]',
  due_date text path '*[local-name()="Fa"]/*[local-name()="Platnosc"]/*[local-name()="TerminPlatnosci"][1]/*[local-name()="Termin"]'
 );
 if data.invoice_number is null or data.issue_date is null or data.gross is null or data.gross::text in ('NaN','Infinity','-Infinity') or data.seller is null or data.currency is null or data.currency!~'^[A-Z]{3}$' or data.seller_nip is distinct from left(p_number,10) then raise exception 'Brak wymaganych danych faktury.';end if;
 if (p_kind='sales' and data.seller_nip is distinct from '6351861297') or (p_kind='purchases' and data.buyer_nip is distinct from '6351861297') then raise exception 'Faktura nie należy do właściwej strony rozliczenia spółki.';end if;
 select coalesce(jsonb_agg(to_jsonb(i)),'[]'),string_agg(concat_ws(' ',i.name,nullif(i.quantity,''),nullif(i.unit,'')),'; ')
 into items,description from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="FaWiersz"]' passing doc columns
 name text path '*[local-name()="P_7"]',quantity text path '*[local-name()="P_8B"]',unit text path '*[local-name()="P_8A"]',net text path '*[local-name()="P_11"]',vat text path '*[local-name()="P_12"]') i;
 reference_only:=data.currency<>'PLN' or data.gross<0 or coalesce(data.invoice_type,'') like 'KOR%';
 docid:=coalesce(p_bill_id,gen_random_uuid());purchaseid:=gen_random_uuid();
 normalized:=jsonb_build_object('id',docid,'number',data.invoice_number,'status','accepted','ksef_number',p_number,'originKind',p_kind,'externalKsef',true,'sourceBillId',p_bill_id,'referenceOnly',reference_only,
  'payload',jsonb_build_object('brand','robisie','currency',data.currency,'issueDate',data.issue_date,'dueDate',data.due_date,'buyer',jsonb_build_object('name',data.buyer,'nip',data.buyer_nip),'seller',jsonb_build_object('name',data.seller,'nip',data.seller_nip,'address',data.seller_address),'source',jsonb_build_object('app','robisie','id',p_project),'lines',jsonb_build_array(jsonb_build_object('name',coalesce(description,data.invoice_number),'qty','1','price',abs(data.gross)::text,'unit','kpl'))),'grossAmount',data.gross);
 if p_kind='purchases' and not reference_only then
  if exists(select 1 from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=p_number or (x->>'invoice'=data.invoice_number and lower(x->>'shop')=lower(data.seller))) then raise exception 'Ten zakup już istnieje w inwestycji. Sprawdź wcześniejszy wpis przed importem.';end if;
  purchase:=jsonb_build_object('id',purchaseid,'date',data.issue_date,'shop',data.seller,'description',coalesce(description,'Zakup z faktury '||data.invoice_number),'invoice',data.invoice_number,'amount',data.gross,'charge',data.gross,'paid',false,'paidAmount',0,'sourceKsefNumber',p_number,'invoiceItems',items,'supplierNip',data.seller_nip,'supplierAddress',data.seller_address,'dueDate',data.due_date);
  update public.rs_projects set payload=jsonb_set(payload,'{purchases}',coalesce(payload->'purchases','[]')||jsonb_build_array(purchase)),revision=revision+1,updated_at=now() where id=p_project;
 end if;
 insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document,items) values(p_number,p_project,auth.uid(),p_kind,normalized,items) returning * into result;
 return result;
end;$$;

create or replace function public.cf_check_cost_overlap() returns trigger language plpgsql security definer set search_path='' as $$
declare number text; conflict_found boolean;
begin
 if tg_table_name='cf_purchases' then number:=coalesce(new.source_ksef_number,old.source_ksef_number);else number:=coalesce(new.ksef_number,old.ksef_number);end if;
 if number is null then return null;end if;
 select exists(select 1 from public.cf_purchases p join public.rs_ksef_links r on r.ksef_number=p.source_ksef_number where p.source_ksef_number=number and r.kind='purchases' and (r.document->'selectedIndices' is null or r.document->'selectedIndices'='null'::jsonb or r.document->'selectedIndices' @> to_jsonb(array[p.source_ksef_index]))) into conflict_found;
 if exists(select 1 from public.rs_ksef_links l cross join lateral jsonb_array_elements(public.rs_ksef_entries(l.document,l.items)) e
 cross join lateral (select case when (i->>'quantity')::numeric>0 then (i->>'quantity')::numeric else 1 end capacity from jsonb_array_elements(l.items) with ordinality a(i,ord) where coalesce((i->>'index')::integer,ord)= (e->>'index')::integer) c
 where l.ksef_number=number and l.kind='purchases' group by e->>'index' having sum((e->>'quantity')::numeric)>min(c.capacity)) then raise exception 'Przekroczono ilość pozycji z faktury. Odśwież przypisania.';end if;
 if conflict_found then raise exception 'Pozycja faktury jest już kosztem w drugiej aplikacji. Odznacz ją tam przed przeniesieniem.';end if;
 return null;
end;$$;

create or replace function public.cf_ksef_cost_context(p_number text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 select jsonb_build_object('link',to_jsonb(c)-'xml','purchases',coalesce((select jsonb_agg(to_jsonb(p) order by p.source_ksef_index) from public.cf_purchases p where p.source_ksef_number=p_number),'[]')) into result from public.cf_ksef_costs c where c.ksef_number=p_number;
 return coalesce(result,'{"link":null,"purchases":[]}'::jsonb)||jsonb_build_object('blocked',coalesce((select jsonb_agg(distinct e->'index') from public.rs_ksef_links r cross join lateral jsonb_array_elements(public.rs_ksef_entries(r.document,r.items)) e where r.ksef_number=p_number and r.kind='purchases'),'[]'::jsonb));
end;$$;


-- Deleting a purchase releases only that investment's reservation.
grant delete on public.rs_ksef_links to authenticated;
create policy rs_ksef_links_owner_delete on public.rs_ksef_links for delete to authenticated using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create function public.rs_release_removed_ksef_purchases() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 delete from public.rs_ksef_links l where l.project_id=new.id and l.kind='purchases' and exists(select 1 from jsonb_array_elements(coalesce(old.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=l.ksef_number) and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=l.ksef_number);
 return new;
end;$$;
create trigger rs_release_removed_ksef_purchases after update of payload on public.rs_projects for each row execute function public.rs_release_removed_ksef_purchases();
create function public.rs_unassign_ksef_purchase(p_project uuid,p_number text,p_revision bigint) returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; purchase jsonb; payload jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if project.id is null or project.revision is distinct from p_revision then raise exception 'RS_CONFLICT: Odśwież inwestycję.';end if;
 select x into purchase from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=p_number;
 if purchase is not null and (coalesce((purchase->>'paid')::boolean,false) and coalesce((purchase->>'paidAmount')::numeric,0)>0 or exists(select 1 from jsonb_each_text(coalesce(purchase->'invoicePayments','{}')) where value::numeric>0) or exists(select 1 from jsonb_each_text(coalesce(purchase->'receiptPayments','{}')) where value::numeric>0)) then raise exception 'Zakup ma zapisane wpłaty. Najpierw odłącz jego rozliczenia w inwestycji.';end if;
 payload:=jsonb_set(project.payload-'_undo','{purchases}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'sourceKsefNumber' is distinct from p_number),'[]'));
 perform public.rs_validate_purchase_sources(payload);
 project:=public.rs_save_project(p_project,payload,p_revision);
 delete from public.rs_ksef_links where ksef_number=p_number and project_id=p_project and kind='purchases';
 return project;
end;$$;
revoke all on function public.rs_ksef_legacy_entries(text,integer[]),public.rs_release_removed_ksef_purchases(),public.rs_unassign_ksef_purchase(uuid,text,bigint) from public,anon;
grant execute on function public.rs_ksef_legacy_entries(text,integer[]),public.rs_unassign_ksef_purchase(uuid,text,bigint) to authenticated;

-- A generic undo may restore old project JSON. It must not resurrect released stock.
create function public.rs_check_purchase_allocation() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; current_payload jsonb; expected jsonb;
begin
 select payload into current_payload from public.rs_projects where id=new.id;
 for item in select x from jsonb_array_elements(coalesce(current_payload->'purchases','[]')) x where x ? 'selectedKsefQuantities' loop
  select document->'selectedQuantities' into expected from public.rs_ksef_links where ksef_number=item->>'sourceKsefNumber' and project_id=new.id and kind='purchases';
  if expected is distinct from item->'selectedKsefQuantities' then raise exception 'Przypisanie pozycji faktury zmieniło się. Otwórz zakup ponownie zamiast przywracać stare ilości.';end if;
 end loop;
 return null;
end;$$;
create constraint trigger rs_check_purchase_allocation after insert or update on public.rs_projects deferrable initially deferred for each row execute function public.rs_check_purchase_allocation();
revoke all on function public.rs_check_purchase_allocation() from public,anon,authenticated;

revoke all on function public.cf_check_cost_overlap(),public.rs_release_removed_ksef_purchases() from authenticated;
