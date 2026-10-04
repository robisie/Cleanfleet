alter table public.cf_reminders
  add column if not exists mail_anchor_due_at timestamptz;

comment on column public.cf_reminders.mail_anchor_due_at is
  'Provisional/template due date used to schedule future recurring invoice scans even when the current due_at is replaced by the date read from an invoice.';
