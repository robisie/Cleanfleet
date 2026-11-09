create table public.bill_sms_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

alter table public.bill_sms_credentials enable row level security;
revoke all on public.bill_sms_credentials from public, anon, authenticated;
grant all on public.bill_sms_credentials to service_role;
