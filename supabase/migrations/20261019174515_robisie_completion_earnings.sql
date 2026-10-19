-- Explicit exchange: only completion in Robisię creates an earnings entry.
-- No historical backfill; deleting an investment preserves its earnings history.
alter table public.cf_earnings add column source_robisie_project_id uuid
 references public.rs_projects(id) on delete set null;
create unique index cf_earnings_robisie_project_unique
 on public.cf_earnings(source_robisie_project_id) where source_robisie_project_id is not null;

-- Amount comes from the existing Robisię calculation engine (including imported
-- settlements and discounts). Only the owner/admin may submit it, just as with
-- manual earnings. The revision binds it to the saved calculation snapshot.
create function public.rs_finish_project_with_earnings(p_id uuid,p_revision bigint,p_amount numeric)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare v_row public.rs_projects; v_date date; v_name text; v_amount numeric;
begin
 if auth.uid() is null or not public.cf_is_admin() then
  raise exception 'Dostęp tylko dla administratora.';
 end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<0 then
  raise exception 'Nieprawidłowa kwota końcowa inwestycji.';
 end if;
 v_amount:=round(p_amount,2);
 select * into v_row from public.rs_projects where id=p_id and owner_id=auth.uid() for update;
 if v_row.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 v_date:=nullif(v_row.payload#>>'{handover,date}','')::date;
 v_name:=nullif(btrim(v_row.payload->>'name'),'');
 if v_date is null or v_row.payload#>>'{handover,accepted}' is distinct from 'true' then
  raise exception 'Uzupełnij datę odbioru i akceptację prac.';
 end if;
 if v_name is null then raise exception 'Uzupełnij nazwę inwestycji.';end if;
 if v_row.revision<>p_revision or p_revision is null then
  -- A lost response may be retried, but never overwrite a newer calculation.
  if v_row.revision=p_revision+1 and v_row.payload->>'status'='zakonczona'
   and exists(select 1 from public.cf_earnings where source_robisie_project_id=p_id
    and created_by=auth.uid() and total_amount=v_amount and my_amount=v_amount
    and work_date=v_date and description=v_name) then return v_row;end if;
  raise exception 'RS_CONFLICT: Inwestycja zmieniła się. Odśwież widok przed zakończeniem.';
 end if;
 insert into public.cf_earnings(work_date,contractor,description,total_amount,my_amount,
  employee_amount,employee_name,employee_paid,note,created_by,source_robisie_project_id)
 values(v_date,coalesce(nullif(btrim(v_row.payload->>'investor'),''),'Robisię'),v_name,v_amount,v_amount,
  0,null,false,'Robisię · '||v_row.contract_number||' · zakończenie inwestycji',auth.uid(),p_id)
 on conflict(source_robisie_project_id) where source_robisie_project_id is not null do update
 set work_date=excluded.work_date,contractor=excluded.contractor,description=excluded.description,
 total_amount=excluded.total_amount,my_amount=excluded.my_amount,employee_amount=0,employee_name=null,
 note=excluded.note;
 update public.rs_projects set payload=jsonb_set(payload,'{status}','"zakonczona"'::jsonb),
  revision=revision+1,updated_at=now() where id=p_id returning * into v_row;
 return v_row;
end;$$;
revoke all on function public.rs_finish_project_with_earnings(uuid,bigint,numeric) from public,anon;
grant execute on function public.rs_finish_project_with_earnings(uuid,bigint,numeric) to authenticated;
