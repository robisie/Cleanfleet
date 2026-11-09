create table public.bill_smtp_credentials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ciphertext text not null,
 updated_at timestamptz not null default now()
);
alter table public.bill_smtp_credentials enable row level security;
revoke all on public.bill_smtp_credentials from public, anon, authenticated;
grant all on public.bill_smtp_credentials to service_role;
