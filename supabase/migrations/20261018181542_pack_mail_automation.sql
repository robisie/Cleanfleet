create table public.pack_bank_mail_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 starts_on date not null default ((date_trunc('month',now() at time zone 'Europe/Warsaw') + interval '1 month 6 days')::date),
 password_ciphertext text check (length(password_ciphertext)<14000),
 locked_until timestamptz,
 last_checked_at timestamptz,
 last_error text check (length(last_error)<=500)
);
create table public.pack_bank_mail_files (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_key text not null,
 filename text not null,
 period text not null check (period ~ '^20[0-9]{2}-[01][0-9]$'),
 sha256 text not null,
 storage_path text not null,
 status text not null default 'downloaded' check(status in ('downloaded','imported','needs_attention')),
 last_error text check(length(last_error)<=500),
 created_at timestamptz not null default now(),
 imported_at timestamptz,
 unique(user_id,source_key)
);
alter table public.pack_bank_mail_settings enable row level security;
alter table public.pack_bank_mail_files enable row level security;
revoke all on public.pack_bank_mail_settings,public.pack_bank_mail_files from public,anon,authenticated;
grant all on public.pack_bank_mail_settings,public.pack_bank_mail_files to service_role;
-- Settings and originals are accessed only through the owner/admin-checked Edge Function.
insert into storage.buckets(id,name,public,file_size_limit)
values('pack-bank-statements','pack-bank-statements',false,20971520);
alter table public.cf_reminders drop constraint cf_reminders_mail_scan_status;
alter table public.cf_reminders add constraint cf_reminders_mail_scan_status check
 (mail_scan_status in ('off','waiting','applied','needs_review','error','missing'));
select cron.schedule('cleanfleet-reminder-mail-check','0 6 * * *',
 $$select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/cleanfleet-reminder-mail',
 headers := jsonb_build_object('Content-Type','application/json','x-cleanfleet-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cleanfleet_cron_secret')),
 body := '{"source":"pg_cron"}'::jsonb,timeout_milliseconds := 120000);$$);
-- Daily from the 7th: late arrivals and unfinished imports retry without duplicates.
select cron.schedule('pack-bank-mail-check','15 6 7-31 * *',
 $$select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/pack-bank-mail',
 headers := jsonb_build_object('Content-Type','application/json','x-cleanfleet-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cleanfleet_cron_secret')),
 body := '{"source":"pg_cron"}'::jsonb,timeout_milliseconds := 120000);$$);
