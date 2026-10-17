-- Normalize, freeze and allocate a number atomically; no KSeF operation.
create function public.bill_issue_prepared(p_id uuid,p_revision integer,p_payload jsonb)
returns public.bill_invoices language plpgsql security invoker set search_path='' as $$
declare r public.bill_invoices;
begin
 select * into r from public.bill_invoices where id=p_id for update;
 if not found then raise exception 'Nie znaleziono faktury.';end if;
 if r.status<>'draft' then return r;end if;
 if r.revision<>p_revision then raise exception 'Szkic zmienił się. Odśwież dane.';end if;
 update public.bill_invoices set payload=p_payload where id=p_id;
 return public.bill_issue(p_id,p_revision);
end $$;
revoke all on function public.bill_issue_prepared(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.bill_issue_prepared(uuid,integer,jsonb) to service_role;
