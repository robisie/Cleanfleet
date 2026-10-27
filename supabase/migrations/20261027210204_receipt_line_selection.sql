-- Initial import can reserve only selected rows; the full receipt stays in stock.
create function public.rs_receipt_import_selected(p_hash text,p_data jsonb,p_project uuid,p_entries jsonb,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare number text; result jsonb;
begin
 number:=public.rs_receipt_save(p_hash,p_data);
 result:=public.rs_receipt_assign_project(number,p_project,p_entries,p_revision);
 return result||jsonb_build_object('number',number);
end;$$;
revoke all on function public.rs_receipt_import_selected(text,jsonb,uuid,jsonb,bigint) from public,anon;
grant execute on function public.rs_receipt_import_selected(text,jsonb,uuid,jsonb,bigint) to authenticated;

create function public.rs_receipt_update_allocation(p_project uuid,p_number text,p_entries jsonb,p_revision bigint,p_expected_document jsonb,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; link public.rs_ksef_links; doc public.rs_ksef_documents; original jsonb; purchase jsonb; choice jsonb; payload jsonb; result public.rs_projects;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if project.id is null or project.revision is distinct from p_revision then raise exception 'Inwestycja zmieniła się. Otwórz zakup ponownie.';end if;
 select * into link from public.rs_ksef_links where project_id=p_project and ksef_number=p_number and owner_id=auth.uid() and kind='purchases' for update;
 select * into doc from public.rs_ksef_documents where ksef_number=p_number and owner_id=auth.uid() and metadata->>'source'='nip-receipt';
 if link.ksef_number is null or doc.ksef_number is null or link.document is distinct from p_expected_document then raise exception 'Przypisanie paragonu zmieniło się. Otwórz zakup ponownie.';end if;
 select x into original from jsonb_array_elements(project.payload->'purchases') x where x->>'sourceReceiptId'=p_number;
 if original is null then raise exception 'Brak zakupu przypisanego do paragonu.';end if;
 select x into purchase from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=original->>'id';
 if purchase is null or purchase->>'sourceReceiptId' is distinct from p_number or purchase ? 'sourceKsefNumber' then raise exception 'Nie można zmienić źródła paragonu.';end if;
 choice:=public.rs_ksef_select_quantities(p_number,p_project,doc.preview,p_entries);
 if (purchase->>'charge')::numeric is null or (purchase->>'charge')::numeric<0 or (purchase->>'charge')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowy koszt inwestora.';end if;
 if (select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(coalesce(p_payload->'invoiceSettlements','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'allocations','[]')) a where a->>'kind'='purchase' and a->>'id'=original->>'id')>(purchase->>'charge')::numeric then raise exception 'Najpierw zmniejsz należności przypisane do zakupu.';end if;
 purchase:=purchase||jsonb_build_object('documentType','nip-receipt','date',doc.metadata->>'issueDate','shop',doc.metadata#>>'{seller,name}','invoice',doc.metadata->>'invoiceNumber','supplierNip',doc.metadata#>>'{seller,nip}','amount',choice->'total','description',choice->>'description','invoiceItems',choice->'items','selectedKsefRows',choice->'indices','selectedKsefQuantities',choice->'entries','allocatedInvoiceAmount',choice->'total','invoiceGrossAmount',doc.preview->'gross');
 payload:=jsonb_set(p_payload-'_undo','{purchases}',(select jsonb_agg(case when x->>'id'=original->>'id' then purchase else x end order by ord) from jsonb_array_elements(p_payload->'purchases') with ordinality a(x,ord)));
 perform public.rs_validate_purchase_sources(payload);
 update public.rs_ksef_links set document=document||jsonb_build_object('selectedQuantities',choice->'entries','selectedIndices',choice->'indices','selectedItems',choice->'items','importedAmount',choice->'total') where project_id=p_project and ksef_number=p_number;
 result:=public.rs_save_project(p_project,payload,p_revision);
 return to_jsonb(result);
end;$$;
revoke all on function public.rs_receipt_update_allocation(uuid,text,jsonb,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.rs_receipt_update_allocation(uuid,text,jsonb,bigint,jsonb,jsonb) to authenticated;
