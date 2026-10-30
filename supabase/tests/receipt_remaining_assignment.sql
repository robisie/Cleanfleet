begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text;rows jsonb;r jsonb;
begin
 assert not has_function_privilege('anon','public.rs_receipt_assign_remaining(text,text,jsonb)','execute');
 n:=public.rs_receipt_save(encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),jsonb_build_object('buyerNip','6351861297','sellerNip','5260250995','seller','Sklep testowy','number','TEST-'||gen_random_uuid()::text,'date',current_date,'total',50,'items',jsonb_build_array(jsonb_build_object('name','Towar zwrócony','unit','szt.','quantity',1,'gross',10),jsonb_build_object('name','Towar częściowo zwrócony','unit','szt.','quantity',3,'gross',30),jsonb_build_object('name','Towar pozostały','unit','szt.','quantity',1,'gross',10))));
 perform public.rs_ksef_set_return(n,1,1,0);perform public.rs_ksef_set_return(n,2,1,0);
 begin perform public.rs_receipt_assign_remaining(n,'auto','[{"index":2,"quantity":3},{"index":3,"quantity":1}]');assert false,'Stale quantities must fail';exception when raise_exception then null;end;
 assert not exists(select 1 from public.rs_ksef_stock_uses where ksef_number=n),'Stale request must not partially assign';
 perform public.rs_receipt_assign_remaining(n,'auto','[{"index":2,"quantity":2},{"index":3,"quantity":1}]');
 assert (select quantity=2 from public.rs_ksef_stock_uses where ksef_number=n and item_index=2 and category='auto');
 assert (select quantity=1 from public.rs_ksef_stock_uses where ksef_number=n and item_index=3 and category='auto');
 assert not exists(select 1 from public.rs_ksef_stock_uses where ksef_number=n and item_index=1);
 assert (select quantity=1 from public.rs_ksef_returns where ksef_number=n and item_index=1),'Returned row must remain returned';
 perform public.rs_ksef_set_return(n,1,0,1);perform public.rs_ksef_set_return(n,2,0,1);
 select x into r from jsonb_array_elements(public.rs_ksef_stock()) x where x#>>'{metadata,ksefNumber}'=n and x#>>'{item,index}'='1';assert (r->>'available')::numeric=1;
 perform public.rs_receipt_assign_remaining(n,'auto','[{"index":1,"quantity":1},{"index":2,"quantity":1}]');
 assert (select quantity=3 from public.rs_ksef_stock_uses where ksef_number=n and item_index=2 and category='auto'),'Restored quantity adds to the prior assignment';
end;$$;
rollback;
select 'Remaining receipt quantities, stale-state rejection, manual restoration, existing allocation preservation and permissions passed; fixtures rolled back.' as result;
