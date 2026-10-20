-- A reviewed import either adds one purchase or enriches one existing purchase.
-- Existing financial fields and purchase IDs remain unchanged on replacement.
create function public.rs_import_ksef_purchase(p_project uuid,p_number text,p_xml text,p_indices integer[],p_bill_id uuid,p_expected_revision bigint,p_replace_purchase uuid default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; existing public.rs_ksef_links; result public.rs_ksef_links; preview jsonb; indices integer[]; all_indices integer[]; selected jsonb; selected_total numeric; description text; data record; purchase jsonb; updated_purchase jsonb; normalized jsonb;
begin
 preview:=public.rs_ksef_purchase_preview(p_xml);
 if p_number is null or p_number!~*'^\d{10}-\d{8}-[a-f0-9]{12}-[a-f0-9]{2}$' then raise exception 'Nieprawidłowy numer KSeF.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into existing from public.rs_ksef_links where ksef_number=p_number;
 if existing.ksef_number is not null then
  if existing.project_id<>p_project or existing.kind<>'purchases' then raise exception 'Ta faktura jest już przypisana do innej inwestycji.';end if;
  return public.rs_assign_ksef_selected(p_project,p_number,p_xml,p_indices,p_bill_id);
 end if;
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if project.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 if p_expected_revision is null or project.revision<>p_expected_revision then raise exception 'RS_CONFLICT: Inwestycja zmieniła się. Otwórz przypisanie ponownie.';end if;
 if p_replace_purchase is null then return public.rs_assign_ksef_selected(p_project,p_number,p_xml,p_indices,p_bill_id);end if;
 select coalesce(array_agg((x->>'index')::integer order by (x->>'index')::integer),'{}') into all_indices from jsonb_array_elements(preview->'items') x;
 indices:=coalesce(p_indices,all_indices);
 if cardinality(indices)=0 or cardinality(indices)<>(select count(distinct n) from unnest(indices) n) or not indices<@all_indices or array_position(indices,null) is not null then raise exception 'Wybierz poprawne pozycje faktury.';end if;
 select array_agg(n order by n) into indices from unnest(indices) n;
 if not (preview->>'canSelect')::boolean and indices<>all_indices then raise exception 'Wybierz całą fakturę.';end if;
 select coalesce(jsonb_agg(x order by (x->>'index')::integer),'[]'),sum((x->>'gross')::numeric),string_agg(concat_ws(' ',x->>'name',x->>'quantity',x->>'unit'),'; ' order by (x->>'index')::integer)
 into selected,selected_total,description from jsonb_array_elements(preview->'items') x where (x->>'index')::integer=any(indices);
 if indices=all_indices then selected_total:=(preview->>'gross')::numeric;end if;
 if selected_total is null or selected_total<0 or selected_total>(preview->>'gross')::numeric then raise exception 'Nieprawidłowa kwota pozycji.';end if;
 select * into data from xmltable('/*[local-name()="Faktura"]' passing xmlparse(document p_xml) columns
 invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',issue_date date path '*[local-name()="Fa"]/*[local-name()="P_1"]',kind text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
 seller text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]',seller_address text path '*[local-name()="Podmiot1"]/*[local-name()="Adres"]/*[local-name()="AdresL1"]',buyer text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',due_date text path '*[local-name()="Fa"]/*[local-name()="Platnosc"]/*[local-name()="TerminPlatnosci"][1]/*[local-name()="Termin"]');
 if preview->>'currency'<>'PLN' or coalesce(data.kind,'') like 'KOR%' or data.seller_nip is distinct from left(p_number,10) or data.invoice_number is null or data.issue_date is null or data.seller is null then raise exception 'Ten dokument nie może zastąpić zakupu w PLN.';end if;
 select x into purchase from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'id'=p_replace_purchase::text;
 if purchase is null or nullif(purchase->>'sourceKsefNumber','') is not null or round((purchase->>'amount')::numeric,2) is distinct from round(selected_total,2) then raise exception 'Wybrany zakup nie pasuje do faktury lub ma już dokument KSeF.';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'id'<>p_replace_purchase::text and (x->>'sourceKsefNumber'=p_number or (x->>'invoice'=data.invoice_number and lower(x->>'shop')=lower(data.seller)))) then raise exception 'Inny zakup ma już ten dokument.';end if;
 updated_purchase:=purchase||jsonb_build_object('date',data.issue_date,'shop',data.seller,'description',coalesce(description,'Zakup z faktury '||data.invoice_number),'invoice',data.invoice_number,'documentType','invoice','sourceKsefNumber',p_number,'invoiceItems',selected,'selectedKsefRows',to_jsonb(indices),'invoiceGrossAmount',(preview->>'gross')::numeric,'supplierNip',data.seller_nip,'supplierAddress',data.seller_address,'dueDate',data.due_date);
 if coalesce((purchase->>'paid')::boolean,false) and coalesce((purchase->>'paidAmount')::numeric,0)>0 and nullif(purchase->>'paidDate','') is null then updated_purchase:=updated_purchase||jsonb_build_object('paidDate',purchase->>'date');end if;
 normalized:=jsonb_build_object('id',coalesce(p_bill_id,gen_random_uuid()),'number',data.invoice_number,'status','accepted','ksef_number',p_number,'originKind','purchases','externalKsef',true,'sourceBillId',p_bill_id,'referenceOnly',false,'grossAmount',(preview->>'gross')::numeric,'selectedIndices',to_jsonb(indices),'selectedItems',selected,'importedAmount',selected_total,
 'payload',jsonb_build_object('brand','robisie','currency','PLN','issueDate',data.issue_date,'dueDate',data.due_date,'buyer',jsonb_build_object('name',data.buyer,'nip','6351861297'),'seller',jsonb_build_object('name',data.seller,'nip',data.seller_nip,'address',data.seller_address),'source',jsonb_build_object('app','robisie','id',p_project),'lines',jsonb_build_array(jsonb_build_object('name',coalesce(description,data.invoice_number),'qty','1','price',preview->>'gross','unit','kpl'))));
 update public.rs_projects set payload=jsonb_set(payload-'_undo','{purchases}',(select jsonb_agg(case when x->>'id'=p_replace_purchase::text then updated_purchase else x end order by ordinal) from jsonb_array_elements(payload->'purchases') with ordinality a(x,ordinal))),revision=revision+1,updated_at=now() where id=p_project;
 insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document,items) values(p_number,p_project,auth.uid(),'purchases',normalized,preview->'items') returning * into result;
 return result;
end;$$;
revoke all on function public.rs_import_ksef_purchase(uuid,text,text,integer[],uuid,bigint,uuid) from public,anon;
grant execute on function public.rs_import_ksef_purchase(uuid,text,text,integer[],uuid,bigint,uuid) to authenticated;
