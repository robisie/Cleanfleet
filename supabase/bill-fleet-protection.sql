-- Trigger-only guard reads service-owned links; it grants no RPC/data access.
create function public.bill_fleet_protect_cf() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='invoice_items' then
  if exists(select 1 from public.bill_fleet_attachments a where a.cf_invoice_id in (case when tg_op<>'INSERT' then old.invoice_id end,case when tg_op<>'DELETE' then new.invoice_id end)) then
   raise exception 'Pozycje faktury z Bill są zablokowane. Dokument jest dostępny w Bill.';
  end if;
 elsif exists(select 1 from public.bill_fleet_attachments where cf_invoice_id=old.id) then
  if tg_op='DELETE' then raise exception 'Nie można usunąć rozliczenia faktury wystawionej w Bill.'; end if;
  if row(new.company_id,new.billing_company_id,new.invoice_number,new.invoice_date,new.period,new.amount,new.currency) is distinct from row(old.company_id,old.billing_company_id,old.invoice_number,old.invoice_date,old.period,old.amount,old.currency) then raise exception 'Dane faktury z Bill są zablokowane. Możesz oznaczyć jej zapłatę.';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function public.bill_fleet_protect_cf() from public,anon,authenticated;
create trigger bill_fleet_protect_items before insert or update or delete on public.invoice_items for each row execute function public.bill_fleet_protect_cf();
create trigger bill_fleet_protect_invoice before update or delete on public.invoices for each row execute function public.bill_fleet_protect_cf();
