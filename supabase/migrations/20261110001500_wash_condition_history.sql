alter table public.wash_records
 add column condition_level smallint check (condition_level between 1 and 4),
 add column condition_factors text[] not null default '{}'::text[]
 check (condition_factors <@ array['mud','sand','stains','fur','trash','odor']::text[] and cardinality(condition_factors)<=6);

-- Existing completion checks permissions, status, services and amount. The new
-- overload keeps condition and completion in the same transaction.
create function public.cf_complete_wash_records(
 p_wash_record_ids uuid[], p_wash_date date,
 p_start_time time, p_end_time time, p_performed_by text,
 p_cost numeric, p_service_ids uuid[], p_completion_notes text,
 p_duration_hours numeric, p_condition_level smallint, p_condition_factors text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_condition_level is not null and p_condition_level not between 1 and 4 then
  raise exception 'Wybierz poprawny stan czystości.';
 end if;
 if p_condition_factors is null or not (p_condition_factors <@ array['mud','sand','stains','fur','trash','odor']::text[])
    or cardinality(p_condition_factors)>6 or (p_condition_level is null and cardinality(p_condition_factors)>0) then
  raise exception 'Wybierz poprawne cechy zabrudzenia.';
 end if;
 if cardinality(p_wash_record_ids)<>1 and (p_condition_level is not null or cardinality(p_condition_factors)>0) then
  raise exception 'Stan czystości oceniaj osobno dla każdego auta.';
 end if;
 result:=public.cf_complete_wash_records(p_wash_record_ids,p_wash_date,p_start_time,p_end_time,
  p_performed_by,p_cost,p_service_ids,p_completion_notes,p_duration_hours);
 if cardinality(p_wash_record_ids)=1 then
  update public.wash_records set condition_level=p_condition_level,condition_factors=p_condition_factors
  where id=p_wash_record_ids[1];
 end if;
 return result;
end;
$$;
revoke all on function public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric,smallint,text[]) from public,anon;
grant execute on function public.cf_complete_wash_records(uuid[],date,time,time,text,numeric,uuid[],text,numeric,smallint,text[]) to authenticated;

-- The existing review RPC approves employee edits. Persist the new fields
-- in that same transaction after the request becomes approved.
create function public.cf_apply_approved_wash_condition() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and old.status='pending' and new.request_type='edit'
    and new.proposed_data ? 'condition_level' then
  update public.wash_records set
   condition_level=nullif(new.proposed_data->>'condition_level','')::smallint,
   condition_factors=coalesce(array(select jsonb_array_elements_text(new.proposed_data->'condition_factors')),'{}'::text[])
  where id=new.wash_record_id;
 end if;
 return new;
end;
$$;
create trigger cf_apply_approved_wash_condition_trigger after update of status
on public.wash_change_requests for each row
execute function public.cf_apply_approved_wash_condition();
revoke all on function public.cf_apply_approved_wash_condition() from public,anon,authenticated;
notify pgrst, 'reload schema';
