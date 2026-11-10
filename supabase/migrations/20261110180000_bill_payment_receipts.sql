create table public.bill_payment_receipt_templates (
 user_id uuid primary key references auth.users(id) on delete cascade,
 subject text not null check (length(subject) between 1 and 180),
 body text not null check (length(body) between 1 and 4000),
 updated_at timestamptz not null default now()
);
alter table public.bill_payment_receipt_templates enable row level security;
revoke all on public.bill_payment_receipt_templates from public, anon, authenticated;
grant all on public.bill_payment_receipt_templates to service_role;

create table public.bill_payment_receipt_emails (
 invoice_id uuid primary key references public.bill_invoices(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 recipient text,
 subject text,
 body text,
 amount_cents bigint check (amount_cents is null or amount_cents > 0),
 currency text,
 state text not null check (state in ('dismissed','sending','sent','uncertain')),
 provider_id text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table public.bill_payment_receipt_emails enable row level security;
revoke all on public.bill_payment_receipt_emails from public, anon, authenticated;
grant all on public.bill_payment_receipt_emails to service_role;
