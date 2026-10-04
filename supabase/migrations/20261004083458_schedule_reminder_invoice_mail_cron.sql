select cron.schedule(
  'cleanfleet-reminder-mail-check',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/cleanfleet-reminder-mail',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cleanfleet-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cleanfleet_cron_secret')
    ),
    body := jsonb_build_object('source','pg_cron'),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
