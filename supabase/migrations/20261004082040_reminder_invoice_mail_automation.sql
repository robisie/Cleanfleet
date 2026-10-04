alter table public.cf_reminders
  add column if not exists mail_invoice_enabled boolean not null default false,
  add column if not exists mail_folder text,
  add column if not exists mail_sender text,
  add column if not exists mail_subject_contains text,
  add column if not exists mail_attachment_contains text,
  add column if not exists mail_scan_days_before smallint not null default 2,
  add column if not exists mail_scan_status text not null default 'off',
  add column if not exists mail_last_checked_at timestamptz,
  add column if not exists mail_last_error text,
  add column if not exists mail_source_message_uid bigint,
  add column if not exists mail_source_subject text,
  add column if not exists mail_source_received_at date,
  add column if not exists mail_source_attachment text,
  add column if not exists mail_invoice_detected_at timestamptz,
  add column if not exists mail_candidate jsonb;

alter table public.cf_reminders
  drop constraint if exists cf_reminders_mail_folder_len,
  add constraint cf_reminders_mail_folder_len check (mail_folder is null or char_length(mail_folder) between 1 and 128),
  drop constraint if exists cf_reminders_mail_sender_len,
  add constraint cf_reminders_mail_sender_len check (mail_sender is null or char_length(mail_sender) <= 254),
  drop constraint if exists cf_reminders_mail_subject_len,
  add constraint cf_reminders_mail_subject_len check (mail_subject_contains is null or char_length(mail_subject_contains) <= 200),
  drop constraint if exists cf_reminders_mail_attachment_len,
  add constraint cf_reminders_mail_attachment_len check (mail_attachment_contains is null or char_length(mail_attachment_contains) <= 180),
  drop constraint if exists cf_reminders_mail_scan_days,
  add constraint cf_reminders_mail_scan_days check (mail_scan_days_before between 0 and 14),
  drop constraint if exists cf_reminders_mail_scan_status,
  add constraint cf_reminders_mail_scan_status check (mail_scan_status = any (array['off','waiting','applied','needs_review','error']::text[])),
  drop constraint if exists cf_reminders_mail_last_error_len,
  add constraint cf_reminders_mail_last_error_len check (mail_last_error is null or char_length(mail_last_error) <= 500),
  drop constraint if exists cf_reminders_mail_source_subject_len,
  add constraint cf_reminders_mail_source_subject_len check (mail_source_subject is null or char_length(mail_source_subject) <= 300),
  drop constraint if exists cf_reminders_mail_source_attachment_len,
  add constraint cf_reminders_mail_source_attachment_len check (mail_source_attachment is null or char_length(mail_source_attachment) <= 180),
  drop constraint if exists cf_reminders_mail_candidate_shape,
  add constraint cf_reminders_mail_candidate_shape check (
    mail_candidate is null
    or (jsonb_typeof(mail_candidate) = 'object' and octet_length(mail_candidate::text) <= 12000)
  );

create index if not exists cf_reminders_mail_scan_due_idx
  on public.cf_reminders (due_at, mail_last_checked_at)
  where mail_invoice_enabled = true and status in ('active','snoozed');

comment on column public.cf_reminders.mail_invoice_enabled is
  'When true, server automation looks for an invoice PDF in the configured mail folder and may update payment amount, invoice number and due date.';
comment on column public.cf_reminders.mail_candidate is
  'Non-authoritative candidate extracted from an invoice when automatic application is not sufficiently confident; PDF bytes are never stored.';
