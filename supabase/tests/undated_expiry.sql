begin;
do $$
declare
 fixture public.wash_records%rowtype;
 test_id uuid;
 row_after public.wash_records%rowtype;
 deadline timestamptz;
begin
 select * into fixture from public.wash_records where company_id is not null and created_by is not null limit 1;
 if not found then raise exception 'Missing company fixture'; end if;
 deadline := statement_timestamp() - interval '1 hour';
 insert into public.wash_records(company_id,plate,created_by,ordered,created_at)
 values(fixture.company_id,fixture.plate,fixture.created_by,true,deadline - interval '168 hours') returning id into test_id;
 select * into row_after from public.wash_records where id=test_id;
 if row_after.undated_expired_at is distinct from deadline then raise exception 'Old undated order not expired at original deadline'; end if;
 update public.wash_records set notes='Expiry regression',created_at=statement_timestamp(),undated_expired_at=null where id=test_id;
 select * into row_after from public.wash_records where id=test_id;
 if row_after.created_at is distinct from deadline - interval '168 hours' or row_after.undated_expired_at is distinct from deadline then raise exception 'Editing reset the clock or erased history'; end if;
 update public.wash_records set order_due_date=current_date+1 where id=test_id;
 select * into row_after from public.wash_records where id=test_id;
 if row_after.order_due_date is null or row_after.undated_expired_at is distinct from deadline then raise exception 'Rescheduling lost expiry history'; end if;
 insert into public.wash_records(company_id,plate,created_by,ordered,created_at,order_due_date)
 values(fixture.company_id,fixture.plate,fixture.created_by,true,deadline-interval '168 hours',current_date+1) returning id into test_id;
 if exists(select from public.wash_records where id=test_id and undated_expired_at is not null) then raise exception 'Established date incorrectly expired'; end if;
 insert into public.wash_records(company_id,plate,created_by,ordered,created_at,schedule_status)
 values(fixture.company_id,fixture.plate,fixture.created_by,true,deadline-interval '168 hours','pending_admin') returning id into test_id;
 if exists(select from public.wash_records where id=test_id and undated_expired_at is not null) then raise exception 'Approval proposal incorrectly expired'; end if;
 insert into public.wash_records(company_id,plate,created_by,ordered,created_at)
 values(fixture.company_id,fixture.plate,fixture.created_by,true,statement_timestamp()-interval '167 hours') returning id into test_id;
 if exists(select from public.wash_records where id=test_id and undated_expired_at is not null) then raise exception 'Fresh order expired early'; end if;
 insert into public.wash_records(company_id,plate,created_by,ordered,created_at)
 values(fixture.company_id,fixture.plate,fixture.created_by,true,statement_timestamp()-interval '168 hours') returning id into test_id;
 if not exists(select from public.wash_records where id=test_id and undated_expired_at=statement_timestamp()) then raise exception 'Exact seven-day boundary failed'; end if;
end;$$;
rollback;
select 'PASS: seven-day boundary; description edits preserve creation; expiry history retained; fresh orders, dates and proposals excluded; test data rolled back' result;
