-- Validate both KSeF and receipt sources without relaxing quantity checks.
create or replace function public.rs_check_purchase_allocation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; current_payload jsonb; expected jsonb;
begin
 select payload into current_payload from public.rs_projects where id=new.id;
 for item in select x from jsonb_array_elements(coalesce(current_payload->'purchases','[]')) x where x ? 'selectedKsefQuantities' loop
  select document->'selectedQuantities' into expected from public.rs_ksef_links
   where ksef_number=coalesce(nullif(item->>'sourceKsefNumber',''),item->>'sourceReceiptId') and project_id=new.id and kind='purchases';
  if expected is distinct from item->'selectedKsefQuantities' then raise exception 'Przypisanie pozycji dokumentu zmieniło się. Otwórz zakup ponownie zamiast przywracać stare ilości.';end if;
 end loop;
 return null;
end;$$;
