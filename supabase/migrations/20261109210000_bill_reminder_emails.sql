create table public.bill_reminder_emails (
 id uuid primary key,
 invoice_id uuid not null references public.bill_invoices(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 recipient text not null,
 subject text not null,
 body text not null,
 amount_cents bigint not null check (amount_cents > 0),
 currency text not null,
 state text not null check (state in ('sending','sent','uncertain','failed')),
 provider_id text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index bill_reminder_emails_invoice_idx on public.bill_reminder_emails(invoice_id,created_at desc);
alter table public.bill_reminder_emails enable row level security;
revoke all on public.bill_reminder_emails from public, anon, authenticated;
grant all on public.bill_reminder_emails to service_role;
