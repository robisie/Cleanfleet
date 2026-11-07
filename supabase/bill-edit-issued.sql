-- Trigger-only guard reads service-owned links; it grants no RPC/data access.
create or replace function public.bill_fleet_protect_cf() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='invoice_items' then
  if exists(select 1 from public.bill_fleet_attachments a where a.cf_invoice_id in (case when tg_op<>'INSERT' then old.invoice_id end,case when tg_op<>'DELETE' then new.invoice_id end)) then
   raise exception 'Pozycje faktury z Bill są zablokowane. Dokument jest dostępny w Bill.';
  end if;
 elsif exists(select 1 from public.bill_fleet_attachments where cf_invoice_id=old.id) then
  if tg_op='DELETE' then raise exception 'Nie można usunąć rozliczenia faktury wystawionej w Bill.'; end if;
  if row(new.company_id,new.billing_company_id,new.invoice_number,new.period,new.amount,new.currency) is distinct from row(old.company_id,old.billing_company_id,old.invoice_number,old.period,old.amount,old.currency) then raise exception 'Dane faktury z Bill są zablokowane. Możesz oznaczyć jej zapłatę.';end if;
  if new.invoice_date is distinct from old.invoice_date and not (
   pg_trigger_depth()>1 and exists (
    select 1 from public.bill_fleet_attachments a
    join public.bill_invoices b on b.id=a.invoice_id
    where a.cf_invoice_id=old.id and b.status='issued'
      and (b.payload->>'issueDate')::date=new.invoice_date
   )
  ) then raise exception 'Datę powiązanej faktury zmień w Bill.'; end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function public.bill_fleet_protect_cf() from public,anon,authenticated;

-- Keep the CleanFleet settlement date in the same transaction as an edit in Bill.
create function private.bill_sync_fleet_issue_date() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.invoices i
 set invoice_date=(new.payload->>'issueDate')::date
 from public.bill_fleet_attachments a
 where a.invoice_id=new.id and a.cf_invoice_id=i.id;
 return new;
end $$;
revoke all on function private.bill_sync_fleet_issue_date() from public,anon,authenticated;
grant execute on function private.bill_sync_fleet_issue_date() to service_role;
create trigger bill_sync_fleet_issue_date
after update of payload on public.bill_invoices
for each row when (
 old.status='issued' and new.status='issued'
 and (old.payload->>'issueDate') is distinct from (new.payload->>'issueDate')
) execute function private.bill_sync_fleet_issue_date();
