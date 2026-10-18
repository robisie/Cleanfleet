select cron.alter_job((select jobid from cron.job where jobname='cleanfleet-reminder-mail-check'),schedule := '0 6 * * *');
