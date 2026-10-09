-- Keep undated orders in history while aging them out of active work.
alter table public.wash_records add column undated_expired_at timestamptz;
comment on column public.wash_records.undated_expired_at is 'First expiry deadline: creation + 7 days without an established wash date. Retained after rescheduling.';
create schema if not exists private;
create function private.cf_stamp_undated_wash_expiry()
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
     and NEW.created_at + interval '168 hours' <= statement_timestamp() then
    NEW.undated_expired_at := NEW.created_at + interval '168 hours';
  end if;
  return NEW;
end;
$$;
revoke all on function private.cf_stamp_undated_wash_expiry() from public, anon, authenticated;
create trigger cf_stamp_undated_wash_expiry before insert or update on public.wash_records
for each row execute function private.cf_stamp_undated_wash_expiry();
create index wash_records_undated_expiry_pending_idx on public.wash_records(created_at)
where undated_expired_at is null and ordered and not approved and wash_date is null and order_due_date is null
and coalesce(schedule_status, '') not in ('pending_admin', 'pending_employee', 'rejected');
-- The trigger stamps the original deadline, even if this job runs a little later.
update public.wash_records set undated_expired_at = created_at + interval '168 hours'
where undated_expired_at is null and ordered and not approved and wash_date is null and order_due_date is null
and coalesce(schedule_status, '') not in ('pending_admin', 'pending_employee', 'rejected')
and created_at + interval '168 hours' <= statement_timestamp();
select cron.schedule('cleanfleet-expire-undated-washes', '* * * * *', $cron$
update public.wash_records set undated_expired_at = created_at + interval '168 hours'
where undated_expired_at is null and ordered and not approved and wash_date is null and order_due_date is null
and coalesce(schedule_status, '') not in ('pending_admin', 'pending_employee', 'rejected')
and created_at + interval '168 hours' <= statement_timestamp();
$cron$);
