create table private.ecosystem_backup_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  state text not null default 'queued' check (state in ('queued','running','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ecosystem_backup_one_active_per_owner
  on private.ecosystem_backup_jobs(owner_id) where state in ('queued','running');
alter table private.ecosystem_backup_jobs enable row level security;
revoke all on private.ecosystem_backup_jobs from public, anon, authenticated;
