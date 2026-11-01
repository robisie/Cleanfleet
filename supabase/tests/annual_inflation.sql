-- Runs against the existing schema; every fixture and price change is rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
do $$
declare admin_id uuid; context jsonb; original jsonb; after_apply jsonb; result jsonb; old public.rs_settings; next_payload jsonb; next_catalog jsonb; changes jsonb; changed_projects jsonb; project_digest text; revision bigint; due timestamptz; bad boolean;
begin
 select user_id into admin_id from public.user_roles where role='admin' and exists(select 1 from public.rs_settings where owner_id=user_id) limit 1;
 if admin_id is null then raise exception 'Test requires an existing administrator with Robisię settings.'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 insert into public.cf_inflation_reports(year,price_index,source_url) values(2098,103.6,'https://stat.gov.pl/test-transaction-only');
 context:=public.cf_inflation_context('cleanfleet');original:=context->'catalog';
 -- A stale preview must never apply.
 bad:=false;
 begin perform public.cf_inflation_decide('cleanfleet',2098,'apply',null,null,'[]');exception when others then bad:=true;end;
 if not bad then raise exception 'Stale snapshot accepted';end if;
 perform public.cf_inflation_decide('cleanfleet',2098,'apply',null,null,original);
 context:=public.cf_inflation_context('cleanfleet');after_apply:=context->'catalog';
 if exists(select 1 from jsonb_array_elements(original) o join jsonb_array_elements(after_apply) a on a->>'id'=o->>'id' where (a->>'price')::numeric<>round((o->>'price')::numeric*1.036,2)) then raise exception 'Wrong CF prices';end if;
 result:=public.cf_inflation_decide('cleanfleet',2098,'apply',null,null,after_apply);
 if result->>'alreadyDecided'<>'true' or (public.cf_inflation_context('cleanfleet')->'catalog')<>after_apply then raise exception 'Applied twice';end if;
 perform public.cf_inflation_decide('cleanfleet',2098,'undo');
 if exists(select 1 from jsonb_array_elements(original) o join public.cf_service_catalog c on c.id=(o->>'id')::uuid where c.price<>(o->>'price')::numeric) then raise exception 'Undo failed';end if;
 -- Snooze is durable and independent between apps.
 context:=public.cf_inflation_context('robisie');
 perform public.cf_inflation_decide('robisie',2098,'snooze');
 context:=public.cf_inflation_context('robisie');due:=(context->'decision'->>'remind_at')::timestamptz;
 if due<now()+interval '71 hours' or due>now()+interval '73 hours' then raise exception 'Wrong snooze date';end if;
 if public.cf_inflation_context('cleanfleet')->'decision'->>'status'<>'undone' then raise exception 'Cross-app decision changed';end if;
 select * into old from public.rs_settings where owner_id=admin_id;
 select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) into project_digest from public.rs_projects p;
 select jsonb_agg(item||jsonb_build_object('base',round((item->>'base')::numeric*1.036,2)) order by ord),jsonb_agg(jsonb_build_object('id',item->'id','name',item->'name','category',item->'category','before',round((item->>'base')::numeric,2),'after',round((item->>'base')::numeric*1.036,2)) order by ord) into next_catalog,changes from jsonb_array_elements(old.payload->'catalog') with ordinality c(item,ord);
 next_payload:=old.payload||jsonb_build_object('catalog',next_catalog,'catalogCorrections',coalesce(old.payload->'catalogCorrections','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'date',now(),'percent',3.6,'reason','GUS rollback test','changes',changes)));
 perform public.cf_inflation_decide('robisie',2098,'apply',old.revision,next_payload);
 select payload,rs_settings.revision into after_apply,revision from public.rs_settings where owner_id=admin_id;
 if after_apply->'markup' is distinct from old.payload->'markup' or after_apply->'catalog'<>next_catalog or revision<>old.revision+1 then raise exception 'Wrong Robisię correction';end if;
 -- Replaying an approved report must not change prices a second time.
 result:=public.cf_inflation_decide('robisie',2098,'apply',revision,next_payload);
 if result->>'alreadyDecided'<>'true' then raise exception 'RS replay accepted';end if;
 -- Reject persists across context reads.
 insert into public.cf_inflation_reports(year,price_index,source_url) values(2099,104,'https://stat.gov.pl/test-transaction-only');
 perform public.cf_inflation_decide('robisie',2099,'reject');
 if public.cf_inflation_context('robisie')->'decision'->>'status'<>'rejected' then raise exception 'Reject not persisted';end if;
 if has_table_privilege('authenticated','public.cf_inflation_decisions','UPDATE') or has_table_privilege('anon','public.cf_inflation_reports','SELECT') then raise exception 'Excessive grants';end if;
end;$$;
rollback;
select 'annual inflation integration checks passed; all fixtures rolled back' as result;
