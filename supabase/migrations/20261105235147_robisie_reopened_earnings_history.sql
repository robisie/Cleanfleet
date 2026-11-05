create table public.rs_reopened_earnings_history (
  earning_id uuid primary key,
  project_id uuid references public.rs_projects(id) on delete set null,
  work_date date not null,
  my_amount numeric not null,
  reopened_at timestamptz not null default statement_timestamp()
);

create index rs_reopened_earnings_history_project_date
  on public.rs_reopened_earnings_history(project_id, reopened_at desc, earning_id);

alter table public.rs_reopened_earnings_history enable row level security;
revoke all on public.rs_reopened_earnings_history from public, anon, authenticated;
grant select on public.rs_reopened_earnings_history to authenticated;
create policy rs_reopened_earnings_history_read on public.rs_reopened_earnings_history
for select to authenticated using (
  (select public.cf_is_admin()) and exists (
    select 1 from public.rs_projects project
    where project.id = rs_reopened_earnings_history.project_id
      and project.owner_id = (select auth.uid())
  )
);

-- Archive and remove the active earning in the same transaction as reopening.
-- Only the trigger can write the archive. Authenticated users can read their own history.
alter function public.rs_remove_reopened_earnings() set schema private;
create or replace function private.rs_remove_reopened_earnings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.payload->>'status' = 'zakonczona'
     and new.payload->>'status' is distinct from 'zakonczona' then
    if auth.uid() is not null
       and (auth.uid() is distinct from new.owner_id or not coalesce(public.cf_is_admin(), false)) then
      raise exception 'Brak dostępu do historii zarobku inwestycji.';
    end if;

    with removed as (
      delete from public.cf_earnings
      where source_robisie_project_id = new.id and created_by = new.owner_id
      returning id, work_date, my_amount
    )
    insert into public.rs_reopened_earnings_history (earning_id, project_id, work_date, my_amount)
    select id, new.id, work_date, my_amount from removed;
  end if;
  return new;
end;
$$;

revoke all on function private.rs_remove_reopened_earnings() from public, anon, authenticated;
