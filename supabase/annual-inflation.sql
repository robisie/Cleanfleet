begin;
create table public.cf_inflation_reports(
 year integer primary key check(year>=2026),
 price_index numeric(7,2) not null check(price_index>0 and price_index<1100),
 percent numeric generated always as (price_index-100) stored,
 source_url text not null check(source_url like 'https://stat.gov.pl/%'),
 fetched_at timestamptz not null default now()
);
alter table public.cf_inflation_reports enable row level security;
revoke all on public.cf_inflation_reports from anon,authenticated;
grant select on public.cf_inflation_reports to authenticated;
grant all on public.cf_inflation_reports to service_role;
create policy inflation_reports_admin on public.cf_inflation_reports for select to authenticated using(public.cf_is_admin());
create table public.cf_inflation_decisions(
 app text not null check(app in ('robisie','cleanfleet')),
 year integer not null references public.cf_inflation_reports(year),
 scope text not null,
 status text not null default 'pending' check(status in ('pending','applied','rejected','undone')),
 remind_at timestamptz not null default now(),
 notified_at timestamptz,
 changes jsonb,
 decided_at timestamptz,
 primary key(app,year,scope),
 check((app='cleanfleet' and scope='cleanfleet') or (app='robisie' and scope<>'cleanfleet'))
);
alter table public.cf_inflation_decisions enable row level security;
revoke all on public.cf_inflation_decisions from anon,authenticated;
grant select on public.cf_inflation_decisions to authenticated;
grant all on public.cf_inflation_decisions to service_role;
create policy inflation_decision_admin on public.cf_inflation_decisions for select to authenticated
 using(public.cf_is_admin() and (scope='cleanfleet' or scope=auth.uid()::text));

create schema if not exists cf_inflation_private;
revoke all on schema cf_inflation_private from public,anon;
grant usage on schema cf_inflation_private to authenticated;

