-- LOCAL DATABASE ONLY: run after aga_bill_fixture.sql and both Aga migrations.
-- All records are synthetic; never run invoice issuance tests against production.
begin;
set local role service_role;
do $$
declare actor uuid; test_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); rev bigint; result jsonb; row public.bill_invoices; entry jsonb; count_rows integer; denied boolean:=false; today date:=(now() at time zone 'Europe/Warsaw')::date;
begin
 select creator_id into actor from public.bill_invoices where payload#>>'{buyer,name}' ilike 'AGAR SERWIS%' order by created_at desc limit 1;
 if actor is null then raise exception 'Fixture: owner with AGAR template required';end if;
 select revision into rev from public.rs_settings where owner_id=actor;
 result:=public.rs_aga_bill_draft(actor,test_id,12.34,today,9,null,'Test transakcyjny',rev);
 select * into row from public.bill_invoices where bill_invoices.id=test_id;
 if row.status<>'draft' or row.number is not null or row.payload#>>'{lines,0,name}'<>'Usługi sprzątające' then raise exception 'Draft check failed';end if;
 select count(*) into count_rows from public.rs_settings s,jsonb_array_elements(s.payload#>'{agaAnnual,invoices}') x where s.owner_id=actor and x->>'sourceBillId'=test_id::text;
 if count_rows<>0 then raise exception 'Draft counted prematurely';end if;
 perform public.rs_aga_bill_draft(actor,test_id,12.34,today,9,null,'Retry',rev);
 begin update public.bill_invoices set payload=payload-'source' where bill_invoices.id=test_id;exception when others then denied:=true;end;
 if not denied then raise exception 'Source link could be removed';end if;
 -- Bill may edit the amount before actual issuance; the annual entry must use that final amount.
 row.payload:=jsonb_set(row.payload,'{lines,0,price}','"15.67"');
 row:=public.bill_issue_prepared(test_id,row.revision,row.payload);
 select x into entry from public.rs_settings s,jsonb_array_elements(s.payload#>'{agaAnnual,invoices}') x where s.owner_id=actor and x->>'sourceBillId'=test_id::text;
 if entry is null or (entry->>'amount')::numeric<>15.67 or (entry->>'rate')::numeric<>9 or entry->>'number'<>row.number then raise exception 'Issued sync failed';end if;
 perform public.bill_issue_prepared(test_id,row.revision,row.payload);
 select count(*) into count_rows from public.rs_settings s,jsonb_array_elements(s.payload#>'{agaAnnual,invoices}') x where s.owner_id=actor and x->>'sourceBillId'=test_id::text;
 if count_rows<>1 then raise exception 'Duplicate annual invoice';end if;
 select revision into rev from public.rs_settings where owner_id=actor;
 perform public.rs_aga_bill_draft(actor,other_id,15,today,9,false,'Delete test',rev);
 delete from public.bill_invoices where bill_invoices.id=other_id;
 if exists(select 1 from public.rs_settings where owner_id=actor and payload#>array['agaAnnual','billDrafts',other_id::text] is not null) then raise exception 'Draft context not cleaned';end if;
 if has_function_privilege('authenticated','public.rs_aga_bill_draft(uuid,uuid,numeric,date,numeric,boolean,text,bigint)','execute') or has_function_privilege('anon','public.rs_aga_bill_draft(uuid,uuid,numeric,date,numeric,boolean,text,bigint)','execute') then raise exception 'Service-only RPC exposed';end if;
end $$;
rollback;
