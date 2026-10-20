-- One transaction for the existing purchase form and shared KSeF selection.
-- Reuses Bill's authoritative XML parser and assignment editor.
create function public.rs_save_purchase_ksef_form(p_project uuid,p_revision bigint,p_number text,p_xml text,p_indices integer[],p_expected_indices integer[],p_payload jsonb)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare current_project public.rs_projects; link public.rs_ksef_links; result public.rs_projects; old_purchase jsonb; purchase jsonb; preview jsonb; expected_items jsonb; expected_total numeric; planned numeric; invoice_paid numeric; manual_paid numeric; charge numeric; saved_link public.rs_ksef_links;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Nieprawidłowe dane inwestycji.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into link from public.rs_ksef_links where ksef_number=p_number and project_id=p_project and kind='purchases' for update;
 select * into current_project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if link.ksef_number is null or current_project.id is null then raise exception 'Nie znaleziono przypisanej faktury.';end if;
 if p_revision is null or current_project.revision<>p_revision or link.document->'selectedIndices' is distinct from to_jsonb(p_expected_indices) then raise exception 'RS_CONFLICT: Inwestycja lub przypisanie faktury zmieniły się. Odśwież widok.';end if;
 select x into old_purchase from jsonb_array_elements(current_project.payload->'purchases') x where x->>'sourceKsefNumber'=p_number;
 if old_purchase is null or (select count(*) from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=old_purchase->>'id')<>1 then raise exception 'Nie znaleziono edytowanego zakupu.';end if;
 select x into purchase from jsonb_array_elements(p_payload->'purchases') x where x->>'id'=old_purchase->>'id';
 if purchase->>'sourceKsefNumber' is distinct from p_number or purchase->'invoicePayments' is distinct from old_purchase->'invoicePayments' then raise exception 'Nie można zmienić powiązanych wpłat w edycji pozycji.';end if;
 preview:=public.rs_ksef_purchase_preview(p_xml);
 select coalesce(jsonb_agg(x order by (x->>'index')::integer),'[]'),sum((x->>'gross')::numeric) into expected_items,expected_total from jsonb_array_elements(preview->'items') x where (x->>'index')::integer=any(p_indices);
 if cardinality(p_indices)=jsonb_array_length(preview->'items') then expected_total:=(preview->>'gross')::numeric;end if;
 if (purchase->>'amount')::numeric is distinct from expected_total then raise exception 'Kwota zakupu nie zgadza się z wybranymi pozycjami.';end if;
 charge:=(purchase->>'charge')::numeric;manual_paid:=case when (purchase->>'paid')::boolean then coalesce((purchase->>'paidAmount')::numeric,0) else 0 end;
 select coalesce(sum(value::numeric),0) into invoice_paid from jsonb_each_text(coalesce(old_purchase->'invoicePayments','{}'));
 if charge is null or charge::text in ('NaN','Infinity','-Infinity') or charge<0 or manual_paid<0 or manual_paid+invoice_paid>charge then raise exception 'Kwota zakupu nie pokrywa zapisanych wpłat. Popraw rozliczenie przed zmianą pozycji.';end if;
 select coalesce(sum((a->>'amount')::numeric),0) into planned from jsonb_array_elements(coalesce(current_project.payload->'invoiceSettlements','[]')) r cross join lateral jsonb_array_elements(coalesce(r->'allocations','[]')) a where a->>'kind'='purchase' and a->>'id'=old_purchase->>'id';
 if charge<coalesce((old_purchase->>'charge')::numeric,0) and planned>charge then raise exception 'Najpierw zmień należności przypisane do tego zakupu w Etapach i płatnościach.';end if;
 -- The existing editor validates the selection, identity, totals and payments.
 -- Any failure rolls back this form save as well.
 result:=public.rs_save_project(p_project,p_payload-'_undo',p_revision);
 saved_link:=public.rs_edit_ksef_purchase(p_project,p_number,p_xml,p_indices,p_project,p_expected_indices);
 update public.rs_ksef_links set items=preview->'items',document=document||jsonb_build_object('selectedIndices',to_jsonb(p_indices),'selectedItems',expected_items,'importedAmount',expected_total) where ksef_number=p_number;
 select * into result from public.rs_projects where id=p_project;
 -- Preserve an explicitly entered investor cost, including an agreed markup.
 if (select (x->>'charge')::numeric from jsonb_array_elements(result.payload->'purchases') x where x->>'id'=old_purchase->>'id') is distinct from charge then
  update public.rs_projects set payload=jsonb_set(payload,'{purchases}',(select jsonb_agg(case when x->>'id'=old_purchase->>'id' then x||jsonb_build_object('charge',charge) else x end) from jsonb_array_elements(payload->'purchases') x)),revision=revision+1,updated_at=now() where id=p_project returning * into result;
 end if;
 return result;
end;$$;
revoke all on function public.rs_save_purchase_ksef_form(uuid,bigint,text,text,integer[],integer[],jsonb) from public,anon;
grant execute on function public.rs_save_purchase_ksef_form(uuid,bigint,text,text,integer[],integer[],jsonb) to authenticated;
