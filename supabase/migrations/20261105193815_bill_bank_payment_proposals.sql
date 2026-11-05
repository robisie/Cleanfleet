alter table public.bill_payment_evidence add column bank_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(bank_candidates)='array');
create table public.bill_bank_payment_links (
 owner_id uuid not null references auth.users(id) on delete cascade,
 income_id text not null check (length(income_id) between 1 and 160),
 invoice_id uuid not null references public.bill_invoices(id) on delete cascade,
 confirmed_at timestamptz not null default now(),
 primary key(owner_id,income_id)
);
create index bill_bank_payment_links_invoice_idx on public.bill_bank_payment_links(invoice_id);
alter table public.bill_bank_payment_links enable row level security;
revoke all on public.bill_bank_payment_links from public,anon,authenticated;
grant all on public.bill_bank_payment_links to service_role;
create function public.bill_bank_payment_choice(p_owner uuid,p_invoice uuid,p_income text,p_remove boolean default false)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare evidence public.bill_payment_evidence; candidate jsonb; retained jsonb; remaining_cents bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if not exists(select 1 from public.bill_invoices where id=p_invoice and creator_id=p_owner and status<>'draft' and number is not null and payload->>'correction' is null) then
  raise exception 'Brak dostępu do powiązania tej faktury.';
 end if;
 select * into evidence from public.bill_payment_evidence where invoice_id=p_invoice for update;
 if not found then raise exception 'Odśwież faktury i wybierz aktualną propozycję.'; end if;
 if p_remove then
  delete from public.bill_bank_payment_links where owner_id=p_owner and income_id=p_income and invoice_id=p_invoice;
  if not found then return; end if;
  select coalesce(jsonb_agg(p),'[]'::jsonb),sum((p->>'amountCents')::bigint) into retained,remaining_cents
   from jsonb_array_elements(evidence.bank_payments) p where p->>'incomeId' is distinct from p_income;
  update public.bill_payment_evidence set bank_payments=retained,bank_cents=remaining_cents,bank_candidates='[]'::jsonb,updated_at=now() where invoice_id=p_invoice;
  return;
 end if;
 if exists(select 1 from public.bill_bank_payment_links where owner_id=p_owner and income_id=p_income and invoice_id=p_invoice) then return; end if;
 if evidence.bank_cents is not null then raise exception 'Faktura ma już potwierdzenie bankowe. Odśwież listę.'; end if;
 select p into candidate from jsonb_array_elements(evidence.bank_candidates) p where p->>'incomeId'=p_income;
 if candidate is null then raise exception 'Propozycja jest nieaktualna. Odśwież faktury.'; end if;
 if exists(select 1 from public.bill_payment_evidence e join public.bill_invoices i on i.id=e.invoice_id,
  lateral jsonb_array_elements(e.bank_payments) p where i.creator_id=p_owner and p->>'incomeId'=p_income) then
  raise exception 'Ten przelew jest już powiązany z fakturą.';
 end if;
 insert into public.bill_bank_payment_links(owner_id,income_id,invoice_id) values(p_owner,p_income,p_invoice);
 update public.bill_payment_evidence set bank_candidates='[]'::jsonb,bank_cents=(candidate->>'amountCents')::bigint,
  bank_payments=jsonb_build_array((candidate-'reason'-'otherInvoices')||jsonb_build_object('confirmed',true)),bank_checked_at=now(),updated_at=now() where invoice_id=p_invoice;
exception when unique_violation then
 raise exception 'Ten przelew jest już powiązany z inną fakturą. Odśwież listę.';
end $$;
revoke all on function public.bill_bank_payment_choice(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.bill_bank_payment_choice(uuid,uuid,text,boolean) to service_role;
