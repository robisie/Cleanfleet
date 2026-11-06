-- Verify new or edited settlements against the linked sales document.
create function private.rs_verify_sales_invoice_settlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement jsonb;
  invoice_id uuid;
  invoice_payload jsonb;
  invoice_number text;
  document_amount numeric;
  document_currency text;
  previous_settlements jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' then
    previous_settlements := coalesce(old.payload->'invoiceSettlements', '[]'::jsonb);
  end if;
  for settlement in
    select s.value
    from jsonb_array_elements(coalesce(new.payload->'invoiceSettlements', '[]'::jsonb)) s
    where not exists (select 1 from jsonb_array_elements(previous_settlements) prior where prior.value = s.value)
  loop
    if auth.uid() is not null and (auth.uid() is distinct from new.owner_id or not public.cf_is_admin()) then
      raise exception 'Brak uprawnień do rozliczeń inwestycji.';
    end if;
    if coalesce(settlement->>'id', '') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
      raise exception 'Nieprawidłowy identyfikator faktury sprzedażowej.';
    end if;
    invoice_id := (settlement->>'id')::uuid;

    select b.payload, b.number into invoice_payload, invoice_number
    from public.bill_invoices b
    where b.id = invoice_id and b.creator_id = new.owner_id
      and b.status <> 'draft' and b.number is not null
      and (
        (b.payload#>>'{source,app}' = 'robisie' and b.payload#>>'{source,id}' = new.id::text)
        or exists (
          select 1 from public.rs_ksef_links k
          where k.ksef_number = b.ksef_number and k.project_id = new.id
            and k.owner_id = new.owner_id and k.kind = 'sales'
            and k.document->>'id' = invoice_id::text
            and not coalesce((k.document->>'referenceOnly')::boolean, false)
        )
      );

    if found then
      if nullif(invoice_payload->'correction', 'null'::jsonb) is not null then
        raise exception 'Korekta wymaga osobnego rozliczenia.';
      end if;
      document_currency := invoice_payload->>'currency';
      -- BILL rounds the gross line and each percentage discount separately in cents.
      if invoice_payload->>'documentType' = 'advance' then
        document_amount := replace(invoice_payload->>'advanceAmount', ',', '.')::numeric;
      else
        select sum(line_cents - round(line_cents * discount_percent / 100)) / 100
        into document_amount
        from jsonb_array_elements(invoice_payload->'lines') item
        cross join lateral (
          select round(replace(item->>'qty', ',', '.')::numeric *
                       replace(item->>'price', ',', '.')::numeric * 100)
                 - coalesce(nullif(replace(btrim(item->>'discount'), ',', '.'), ''), '0')::numeric * 100 as line_cents,
                 coalesce(nullif(replace(btrim(invoice_payload->>'globalDiscount'), ',', '.'), ''), '0')::numeric as discount_percent
        ) amounts;
        if invoice_payload->>'documentType' = 'final' then
          document_amount := document_amount - (
            select coalesce(sum(replace(a->>'amount', ',', '.')::numeric), 0)
            from jsonb_array_elements(invoice_payload->'advances') a
          );
        end if;
      end if;
    else
      select (k.document->>'grossAmount')::numeric, k.document->>'number', k.document#>>'{payload,currency}'
      into document_amount, invoice_number, document_currency
      from public.rs_ksef_links k
      where k.project_id = new.id and k.owner_id = new.owner_id and k.kind = 'sales'
        and k.document->>'id' = invoice_id::text
        and not coalesce((k.document->>'referenceOnly')::boolean, false)
        and not exists (select 1 from public.bill_invoices b where b.id = invoice_id);
    end if;

    if document_currency is distinct from 'PLN' or invoice_number is null
       or invoice_number is distinct from settlement->>'number'
       or document_amount is null or document_amount < 0
       or document_amount::text in ('NaN','Infinity','-Infinity')
       or document_amount is distinct from (settlement->>'total')::numeric then
      raise exception 'Rozliczenie musi mieć numer i kwotę z faktury sprzedażowej w PLN przypisanej do tej inwestycji.';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.rs_verify_sales_invoice_settlements() from public, anon, authenticated;
create trigger rs_verify_sales_invoice_settlements
before insert or update of payload on public.rs_projects
for each row execute function private.rs_verify_sales_invoice_settlements();
