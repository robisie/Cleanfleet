-- Hourly check detects publication and delivers postponed notifications even with apps closed.
select cron.schedule(
 'annual-inflation-check','10 * * * *',
 $$select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/annual-inflation',
  headers := jsonb_build_object('Content-Type','application/json','x-cleanfleet-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cleanfleet_cron_secret')),
  body := '{"source":"pg_cron"}'::jsonb,
  timeout_milliseconds := 60000
 );$$
);
