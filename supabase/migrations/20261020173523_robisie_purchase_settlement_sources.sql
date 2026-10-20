-- Earlier recorded advances are allocations of existing money, not new receipts.
create or replace function public.rs_edit_ksef_purchase(p_project uuid,p_number text,p_xml text,p_indices integer[],p_expected_project uuid,p_expected_indices integer[] default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare preview jsonb; selected jsonb; indices integer[]; all_indices integer[]; selected_total numeric; description text;
 existing public.rs_ksef_links; result public.rs_ksef_links; origin public.rs_projects; destination public.rs_projects;
 purchase jsonb; updated_purchase jsonb; manual_paid numeric; receipt_paid numeric; invoice_paid numeric; planned numeric; identity record;
begin
 preview:=public.rs_ksef_purchase_preview(p_xml);
 select coalesce(array_agg((x->>'index')::integer order by (x->>'index')::integer),'{}') into all_indices from jsonb_array_elements(preview->'items') x;
 indices:=coalesce(p_indices,all_indices);
 if p_indices is not null and (cardinality(indices)=0 or cardinality(indices)<>(select count(distinct n) from unnest(indices) n) or not indices<@all_indices or array_position(indices,null) is not null) then raise exception 'Wybierz poprawne pozycje faktury.';end if;
 select coalesce(array_agg(n order by n),'{}') into indices from unnest(indices) n;
 if not (preview->>'canSelect')::boolean and indices<>all_indices then raise exception 'Nie można wyliczyć kwoty wybranych pozycji z tego dokumentu. Wybierz całą fakturę.';end if;
 select coalesce(jsonb_agg(x order by (x->>'index')::integer),'[]'),sum((x->>'gross')::numeric),string_agg(concat_ws(' ',x->>'name',x->>'quantity',x->>'unit'),'; ' order by (x->>'index')::integer)
 into selected,selected_total,description from jsonb_array_elements(preview->'items') x where (x->>'index')::integer=any(indices);
 if indices=all_indices then selected_total:=(preview->>'gross')::numeric;end if;
 if selected_total is null or selected_total<0 or selected_total>(preview->>'gross')::numeric then
  if (preview->>'canSelect')::boolean then raise exception 'Nieprawidłowa kwota wybranych pozycji.';end if;
 end if;

 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into existing from public.rs_ksef_links where ksef_number=p_number for update;
 if existing.ksef_number is null or existing.kind<>'purchases' then raise exception 'Nie znaleziono przypisanej faktury zakupowej.';end if;
 if existing.project_id is distinct from p_expected_project or existing.document->'selectedIndices' is distinct from to_jsonb(p_expected_indices) then
  raise exception 'RS_CONFLICT: Przypisanie faktury zmieniło się na innym urządzeniu. Odśwież listę KSeF.';
 end if;
 select * into identity from xmltable('/*[local-name()="Faktura"]' passing xmlparse(document p_xml) columns
  invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]');
 if identity.invoice_number is distinct from existing.document->>'number' or identity.seller_nip is distinct from left(p_number,10) or (preview->>'gross')::numeric is distinct from (existing.document->>'grossAmount')::numeric then raise exception 'XML nie zgadza się z przypisaną fakturą.';end if;
 -- Lock both investments in a stable order; do not overwrite concurrent project edits.
 perform id from public.rs_projects where id in (existing.project_id,p_project) and owner_id=auth.uid() order by id for update;
 select * into origin from public.rs_projects where id=existing.project_id and owner_id=auth.uid();
 select * into destination from public.rs_projects where id=p_project and owner_id=auth.uid();
 if origin.id is null or destination.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 if existing.project_id=p_project and coalesce(existing.document->'selectedIndices',to_jsonb(all_indices))=to_jsonb(indices) then return existing;end if;
 if not (existing.document->>'referenceOnly')::boolean then
  select x into purchase from jsonb_array_elements(coalesce(origin.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=p_number;
  if purchase is null then raise exception 'Zakup został usunięty z inwestycji. Nie można automatycznie zmienić jego kwoty.';end if;
  manual_paid:=case when coalesce((purchase->>'paid')::boolean,false) then greatest(0,coalesce((purchase->>'paidAmount')::numeric,(purchase->>'amount')::numeric,0)) else 0 end;
  select coalesce(sum(value::numeric),0) into receipt_paid from jsonb_each_text(coalesce(purchase->'receiptPayments','{}'));
  select coalesce(sum(value::numeric),0) into invoice_paid from jsonb_each_text(coalesce(purchase->'invoicePayments','{}'));
  select coalesce(sum((a->>'amount')::numeric),0) into planned from jsonb_array_elements(coalesce(origin.payload->'invoiceSettlements','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'allocations','[]')) a where a->>'kind'='purchase' and a->>'id'=purchase->>'id';
  if manual_paid+invoice_paid+receipt_paid>selected_total then raise exception 'Wybrane pozycje mają niższą kwotę niż zapisane wpłaty. Najpierw skoryguj rozliczenie zakupu lub powiązanej faktury.';end if;
  if selected_total<coalesce((purchase->>'charge')::numeric,0) and planned>selected_total then raise exception 'Wybrane pozycje mają niższą kwotę niż przypisane należności. Najpierw zmień przypisania w Etapach i płatnościach.';end if;
  updated_purchase:=purchase||jsonb_build_object('amount',selected_total,'charge',selected_total,'description',coalesce(description,purchase->>'description'),'invoiceItems',selected,'selectedKsefRows',to_jsonb(indices),'invoiceGrossAmount',(preview->>'gross')::numeric);
  if existing.project_id<>p_project then
   if manual_paid+invoice_paid+receipt_paid>0 or planned>0 or exists(select 1 from jsonb_array_elements(coalesce(origin.payload->'invoiceSettlements','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'existingReceipts','[]')) receipt where receipt->>'id'='purchase-payment:'||(purchase->>'id')) then raise exception 'Zakup ma zapisane rozliczenia. Odłącz je przed przeniesieniem do innej inwestycji.';end if;
   if exists(select 1 from jsonb_array_elements(coalesce(destination.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=p_number or (x->>'invoice'=purchase->>'invoice' and lower(x->>'shop')=lower(purchase->>'shop'))) then raise exception 'Ten zakup już istnieje w docelowej inwestycji.';end if;
   update public.rs_projects set payload=jsonb_set(payload-'_undo','{purchases}',coalesce((select jsonb_agg(x) from jsonb_array_elements(payload->'purchases') x where x->>'id'<>purchase->>'id'),'[]')),revision=revision+1,updated_at=now() where id=origin.id;
   update public.rs_projects set payload=jsonb_set(payload-'_undo','{purchases}',coalesce(payload->'purchases','[]')||jsonb_build_array(updated_purchase)),revision=revision+1,updated_at=now() where id=destination.id;
  else
   update public.rs_projects set payload=jsonb_set(payload-'_undo','{purchases}',(select jsonb_agg(case when x->>'id'=purchase->>'id' then updated_purchase else x end) from jsonb_array_elements(payload->'purchases') x)),revision=revision+1,updated_at=now() where id=origin.id;
  end if;
 end if;
 update public.rs_ksef_links set project_id=p_project,document=jsonb_set(document,'{payload,source,id}',to_jsonb(p_project))||jsonb_build_object('selectedIndices',to_jsonb(indices),'importedAmount',selected_total,'selectedItems',selected),items=preview->'items' where ksef_number=p_number returning * into result;
 return result;
end;$$;
revoke all on function public.rs_edit_ksef_purchase(uuid,text,text,integer[],uuid,integer[]) from public,anon;
grant execute on function public.rs_edit_ksef_purchase(uuid,text,text,integer[],uuid,integer[]) to authenticated;

create function public.rs_validate_purchase_sources(p_payload jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare item jsonb; entry record; receipt jsonb; r jsonb; a jsonb; linked jsonb; n numeric; cash numeric; invoices numeric; advances numeric; actual numeric; planned numeric;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 for item in select value from jsonb_array_elements(coalesce(p_payload->'purchases','[]')) loop
  if item ? 'paidAmount' or item ? 'receiptPayments' then
   cash:=case when coalesce((item->>'paid')::boolean,false) then coalesce((item->>'paidAmount')::numeric,0) else 0 end;
   invoices:=0;advances:=0;
   for entry in select key,value from jsonb_each_text(coalesce(item->'invoicePayments','{}')) loop
    n:=entry.value::numeric;
    select coalesce(sum((allocation->>'paid')::numeric),0) into actual from jsonb_array_elements(coalesce(p_payload->'invoiceSettlements','[]')) record cross join lateral jsonb_array_elements(coalesce(record->'allocations','[]')) allocation where record->>'id'=entry.key and allocation->>'kind'='purchase' and allocation->>'id'=item->>'id';
    if n<0 or n::text in ('NaN','Infinity','-Infinity') or n<>actual then raise exception 'Niezgodne wpłaty z faktur sprzedażowych.';end if;
    invoices:=invoices+n;
   end loop;
   select coalesce(sum((allocation->>'paid')::numeric),0) into actual from jsonb_array_elements(coalesce(p_payload->'invoiceSettlements','[]')) record cross join lateral jsonb_array_elements(coalesce(record->'allocations','[]')) allocation where allocation->>'kind'='purchase' and allocation->>'id'=item->>'id';
   if invoices<>actual then raise exception 'Brak powiązania wpłaty z zakupem.';end if;
   for entry in select key,value from jsonb_each_text(coalesce(item->'receiptPayments','{}')) loop
    n:=entry.value::numeric;select value into receipt from jsonb_array_elements(coalesce(p_payload->'receipts','[]')) where value->>'id'=entry.key and value->>'kind'='materials';
    select coalesce(sum((purchase->'receiptPayments'->>entry.key)::numeric),0) into actual from jsonb_array_elements(coalesce(p_payload->'purchases','[]')) purchase;
    if receipt is null or n<0 or n::text in ('NaN','Infinity','-Infinity') or actual>(receipt->>'amount')::numeric then raise exception 'Przekroczono dostępną zaliczkę na materiały.';end if;
    advances:=advances+n;
   end loop;
   n:=(item->>'charge')::numeric;
   if n is null or n<0 or n::text in ('NaN','Infinity','-Infinity') or cash<0 or cash::text in ('NaN','Infinity','-Infinity') or cash+invoices+advances>n then raise exception 'Wpłaty przekraczają koszt przypisany inwestorowi.';end if;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(p_payload->'invoiceSettlements','[]')) loop
  planned:=0;
  for a in select value from jsonb_array_elements(coalesce(r->'allocations','[]')) loop
   n:=(a->>'amount')::numeric;actual:=(a->>'paid')::numeric;
   if n is null or actual is null or n<0 or actual<0 or actual>n or n::text in ('NaN','Infinity','-Infinity') or actual::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowe kwoty rozliczenia faktury.';end if;
   if a->>'kind'='purchase' and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'purchases','[]')) x where x->>'id'=a->>'id') then raise exception 'Rozliczenie wskazuje nieistniejący zakup.';end if;
   planned:=planned+n;
  end loop;
  for linked in select value from jsonb_array_elements(coalesce(r->'existingReceipts','[]')) loop
   select value into receipt from jsonb_array_elements(coalesce(p_payload->'receipts','[]')) where value->>'id'=linked->>'id';
   if receipt is null then
    select jsonb_build_object('amount',(x->>'paidAmount')::numeric,'kind','materials') into receipt from jsonb_array_elements(coalesce(p_payload->'purchases','[]')) x where 'purchase-payment:'||(x->>'id')=linked->>'id' and (x->>'paid')::boolean;
   end if;
   if receipt is null or (receipt->>'amount')::numeric is distinct from (linked->>'amount')::numeric or receipt->>'kind' is distinct from linked->>'kind' then raise exception 'Niezgodne powiązanie wcześniejszej wpłaty.';end if;
   planned:=planned+(linked->>'amount')::numeric;
  end loop;
  n:=(r->>'total')::numeric;
  if n is null or n<0 or n::text in ('NaN','Infinity','-Infinity') or planned>n then raise exception 'Przekroczono kwotę faktury sprzedażowej.';end if;
 end loop;
end;$$;
revoke all on function public.rs_validate_purchase_sources(jsonb) from public,anon;
grant execute on function public.rs_validate_purchase_sources(jsonb) to authenticated;

create function public.rs_save_purchase_ksef_settlement(p_project uuid,p_revision bigint,p_number text,p_xml text,p_indices integer[],p_expected_indices integer[],p_payload jsonb)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; link public.rs_ksef_links; result public.rs_projects; purchase jsonb; old_purchase jsonb; preview jsonb; chosen jsonb; all_indices integer[]; indices integer[]; selected_total numeric; description text; identity record; next_payload jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project and owner_id=auth.uid() and kind='purchases' for update;
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if link.ksef_number is null or project.id is null then raise exception 'Nie znaleziono przypisanej faktury.';end if;
 if p_revision is null or project.revision<>p_revision or link.document->'selectedIndices' is distinct from to_jsonb(p_expected_indices) then raise exception 'RS_CONFLICT: Inwestycja lub pozycje faktury zmieniły się. Odśwież widok.';end if;
 preview:=public.rs_ksef_purchase_preview(p_xml);
 select * into identity from xmltable('/*[local-name()="Faktura"]' passing xmlparse(document p_xml) columns invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]');
 if identity.invoice_number is distinct from link.document->>'number' or identity.seller_nip is distinct from left(p_number,10) or (preview->>'gross')::numeric is distinct from (link.document->>'grossAmount')::numeric or preview->>'currency' is distinct from link.document#>>'{payload,currency}' or coalesce((link.document->>'referenceOnly')::boolean,false) then raise exception 'XML nie zgadza się z przypisanym zakupem.';end if;
 select coalesce(array_agg((x->>'index')::integer order by (x->>'index')::integer),'{}') into all_indices from jsonb_array_elements(preview->'items') x;
 indices:=coalesce(p_indices,all_indices);
 if cardinality(indices)=0 or cardinality(indices)<>(select count(distinct n) from unnest(indices) n) or not indices<@all_indices or array_position(indices,null) is not null then raise exception 'Wybierz poprawne pozycje faktury.';end if;
 select array_agg(n order by n) into indices from unnest(indices) n;
 if not (preview->>'canSelect')::boolean and indices<>all_indices then raise exception 'Wybierz całą fakturę — brak jednoznacznych kwot pozycji.';end if;
 select jsonb_agg(x order by (x->>'index')::integer),sum((x->>'gross')::numeric),string_agg(concat_ws(' ',x->>'name',x->>'quantity',x->>'unit'),'; ' order by (x->>'index')::integer) into chosen,selected_total,description from jsonb_array_elements(preview->'items') x where (x->>'index')::integer=any(indices);
 if indices=all_indices then selected_total:=(preview->>'gross')::numeric;end if;
 if selected_total is null or selected_total<0 or selected_total>(preview->>'gross')::numeric then raise exception 'Nieprawidłowa kwota pozycji.';end if;
 select x into old_purchase from jsonb_array_elements(project.payload->'purchases') x where x->>'sourceKsefNumber'=p_number;
 if old_purchase is null or (select count(*) from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=old_purchase->>'id')<>1 then raise exception 'Nie znaleziono zakupu.';end if;
 select x into purchase from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=old_purchase->>'id';
 if purchase->>'sourceKsefNumber' is distinct from p_number or (purchase->>'amount')::numeric is distinct from selected_total then raise exception 'Kwota zakupu nie zgadza się z pozycjami.';end if;
 next_payload:=jsonb_set(p_payload-'_undo','{purchases}',(select jsonb_agg(case when x->>'id'=old_purchase->>'id' then x||jsonb_build_object('description',coalesce(description,x->>'description'),'invoiceItems',chosen,'selectedKsefRows',to_jsonb(indices),'invoiceGrossAmount',preview->'gross') else x end) from jsonb_array_elements(p_payload->'purchases') x));
 perform public.rs_validate_purchase_sources(next_payload);
 result:=public.rs_save_project(p_project,next_payload,p_revision);
 update public.rs_ksef_links set items=preview->'items',document=document||jsonb_build_object('selectedIndices',to_jsonb(indices),'selectedItems',chosen,'importedAmount',selected_total) where ksef_number=p_number;
 return result;
end;$$;
revoke all on function public.rs_save_purchase_ksef_settlement(uuid,bigint,text,text,integer[],integer[],jsonb) from public,anon;
grant execute on function public.rs_save_purchase_ksef_settlement(uuid,bigint,text,text,integer[],integer[],jsonb) to authenticated;
