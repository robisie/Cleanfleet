-- Transaction-only integration check: never retain test projects, corrections or counters.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from public.rs_settings limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare
 master public.rs_settings; corrected public.rs_settings; restored public.rs_settings;
 project public.rs_projects; saved public.rs_projects; before_projects jsonb; price numeric;
begin
 select * into master from public.rs_settings where owner_id=auth.uid();
 assert master.owner_id is not null, 'Missing test settings';
 select jsonb_agg(jsonb_build_object('id',id,'catalog',payload->'catalog','offer',payload->'offer','works',payload->'works','markup',payload->'markup') order by id) into before_projects from public.rs_projects;
 price:=(master.payload#>>'{catalog,0,base}')::numeric;
 select * into corrected from public.rs_save_settings(jsonb_set(master.payload,'{catalog,0,base}',to_jsonb(round(price*1.05,2))),master.revision);
 assert corrected.payload#>>'{catalog,0,base}'=round(price*1.05,2)::text,'Correction was not saved';
 assert before_projects=(select jsonb_agg(jsonb_build_object('id',id,'catalog',payload->'catalog','offer',payload->'offer','works',payload->'works','markup',payload->'markup') order by id) from public.rs_projects),'Correction changed existing investments';
 select * into project from public.rs_create_project(jsonb_build_object('name','Temporary catalog test','catalog','[]'::jsonb,'markup',999),date '2099-01-01');
 assert project.payload->'catalog'=corrected.payload->'catalog','Project did not copy the current base catalog';
 assert project.payload->'markup'=corrected.payload->'markup','Project did not copy the current markup';
 select * into saved from public.rs_save_project(project.id,jsonb_set(project.payload,'{markup}','50'::jsonb),project.revision);
 assert saved.payload->'markup'='50'::jsonb,'Local markup was not saved';
 assert (select payload->'markup' from public.rs_settings where owner_id=auth.uid())=master.payload->'markup','Local markup changed master';
 select * into restored from public.rs_save_settings(master.payload,corrected.revision);
 assert restored.payload=master.payload,'Undo did not restore the master settings';
 assert saved.payload->'catalog'=corrected.payload->'catalog','Undo changed already copied investment catalog';
 begin
  perform public.rs_save_settings(master.payload,master.revision);
  raise exception 'Stale revision accepted';
 exception when others then
  if sqlerrm not like 'RS_CONFLICT:%' then raise; end if;
 end;
end $$;
do $$
declare master public.rs_settings; expanded public.rs_settings; corrected public.rs_settings; item jsonb; identifier text; prices jsonb;
begin
 select * into master from public.rs_settings where owner_id=auth.uid();
 identifier:=gen_random_uuid()::text;
 item:=jsonb_build_object('id',identifier,'name','Temporary new shared service','category','Test','unit','kpl','base',100);
 select * into expanded from public.rs_save_settings(jsonb_set(master.payload,'{catalog}',(master.payload->'catalog')||jsonb_build_array(item)),master.revision);
 prices:=expanded.payload->'catalog';
 prices:=jsonb_set(prices,array[(jsonb_array_length(prices)-1)::text,'base'],'105'::jsonb);
 select * into corrected from public.rs_save_settings(expanded.payload||jsonb_build_object('catalog',prices,'catalogCorrections',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'percent',5))),expanded.revision);
 assert not exists(
  select 1 from public.rs_projects as p
  where not exists(select 1 from jsonb_array_elements(p.payload->'catalog') as snapshot(value) where value->>'id'=identifier and value->>'base'='100')
 ),'New service was not frozen at the pre-correction price for every existing investment';
 assert exists(select 1 from jsonb_array_elements(corrected.payload->'catalog') as service(value) where value->>'id'=identifier and value->>'base'='105'),'Master correction was not saved';
end $$;
rollback;