create function cf_inflation_private.context(p_app text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cf_inflation_reports; d public.cf_inflation_decisions; s text; settings public.rs_settings; items jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_app is null or p_app not in ('robisie','cleanfleet') then raise exception 'Nieprawidłowa aplikacja.'; end if;
 select * into r from public.cf_inflation_reports order by year desc limit 1;
 if r.year is null then return jsonb_build_object('report',null); end if;
 s:=case when p_app='cleanfleet' then 'cleanfleet' else auth.uid()::text end;
 insert into public.cf_inflation_decisions(app,year,scope) values(p_app,r.year,s) on conflict do nothing;
 select * into d from public.cf_inflation_decisions where app=p_app and year=r.year and scope=s;
 if p_app='robisie' then select * into settings from public.rs_settings where owner_id=auth.uid();
 else select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into items from public.cf_service_catalog c; end if;
 return jsonb_build_object('report',to_jsonb(r),'decision',to_jsonb(d),'settings',case when p_app='robisie' then to_jsonb(settings) else null end,'catalog',items);
end;$$;

create function cf_inflation_private.decide(p_app text,p_year integer,p_action text,p_revision bigint default null,p_payload jsonb default null,p_catalog jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cf_inflation_reports; d public.cf_inflation_decisions; s text; old public.rs_settings; saved public.rs_settings; items jsonb; v_changes jsonb; expected jsonb; correction jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.'; end if;
 if p_app is null or p_app not in ('robisie','cleanfleet') or p_action is null or p_action not in ('apply','reject','snooze','undo') then raise exception 'Nieprawidłowa decyzja.'; end if;
 select * into r from public.cf_inflation_reports where year=p_year;
 if r.year is null then raise exception 'Brak publikacji GUS.'; end if;
 s:=case when p_app='cleanfleet' then 'cleanfleet' else auth.uid()::text end;
 insert into public.cf_inflation_decisions(app,year,scope) values(p_app,r.year,s) on conflict do nothing;
 select * into d from public.cf_inflation_decisions where app=p_app and year=p_year and scope=s for update;
 if d.status<>'pending' and p_action<>'undo' then return jsonb_build_object('status',d.status,'alreadyDecided',true); end if;
 if p_action='snooze' then
  update public.cf_inflation_decisions set remind_at=((now() at time zone 'Europe/Warsaw')+interval '3 days') at time zone 'Europe/Warsaw',notified_at=null where app=p_app and year=p_year and scope=s;
 elsif p_action='reject' then
  update public.cf_inflation_decisions set status='rejected',decided_at=now() where app=p_app and year=p_year and scope=s;
 elsif p_action='apply' then
  if r.percent<=0 then raise exception 'Brak dodatniej inflacji — ceny pozostają bez zmian.'; end if;
  if p_app='robisie' then
   select * into old from public.rs_settings where owner_id=auth.uid() for update;
   if old.revision is distinct from p_revision then raise exception 'RS_CONFLICT: Cennik zmienił się. Otwórz propozycję ponownie.'; end if;
   select jsonb_agg(item||jsonb_build_object('base',round((item->>'base')::numeric*(1+r.percent/100),2)) order by ord) into expected from jsonb_array_elements(old.payload->'catalog') with ordinality c(item,ord);
   select jsonb_agg(jsonb_build_object('id',item->'id','name',item->'name','category',item->'category','before',round((item->>'base')::numeric,2),'after',round((item->>'base')::numeric*(1+r.percent/100),2)) order by ord) into v_changes from jsonb_array_elements(old.payload->'catalog') with ordinality c(item,ord);
   correction:=p_payload->'catalogCorrections'->-1;
   if expected is null or expected='[]' or p_payload->'catalog' is distinct from expected
    or (p_payload-'catalog'-'catalogCorrections') is distinct from (old.payload-'catalog'-'catalogCorrections')
    or (p_payload->'catalogCorrections') is distinct from (coalesce(old.payload->'catalogCorrections','[]')||jsonb_build_array(correction))
    or correction->'changes' is distinct from v_changes
    or (correction->>'percent')::numeric is distinct from r.percent
    then raise exception 'Propozycja nie odpowiada aktualnemu cennikowi i wskaźnikowi GUS.'; end if;
   saved:=public.rs_save_settings(p_payload,old.revision);
   v_changes:=correction->'changes';
  else
   perform 1 from public.cf_service_catalog order by id for update;
   select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into items from public.cf_service_catalog c;
   if items is distinct from p_catalog or items='[]' then raise exception 'Cennik zmienił się lub jest pusty. Otwórz propozycję ponownie.'; end if;
   select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'before',c.price,'after',round(c.price*(1+r.percent/100),2)) order by c.id) into v_changes from public.cf_service_catalog c;
   update public.cf_service_catalog set price=round(price*(1+r.percent/100),2),updated_at=now();
  end if;
  update public.cf_inflation_decisions set status='applied',changes=v_changes,decided_at=now() where app=p_app and year=p_year and scope=s;
 elsif p_action='undo' then
  if p_app<>'cleanfleet' or d.status<>'applied' then raise exception 'Brak korekty do cofnięcia.'; end if;
  perform 1 from public.cf_service_catalog order by id for update;
  if exists(select 1 from jsonb_array_elements(d.changes) x left join public.cf_service_catalog c on c.id=(x->>'id')::uuid where c.id is null or c.price<>(x->>'after')::numeric) then raise exception 'Po korekcie zmieniono ceny. Cofnięcie nadpisałoby te zmiany.'; end if;
  update public.cf_service_catalog c set price=(x->>'before')::numeric,updated_at=now() from jsonb_array_elements(d.changes) x where c.id=(x->>'id')::uuid;
  update public.cf_inflation_decisions set status='undone',decided_at=now() where app=p_app and year=p_year and scope=s;
 end if;
 return cf_inflation_private.context(p_app);
end;$$;
create function public.cf_inflation_context(p_app text) returns jsonb language sql security invoker set search_path='' as $$select cf_inflation_private.context(p_app);$$;
create function public.cf_inflation_decide(p_app text,p_year integer,p_action text,p_revision bigint default null,p_payload jsonb default null,p_catalog jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select cf_inflation_private.decide(p_app,p_year,p_action,p_revision,p_payload,p_catalog);$$;
revoke all on function cf_inflation_private.context(text),cf_inflation_private.decide(text,integer,text,bigint,jsonb,jsonb) from public,anon;
grant execute on function cf_inflation_private.context(text),cf_inflation_private.decide(text,integer,text,bigint,jsonb,jsonb) to authenticated;
revoke all on function public.cf_inflation_context(text),public.cf_inflation_decide(text,integer,text,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.cf_inflation_context(text),public.cf_inflation_decide(text,integer,text,bigint,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
