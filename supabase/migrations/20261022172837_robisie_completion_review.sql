-- Completion and earnings are separate, explicit operations. Existing earnings
-- remain untouched; reopening keeps the existing transactional removal trigger.
create function public.rs_finish_project(p_id uuid,p_revision bigint)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
declare r public.rs_projects;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 select * into r from public.rs_projects where id=p_id and owner_id=auth.uid() for update;
 if r.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 if p_revision is null or r.revision<>p_revision then
  if r.revision=p_revision+1 and r.payload->>'status'='zakonczona' then return r;end if;
  raise exception 'RS_CONFLICT: Inwestycja zmieniła się. Otwórz zamknięcie ponownie.';
 end if;
 if nullif(r.payload#>>'{handover,date}','')::date is null or r.payload#>>'{handover,accepted}' is distinct from 'true' then
  raise exception 'Uzupełnij datę odbioru i akceptację prac.';end if;
 if r.payload->>'status'='zakonczona' then return r;end if;
 update public.rs_projects set payload=jsonb_set(payload,'{status}','"zakonczona"'::jsonb),revision=revision+1,updated_at=now()
 where id=p_id returning * into r;
 return r;
end;$$;
revoke all on function public.rs_finish_project(uuid,bigint) from public,anon;
grant execute on function public.rs_finish_project(uuid,bigint) to authenticated;

create function public.rs_add_project_earnings(p_id uuid,p_revision bigint,p_amount numeric)
returns public.cf_earnings language plpgsql security invoker set search_path='' as $$
declare r public.rs_projects; e public.cf_earnings; d date; n text;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<0 then raise exception 'Nieprawidłowa kwota zarobku.';end if;
 select * into r from public.rs_projects where id=p_id and owner_id=auth.uid() for update;
 if r.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 if r.payload->>'status' is distinct from 'zakonczona' then raise exception 'Najpierw zakończ inwestycję.';end if;
 if p_revision is null or r.revision<>p_revision then raise exception 'RS_CONFLICT: Inwestycja zmieniła się. Otwórz dodawanie zarobku ponownie.';end if;
 -- Do not overwrite an existing entry, including manually edited earnings.
 select * into e from public.cf_earnings where source_robisie_project_id=p_id and created_by=auth.uid();
 if e.id is not null then return e;end if;
 d:=nullif(r.payload#>>'{handover,date}','')::date;n:=nullif(btrim(r.payload->>'name'),'');
 if d is null or n is null or r.payload#>>'{handover,accepted}' is distinct from 'true' then raise exception 'Uzupełnij nazwę, datę odbioru i akceptację prac.';end if;
 insert into public.cf_earnings(work_date,contractor,description,total_amount,my_amount,employee_amount,employee_name,employee_paid,note,created_by,source_robisie_project_id)
 values(d,coalesce(nullif(btrim(r.payload->>'investor'),''),'Robisię'),n,round(p_amount,2),round(p_amount,2),0,null,false,
 'Robisię · '||r.contract_number||' · robocizna po zakończeniu inwestycji',auth.uid(),p_id)
 returning * into e;
 return e;
end;$$;
revoke all on function public.rs_add_project_earnings(uuid,bigint,numeric) from public,anon;
grant execute on function public.rs_add_project_earnings(uuid,bigint,numeric) to authenticated;

-- A cached older client cannot recreate automatic earnings on completion.
create or replace function public.rs_finish_project_with_earnings(p_id uuid,p_revision bigint,p_amount numeric)
returns public.rs_projects language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'Odśwież Robisię. Zakończenie inwestycji i dodanie do zarobków są teraz osobnymi krokami.';
end;$$;
notify pgrst,'reload schema';
