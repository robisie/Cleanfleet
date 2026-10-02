create table public.cf_mail_credentials (
 user_id uuid primary key references auth.users(id) on delete cascade,
 ciphertext text not null check (length(ciphertext) <= 14000),
 updated_at timestamptz not null default now()
);
alter table public.cf_mail_credentials enable row level security;
revoke all on public.cf_mail_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.cf_mail_credentials to service_role;
comment on table public.cf_mail_credentials is 'Encrypted o2 connection data, accessible only through admin-authorized Edge Function.';
