alter table public.cf_reminders
 add column invoice_source text not null default 'manual' check (invoice_source in ('manual','email','ksef')),
 add column ksef_seller_nip text,
 add column ksef_match_text text check (length(ksef_match_text)<=160),
 add column ksef_anchor_due_at timestamptz,
 add column ksef_scan_status text not null default 'off' check (ksef_scan_status in ('off','waiting','needs_review','applied','error','missing')),
 add column ksef_last_checked_at timestamptz,
 add column ksef_last_error text check (length(ksef_last_error)<=500),
 add column ksef_number text,
 add column ksef_candidates jsonb not null default '[]' check (jsonb_typeof(ksef_candidates)='array' and octet_length(ksef_candidates::text)<=32000);

update public.cf_reminders set invoice_source='email' where mail_invoice_enabled;

create function public.cf_reminder_invoice_source_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.invoice_source is distinct from old.invoice_source then
   new.mail_invoice_enabled := new.invoice_source='email';
  elsif new.mail_invoice_enabled is distinct from old.mail_invoice_enabled then
   new.invoice_source := case when new.mail_invoice_enabled then 'email' else 'manual' end;
  end if;
 elsif new.mail_invoice_enabled and new.invoice_source='manual' then new.invoice_source:='email';
 end if;
 if not new.is_payment then new.invoice_source:='manual';end if;
 new.mail_invoice_enabled:=new.invoice_source='email';
 if new.invoice_source='ksef' then
  if new.ksef_seller_nip is null or new.ksef_seller_nip !~ '^\d{10}$' then raise exception 'Podaj NIP dostawcy.';end if;
  new.ksef_anchor_due_at:=coalesce(new.ksef_anchor_due_at,new.due_at);
 else new.ksef_scan_status:='off';end if;
 return new;
end;$$;
revoke all on function public.cf_reminder_invoice_source_guard() from public,anon,authenticated;
create trigger cf_reminder_invoice_source_guard before insert or update on public.cf_reminders for each row execute function public.cf_reminder_invoice_source_guard();
create unique index cf_reminders_ksef_invoice_once on public.cf_reminders(user_id,upper(ksef_number)) where ksef_number is not null;
create index cf_reminders_ksef_scan on public.cf_reminders(ksef_last_checked_at) where invoice_source='ksef' and status in ('active','snoozed');

select cron.schedule('cleanfleet-reminder-ksef-check','15 * * * *',$$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/cleanfleet-reminder-ksef',
  headers := jsonb_build_object('Content-Type','application/json','x-cleanfleet-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cleanfleet_cron_secret')),
  body := '{"action":"scan"}'::jsonb,timeout_milliseconds := 60000
 );
$$);
