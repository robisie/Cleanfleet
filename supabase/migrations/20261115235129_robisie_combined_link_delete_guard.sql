-- Preserve ordinary document detachment outside combined purchases.
create or replace function public.rs_guard_combined_purchase_link() returns trigger
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
 if tg_op='DELETE' then return old;end if;
 return new;
end;$$;
