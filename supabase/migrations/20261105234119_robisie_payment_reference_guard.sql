create or replace function public.rs_guard_purchase_sources()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  settlements jsonb := coalesce(new.payload->'invoiceSettlements', '[]'::jsonb);
  receipts jsonb := coalesce(new.payload->'receipts', '[]'::jsonb);
  validate_sources boolean := jsonb_array_length(settlements) > 0
    or jsonb_path_exists(new.payload, '$.purchases[*].receiptPayments');
begin
  if tg_op = 'UPDATE' then
    validate_sources := validate_sources
      or jsonb_array_length(coalesce(old.payload->'invoiceSettlements', '[]'::jsonb)) > 0
      or jsonb_path_exists(old.payload, '$.purchases[*].receiptPayments');
  end if;

  if not validate_sources then
    return new;
  end if;

  if exists (
    select 1 from jsonb_array_elements(settlements) settlement
    group by settlement->>'id'
    having count(*) > 1
  ) then
    raise exception 'Ta sama faktura występuje więcej niż raz w rozliczeniu inwestycji.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(receipts) receipt
    where receipt->>'id' is not null
    group by receipt->>'id'
    having count(*) > 1
  ) then
    raise exception 'Ta sama wpłata występuje więcej niż raz w inwestycji.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(settlements) settlement
    cross join lateral jsonb_array_elements(coalesce(settlement->'existingReceipts', '[]'::jsonb)) linked
    group by linked->>'id'
    having count(*) > 1
  ) then
    raise exception 'Ta sama wcześniejsza wpłata może być powiązana tylko raz z fakturą sprzedażową.';
  end if;

  if auth.uid() is not null then
    perform public.rs_validate_purchase_sources(new.payload);
  end if;
  return new;
end;
$$;

create or replace trigger rs_purchase_source_guard
before insert or update of payload on public.rs_projects
for each row execute function public.rs_guard_purchase_sources();
