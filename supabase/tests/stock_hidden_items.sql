begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text;before_stock jsonb;after_stock jsonb;
begin
 n:=public.rs_receipt_save(md5(random()::text)||md5(random()::text),jsonb_build_object('date','2026-10-30','number','TEST-HIDDEN-'||gen_random_uuid(),'seller','Sklep testowy','sellerNip','1111111111','buyerNip','6351861297','total',20,'items',jsonb_build_array(jsonb_build_object('name','Towar testowy','quantity',2,'unit','szt.','gross',20))));
 select value into before_stock from jsonb_array_elements(public.rs_ksef_stock()) where value#>>'{metadata,ksefNumber}'=n;
 perform public.rs_ksef_set_hidden(n,1,true);
 perform public.rs_ksef_set_hidden(n,1,true);
 if (select count(*) from public.rs_stock_hidden where ksef_number=n)<>1 then raise exception 'Hide must be idempotent and visible to its owner';end if;
 select value into after_stock from jsonb_array_elements(public.rs_ksef_stock()) where value#>>'{metadata,ksefNumber}'=n;
 if before_stock is distinct from after_stock then raise exception 'Hiding changed stock or costs';end if;
 begin perform public.rs_ksef_set_hidden(n,99,true);raise exception 'Invalid line was accepted';exception when invalid_parameter_value then null;end;
 perform public.rs_ksef_set_hidden(n,1,false);
 if exists(select 1 from public.rs_stock_hidden where ksef_number=n) then raise exception 'Restore did not remove visibility marker';end if;
 perform public.rs_ksef_set_hidden(n,1,true);
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 if exists(select 1 from public.rs_stock_hidden where ksef_number=n) then raise exception 'Another account can see hidden goods';end if;
 begin perform public.rs_ksef_set_hidden(n,1,false);raise exception 'Another account changed visibility';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select not has_table_privilege('anon','public.rs_stock_hidden','select') as anonymous_read_denied,not has_function_privilege('anon','public.rs_ksef_set_hidden(text,integer,boolean)','execute') as anonymous_write_denied;
rollback;
