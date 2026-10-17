begin;
-- All synthetic rows and number allocation are rolled back, no KSeF request.
do $$
declare u uuid; c uuid:=gen_random_uuid(); w1 uuid:=gen_random_uuid();w2 uuid:=gen_random_uuid();d uuid:=gen_random_uuid();d2 uuid:=gen_random_uuid();r public.bill_invoices;linked uuid;before_count int; v_payload jsonb; caught boolean;
begin
 select user_id into u from public.user_roles where role='admin' limit 1;
 insert into public.companies(id,name,active) values(c,'BILL QA - ROLLBACK',true);
 insert into public.wash_records(id,company_id,plate,type,performed_by,approved,wash_date,cost,currency) values
 (w1,c,'QA001','CIĘŻAROWY','Michał',true,current_date,150.10,'PLN'),(w2,c,'QA002','BUS','Michał',true,current_date,50.20,'PLN');
 v_payload:=jsonb_build_object('issueDate',to_char(now() at time zone 'Europe/Warsaw','YYYY-MM-DD'),'lines','[{"name":"TEST"}]'::jsonb);
 select last_number into before_count from public.bill_counters where period=to_char(current_date,'YYYY-MM');
 r:=public.bill_create_fleet_draft(d,u,c,null,to_char(current_date,'YYYY-MM'),array[w1,w2],v_payload,'{"columns":["tablica","kwota"]}',20030);
 if r.number is not null or r.status<>'draft' or jsonb_array_length(r.payload->'lines')<>2 or (select sum((x->>'price')::numeric) from jsonb_array_elements(r.payload->'lines') x)<>200.30 then raise exception 'draft invariant';end if;
 if exists(select 1 from public.invoices where company_id=c) then raise exception 'draft created receivable';end if;
 r:=public.bill_create_fleet_draft(d,u,c,null,to_char(current_date,'YYYY-MM'),array[w1,w2],v_payload,'{}',20030);
 caught:=false;begin perform public.bill_create_fleet_draft(d2,u,c,null,to_char(current_date,'YYYY-MM'),array[w1],v_payload,'{}',15010);exception when raise_exception then caught:=true;end;if not caught then raise exception 'double reservation';end if;
 update public.wash_records set cost=151 where id=w1;
 caught:=false;begin perform public.bill_issue(d,1);exception when raise_exception then caught:=true;end;if not caught then raise exception 'changed amount accepted';end if;
 if exists(select 1 from public.invoices where company_id=c) then raise exception 'failed issue left receivable';end if;
 if (select last_number from public.bill_counters where period=to_char(current_date,'YYYY-MM')) is distinct from before_count then raise exception 'failed issue consumed number';end if;
 update public.wash_records set cost=150.10 where id=w1;
 r:=public.bill_issue(d,1);
 select cf_invoice_id into linked from public.bill_fleet_attachments where invoice_id=d;
 if linked is null or (select amount from public.invoices where id=linked)<>200.30 or (select count(*) from public.invoice_items where invoice_id=linked)<>2 then raise exception 'issue not atomic';end if;
 if exists(select 1 from public.wash_records where id=any(array[w1,w2]) and paid) then raise exception 'marked paid';end if;
 caught:=false;begin delete from public.invoice_items where invoice_id=linked;exception when raise_exception then caught:=true;end;if not caught then raise exception 'issued items mutable';end if;
 caught:=false;begin update public.invoices set amount=1 where id=linked;exception when raise_exception then caught:=true;end;if not caught then raise exception 'issued amount mutable';end if;
 update public.invoices set status='paid',paid_at=now() where id=linked;
 if (select status from public.invoices where id=linked)<>'paid' then raise exception 'payment blocked';end if;
 perform public.bill_issue(d,1);
 if (select count(*) from public.invoices where company_id=c)<>1 then raise exception 'issue not idempotent';end if;
 -- A separate draft can be removed, releasing its reservation.
 insert into public.wash_records(id,company_id,plate,performed_by,approved,wash_date,cost) values(d2,c,'QA003','Michał',true,current_date,1);
 perform public.bill_create_fleet_draft(d2,u,c,null,to_char(current_date,'YYYY-MM'),array[d2],v_payload,'{}',100);
 delete from public.bill_invoices where id=d2;
 if exists(select 1 from public.bill_fleet_items where wash_record_id=d2) then raise exception 'reservation leak';end if;
 if has_table_privilege('authenticated','public.bill_fleet_attachments','SELECT') or has_function_privilege('anon','public.bill_create_fleet_draft(uuid,uuid,uuid,uuid,text,uuid[],jsonb,jsonb,bigint)','EXECUTE') then raise exception 'public privilege leak';end if;
end $$;
rollback;
select 'bill-fleet transaction checks passed; all fixtures rolled back' as result;
