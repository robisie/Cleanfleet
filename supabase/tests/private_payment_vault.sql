-- Non-destructive integration test. Every test write is rolled back.
begin;
create temporary table payment_test_actors as
 select (select user_id from public.user_roles where role='admin' limit 1) as admin_id,
        (select id from auth.users where id not in(select user_id from public.user_roles where role='admin') limit 1) as other_id;
grant select on payment_test_actors to authenticated;
select set_config('request.jwt.claim.sub',(select admin_id::text from payment_test_actors),true);
set local role authenticated;
do $$
declare rev bigint;current_rev bigint;encrypted jsonb:=jsonb_build_object('version',1,'iterations',600000,'salt','AAAAAAAAAAAAAAAAAAAAAA==','iv','AAAAAAAAAAAAAAAA','ciphertext',repeat('A',32));
begin
 if not public.cf_is_admin() then raise exception 'Admin fixture missing';end if;
 select revision into current_rev from public.cf_payment_vaults where user_id=auth.uid();
 rev:=public.cf_save_payment_vault(encrypted,coalesce(current_rev,0));
 if rev<>coalesce(current_rev,0)+1 then raise exception 'Wrong revision';end if;
 begin
   perform public.cf_save_payment_vault(encrypted,coalesce(current_rev,0));
   raise exception 'Stale update accepted';
 exception when others then if sqlerrm<>'PAYMENT_CONFLICT' then raise;end if;end;
 begin
   perform public.cf_save_payment_vault('{}',rev);
   raise exception 'Invalid envelope accepted';
 exception when check_violation then null;end;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub',(select other_id::text from payment_test_actors),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.cf_payment_vaults) then raise exception 'Non-admin can read vault';end if;
 begin
   perform public.cf_save_payment_vault('{}',0);
   raise exception 'Non-admin can write vault';
 exception when others then if sqlerrm<>'Dostęp tylko dla administratora.' then raise;end if;end;
end;
$$;
reset role;
do $$begin
 if has_table_privilege('anon','public.cf_payment_vaults','SELECT') or has_function_privilege('anon','public.cf_save_payment_vault(jsonb,bigint)','EXECUTE') then raise exception 'Anonymous privileges';end if;
end;$$;
rollback;
select 'passed: encrypted writes, revision conflict, envelope validation, non-admin and anonymous denial; all test data rolled back' as payment_vault_tests;
