-- Explicit links for verified legacy payment evidence only.
create table public.bill_legacy_fleet_payment_links (
  invoice_id uuid primary key references public.bill_invoices(id) on delete cascade,
  cf_invoice_id uuid not null unique references public.invoices(id) on delete cascade
);
alter table public.bill_legacy_fleet_payment_links enable row level security;
revoke all on public.bill_legacy_fleet_payment_links from public, anon, authenticated;
grant select on public.bill_legacy_fleet_payment_links to service_role;

-- Production reconciliation is kept in the database migration history.
