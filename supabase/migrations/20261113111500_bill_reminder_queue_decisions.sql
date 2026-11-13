-- One persistent decision per invoice; 'later' is session-only and may be asked next time.
create table if not exists public.bill_reminder_queue_decisions (
 invoice_id uuid primary key references public.bill_invoices(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 decision text not null check (decision='dismissed'),
 created_at timestamptz not null default now()
);
alter table public.bill_reminder_queue_decisions enable row level security;
revoke all on public.bill_reminder_queue_decisions from public,anon,authenticated;
grant all on public.bill_reminder_queue_decisions to service_role;
