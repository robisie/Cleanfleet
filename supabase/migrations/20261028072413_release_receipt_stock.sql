-- Deleting an investment purchase releases its source rows, keeping the receipt document.
create or replace function public.rs_release_removed_ksef_purchases() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 delete from public.rs_ksef_links l where l.project_id=new.id and l.kind='purchases'
 and exists(select 1 from jsonb_array_elements(coalesce(old.payload->'purchases','[]')) x where coalesce(nullif(x->>'sourceKsefNumber',''),x->>'sourceReceiptId')=l.ksef_number)
 and not exists(select 1 from jsonb_array_elements(coalesce(new.payload->'purchases','[]')) x where coalesce(nullif(x->>'sourceKsefNumber',''),x->>'sourceReceiptId')=l.ksef_number);
 return new;
end;$$;
