-- Preserve meaning: old light/typical/strong/very strong become 2/3/4/5.
-- The new 1/5 is reserved for minimal dirt.
alter table public.wash_records drop constraint wash_records_condition_level_check;
update public.wash_records set condition_level=condition_level+1 where condition_level is not null;
alter table public.wash_records add constraint wash_records_condition_level_check check (condition_level between 1 and 5);

create or replace function public.cf_complete_wash_records(
 p_wash_record_ids uuid[], p_wash_date date,
 p_start_time time, p_end_time time, p_performed_by text,
 p_cost numeric, p_service_ids uuid[], p_completion_notes text,
 p_duration_hours numeric, p_condition_level smallint, p_condition_factors text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_condition_level is not null and p_condition_level not between 1 and 5 then
  raise exception 'Wybierz poprawny stan czystości.';
 end if;
 if p_condition_factors is null or (p_condition_level is null and cardinality(p_condition_factors)>0) then
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
notify pgrst, 'reload schema';
