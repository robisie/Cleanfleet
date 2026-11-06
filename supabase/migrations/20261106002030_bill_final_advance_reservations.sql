-- A live final invoice exclusively reserves each advance it settles.
create table public.bill_final_advance_reservations (
  advance_id uuid primary key references public.bill_invoices(id),
  final_id uuid not null references public.bill_invoices(id) on delete cascade,
  check (advance_id <> final_id)
);

create index bill_final_advance_reservations_final
  on public.bill_final_advance_reservations(final_id);
alter table public.bill_final_advance_reservations enable row level security;
revoke all on public.bill_final_advance_reservations from public, anon, authenticated;
grant select, insert, delete on public.bill_final_advance_reservations to service_role;

insert into public.bill_final_advance_reservations (advance_id, final_id)
select (reference->>'id')::uuid, invoice.id
from public.bill_invoices invoice
cross join lateral jsonb_array_elements(invoice.payload->'advances') reference
where invoice.payload->>'documentType' = 'final'
  and invoice.status in ('issued','sending','pending','uncertain','accepted');

create function private.bill_reserve_final_advances()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  active_final boolean := coalesce(new.payload->>'documentType' = 'final', false)
    and new.status in ('issued','sending','pending','uncertain','accepted');
  was_active boolean := false;
  advance_ids uuid[];
begin
  if tg_op = 'UPDATE' then
    was_active := coalesce(old.payload->>'documentType' = 'final', false)
      and old.status in ('issued','sending','pending','uncertain','accepted');
  end if;

  if was_active then
    if active_final then
      if old.payload->'advances' is distinct from new.payload->'advances' then
        raise exception 'Nie można zmieniać zaliczek wystawionej faktury końcowej.';
      end if;
    elsif new.status = 'rejected' then
      delete from public.bill_final_advance_reservations where final_id = new.id;
    else
      raise exception 'Nie można zmienić typu lub statusu wystawionej faktury końcowej.';
    end if;
    return new;
  end if;
  if not active_final then return new; end if;

  select array_agg((reference->>'id')::uuid order by (reference->>'id')::uuid)
  into advance_ids
  from jsonb_array_elements(new.payload->'advances') reference;

  if coalesce(cardinality(advance_ids), 0) not between 1 and 30
     or exists (
       select 1 from unnest(advance_ids) selected(id)
       where not exists (
         select 1 from public.bill_invoices advance
         where advance.id = selected.id and advance.creator_id = new.creator_id
           and advance.status = 'accepted' and advance.ksef_number is not null
           and advance.payload->>'documentType' = 'advance'
       )
     ) then
    raise exception 'Wybierz własne faktury zaliczkowe przyjęte w KSeF.';
  end if;

  begin
    insert into public.bill_final_advance_reservations (advance_id, final_id)
    select selected.id, new.id from unnest(advance_ids) selected(id) order by selected.id;
  exception when unique_violation then
    raise exception 'Ta zaliczka jest już rozliczona na fakturze końcowej.';
  end;
  return new;
end;
$$;
revoke all on function private.bill_reserve_final_advances() from public, anon, authenticated;
grant execute on function private.bill_reserve_final_advances() to service_role;

create trigger bill_reserve_final_advances
after insert or update of payload, status on public.bill_invoices
for each row execute function private.bill_reserve_final_advances();
