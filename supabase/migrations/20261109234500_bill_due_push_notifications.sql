create table public.bill_due_push_deliveries (
 invoice_id uuid not null references public.bill_invoices(id) on delete cascade,
 stage smallint not null check (stage in (0,3)),
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 state text not null default 'pending' check (state in ('pending','sent')),
 claimed_at timestamptz not null default now(),
 sent_at timestamptz,
 primary key (invoice_id,stage,subscription_id)
);
alter table public.bill_due_push_deliveries enable row level security;
revoke all on public.bill_due_push_deliveries from public,anon,authenticated;
grant all on public.bill_due_push_deliveries to service_role;

-- Hourly UTC checks allow a 09:00 Europe/Warsaw send during both standard and summer time.
-- The function checks the local day, payment status and unique delivery row again.
select cron.schedule('bill-due-push-check','0 * * * *',
 $$select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/bill-due-push',
  headers := jsonb_build_object('Content-Type','application/json','x-cleanfleet-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cleanfleet_cron_secret')),
  body := '{"source":"pg_cron"}'::jsonb,
  timeout_milliseconds := 120000
 );$$);
