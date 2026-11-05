alter table public.pack_bank_mail_settings alter column starts_on set default ((date_trunc('month',now() at time zone 'Europe/Warsaw') + interval '1 month 4 days')::date);
update public.pack_bank_mail_settings set starts_on=starts_on-2 where extract(day from starts_on)=7;
select cron.alter_job(jobid, schedule := '15 6 5-31 * *') from cron.job where jobname='pack-bank-mail-check';
