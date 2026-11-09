create table public.bill_reminder_templates (
 user_id uuid primary key references auth.users(id) on delete cascade,
 subject text not null check (length(subject) between 1 and 180),
 body text not null check (length(body) between 1 and 4000),
 updated_at timestamptz not null default now()
);
alter table public.bill_reminder_templates enable row level security;
revoke all on public.bill_reminder_templates from public, anon, authenticated;
grant all on public.bill_reminder_templates to service_role;
