-- Shared projects may allocate their actual common receipts to purchases.
CREATE OR REPLACE FUNCTION public.rs_validate_purchase_sources(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    n:=entry.value::numeric;select value into receipt from jsonb_array_elements(coalesce(p_payload->'receipts','[]')) where value->>'id'=entry.key and (value->>'kind'='materials' or coalesce((p_payload->>'mixedSettlement')::boolean,false) and value->>'kind'='work');
    select coalesce(sum((purchase->'receiptPayments'->>entry.key)::numeric),0) into actual from jsonb_array_elements(coalesce(p_payload->'purchases','[]')) purchase;
    if receipt is null or n<0 or n::text in ('NaN','Infinity','-Infinity') or actual>(receipt->>'amount')::numeric then raise exception 'Przekroczono dostępną zaliczkę na materiały.';end if;
    advances:=advances+n;
   end loop;
   n:=(item->>'charge')::numeric;
   if n is null or n<0 or n::text in ('NaN','Infinity','-Infinity') or cash<0 or cash::text in ('NaN','Infinity','-Infinity') or cash+invoices+advances>greatest(n,public.rs_ksef_correction_paid_limit(item)) then raise exception 'Wpłaty przekraczają koszt przypisany inwestorowi.';end if;
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
end;$function$

;
-- Keep both documents attached to one cost when editing ordinary KSeF allocations.
create function public.rs_guard_combined_purchase_link() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.document ? 'sharedPurchaseId' then
  if tg_op='DELETE' then
   raise exception 'Faktura jest częścią zakupu rozliczonego zaliczką i fakturą końcową. Zachowaj oba dokumenty przy jednym zakupie.';
  end if;
  if new.project_id is distinct from old.project_id or new.kind is distinct from old.kind
   or new.document is distinct from old.document or new.items is distinct from old.items then
   raise exception 'Ten zakup ma fakturę zaliczkową i końcową. Rozliczenie inwestora edytuj w Zakupach i materiałach bez ponownego przypisywania dokumentów.';
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.rs_guard_combined_purchase_link() from public,anon,authenticated;
create trigger rs_guard_combined_purchase_link before update or delete on public.rs_ksef_links
for each row execute function public.rs_guard_combined_purchase_link();
