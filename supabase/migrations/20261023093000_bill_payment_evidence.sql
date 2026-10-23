-- Payment evidence is separate from the immutable issued invoice and its KSeF state.
create table public.bill_payment_evidence (
 invoice_id uuid primary key references public.bill_invoices(id) on delete cascade,
 manual_paid boolean not null default false,
 bank_cents bigint check (bank_cents is null or bank_cents >= 0),
 bank_payments jsonb not null default '[]'::jsonb check (jsonb_typeof(bank_payments) = 'array'),
 bank_checked_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.bill_payment_evidence enable row level security;
revoke all on public.bill_payment_evidence from public, anon, authenticated;
grant all on public.bill_payment_evidence to service_role;
comment on table public.bill_payment_evidence is 'Manual Bill flag and independently verified company bank credits; never changes invoice or investment ledgers.';
