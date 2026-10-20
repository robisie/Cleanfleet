-- Shared, server-side preview: selection and saved amounts use the same parser.
create function public.rs_ksef_purchase_preview(p_xml text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare doc xml; d record; r record; items jsonb:='[]'; value numeric; base numeric; total numeric:=0; difference numeric; largest integer:=0; largest_value numeric:=-1; all_known boolean:=true;computed_tax boolean:=false; selectable boolean; warning text:='';
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_xml is null or length(p_xml)>10000000 or p_xml~*'<!DOCTYPE|<!ENTITY' then raise exception 'Nieprawidłowy XML.';end if;
 doc:=xmlparse(document p_xml);
 select * into d from xmltable('/*[local-name()="Faktura"]' passing doc columns
 gross numeric path '*[local-name()="Fa"]/*[local-name()="P_15"]',
 currency text path '*[local-name()="Fa"]/*[local-name()="KodWaluty"]',
 kind text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
 buyer_nip text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]');
 if d.buyer_nip is distinct from '6351861297' or d.gross is null or d.gross::text in ('NaN','Infinity','-Infinity') then raise exception 'Nieprawidłowa faktura zakupowa spółki.';end if;
 for r in select * from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="FaWiersz"]' passing doc columns
 idx for ordinality,
 line_number text path '*[local-name()="NrWierszaFa"]',name text path '*[local-name()="P_7"]',
 quantity numeric path '*[local-name()="P_8B"]',unit text path '*[local-name()="P_8A"]',
 net numeric path '*[local-name()="P_11"]',gross numeric path '*[local-name()="P_11A"]',
 tax numeric path '*[local-name()="P_11Vat"]',vat text path '*[local-name()="P_12"]',
 net_price numeric path '*[local-name()="P_9A"]',gross_price numeric path '*[local-name()="P_9B"]',discount numeric path '*[local-name()="P_10"]') loop
  value:=null;base:=r.net;
  -- P_11/P_11A are row totals after any discounts. Do not subtract P_10 again.
  if r.gross is not null then value:=r.gross;
  elsif r.gross_price is not null and r.quantity is not null and r.net is null then value:=r.gross_price*r.quantity-coalesce(r.discount,0);
  else
   if base is null and r.net_price is not null and r.quantity is not null then base:=r.net_price*r.quantity-coalesce(r.discount,0);end if;
   if base is not null then
    if r.tax is not null then value:=base+r.tax;
    elsif r.vat in ('23','22','8','7','5','4','3','0') then value:=base*(1+r.vat::numeric/100);computed_tax:=true;
    elsif r.vat in ('0 KR','0 WDT','0 EX','zw','oo','np','np I','np II') then value:=base;
    end if;
   end if;
  end if;
  if value is null or value::text in ('NaN','Infinity','-Infinity') then value:=null;all_known:=false;
  else value:=round(value,2);total:=total+value;if value>largest_value then largest_value:=value;largest:=r.idx-1;end if;end if;
  items:=items||jsonb_build_array(jsonb_build_object('index',r.idx,'lineNumber',r.line_number,'name',r.name,'quantity',r.quantity,'unit',r.unit,'net',base,'vat',r.vat,'gross',value));
 end loop;
 difference:=round(d.gross-total,2);
 selectable:=all_known and jsonb_array_length(items)>0 and d.currency='PLN' and d.gross>=0 and coalesce(d.kind,'') not like 'KOR%';
 if selectable and difference<>0 then
  if computed_tax and abs(difference)<=least(1.00,0.01*jsonb_array_length(items)) and largest_value+difference>=0 then
   items:=jsonb_set(items,array[largest::text,'gross'],to_jsonb(largest_value+difference));
   items:=jsonb_set(items,array[largest::text,'roundingAdjustment'],to_jsonb(difference));
   warning:='Kwoty pozycji uwzględniają wyrównanie zaokrągleń do sumy brutto faktury: '||difference||' zł.';
  else selectable:=false;end if;
 end if;
 if not selectable then warning:='Dokument nie pozwala jednoznacznie rozliczyć części pozycji w PLN. Możesz podejrzeć pozycje i powiązać całą fakturę; kwota pochodzi z jej podsumowania.';end if;
 return jsonb_build_object('items',items,'gross',d.gross,'currency',d.currency,'canSelect',selectable,'warning',warning);
end;$$;
revoke all on function public.rs_ksef_purchase_preview(text) from public,anon;
grant execute on function public.rs_ksef_purchase_preview(text) to authenticated;

-- Only document metadata can be updated; ownership and project remain immutable.
grant update(document,items) on public.rs_ksef_links to authenticated;
create policy rs_ksef_links_owner_update on public.rs_ksef_links for update to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()) and exists(select 1 from public.rs_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create function public.rs_assign_ksef_selected(p_project uuid,p_number text,p_xml text,p_indices integer[] default null,p_bill_id uuid default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare preview jsonb; selected jsonb; indices integer[]; all_indices integer[]; selected_total numeric; description text; link public.rs_ksef_links; existing public.rs_ksef_links;
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
 select * into existing from public.rs_ksef_links where ksef_number=p_number;
 if existing.ksef_number is not null then
  if existing.project_id<>p_project or existing.kind<>'purchases' then raise exception 'Faktura jest już przypisana do innej inwestycji.';end if;
  if coalesce(existing.document->'selectedIndices',to_jsonb(all_indices))<>to_jsonb(indices) then raise exception 'Faktura została już przypisana z innym wyborem pozycji. Nie dodano jej ponownie.';end if;
  return existing;
 end if;
 link:=public.rs_assign_ksef(p_project,p_number,'purchases',p_xml,p_bill_id);
 if not (link.document->>'referenceOnly')::boolean then
  update public.rs_projects set payload=jsonb_set(payload,'{purchases}',(select jsonb_agg(case when x->>'sourceKsefNumber'=p_number then x||jsonb_build_object('amount',selected_total,'charge',selected_total,'description',coalesce(description,x->>'description'),'invoiceItems',selected,'selectedKsefRows',to_jsonb(indices),'invoiceGrossAmount',(preview->>'gross')::numeric) else x end) from jsonb_array_elements(payload->'purchases') x)),revision=revision+1,updated_at=now() where id=p_project and owner_id=auth.uid();
 end if;
 update public.rs_ksef_links set document=document||jsonb_build_object('selectedIndices',to_jsonb(indices),'importedAmount',selected_total,'selectedItems',selected),items=preview->'items' where ksef_number=p_number returning * into link;
 return link;
end;$$;
revoke all on function public.rs_assign_ksef_selected(uuid,text,text,integer[],uuid) from public,anon;
grant execute on function public.rs_assign_ksef_selected(uuid,text,text,integer[],uuid) to authenticated;
