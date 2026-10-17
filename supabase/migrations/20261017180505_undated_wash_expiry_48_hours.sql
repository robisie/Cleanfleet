-- Shorten pending undated orders to 48 hours; retain existing expiry history.
create or replace function private.cf_stamp_undated_wash_expiry()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    NEW.created_at := OLD.created_at;
    NEW.undated_expired_at := OLD.undated_expired_at;
  else
    NEW.undated_expired_at := null;
  end if;
  if NEW.undated_expired_at is null
     and NEW.ordered and not NEW.approved and NEW.wash_date is null
     and NEW.order_due_date is null
     and coalesce(NEW.schedule_status, '') not in ('pending_admin', 'pending_employee', 'rejected')
     and NEW.created_at + interval '48 hours' <= statement_timestamp() then
    NEW.undated_expired_at := NEW.created_at + interval '48 hours';
  end if;
  return NEW;
end;
$$;
revoke all on function private.cf_stamp_undated_wash_expiry() from public, anon, authenticated;
comment on column public.wash_records.undated_expired_at is 'First expiry deadline: creation + 48 hours without an established wash date. Existing expiry history retained after rescheduling.';
-- The trigger stamps the original deadline, even if this job runs a little later.
update public.wash_records set undated_expired_at = created_at + interval '48 hours'
where undated_expired_at is null and ordered and not approved and wash_date is null and order_due_date is null
and coalesce(schedule_status, '') not in ('pending_admin', 'pending_employee', 'rejected')
and created_at + interval '48 hours' <= statement_timestamp();
select cron.schedule('cleanfleet-expire-undated-washes', '* * * * *', $cron$
update public.wash_records set undated_expired_at = created_at + interval '48 hours'
where undated_expired_at is null and ordered and not approved and wash_date is null and order_due_date is null
and coalesce(schedule_status, '') not in ('pending_admin', 'pending_employee', 'rejected')
and created_at + interval '48 hours' <= statement_timestamp();
$cron$);
