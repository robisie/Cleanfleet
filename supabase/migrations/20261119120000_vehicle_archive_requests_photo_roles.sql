-- Employees request removal from the active fleet; only the administrator decides.
create table if not exists public.cf_vehicle_archive_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  plate text not null,
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','archived','kept')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists cf_vehicle_archive_one_pending
  on public.cf_vehicle_archive_requests(company_id,plate) where status='pending';
create index if not exists cf_vehicle_archive_company_created
  on public.cf_vehicle_archive_requests(company_id,created_at desc);
alter table public.cf_vehicle_archive_requests enable row level security;
revoke all on public.cf_vehicle_archive_requests from public,anon,authenticated;
grant select on public.cf_vehicle_archive_requests to authenticated;
create policy cf_vehicle_archive_read on public.cf_vehicle_archive_requests
  for select to authenticated using (
    public.cf_is_admin() or
    (requested_by=auth.uid() and public.cf_is_fleet_employee() and public.cf_user_has_company(company_id))
  );

create or replace function public.cf_vehicle_archive_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not public.cf_is_admin()
     and coalesce(auth.role(),'') <> 'service_role'
     and session_user not in ('postgres','supabase_admin') then
    if tg_op='INSERT' and (new.in_fleet is false or new.fleet_removed_at is not null) then
      raise exception 'Tylko administrator może archiwizować pojazd.';
    end if;
    if tg_op='UPDATE' and
      (new.in_fleet is distinct from old.in_fleet or new.fleet_removed_at is distinct from old.fleet_removed_at) then
      raise exception 'Wyślij wniosek o usunięcie pojazdu z floty.';
    end if;
  end if;
  return new;
end;$$;
revoke all on function public.cf_vehicle_archive_guard() from public,anon,authenticated;
drop trigger if exists cf_vehicle_archive_guard on public.vehicles;
create trigger cf_vehicle_archive_guard before insert or update on public.vehicles
  for each row execute function public.cf_vehicle_archive_guard();

drop policy if exists cf_vehicles_delete on public.vehicles;
create policy cf_vehicles_delete on public.vehicles for delete to authenticated
  using (public.cf_is_admin());
revoke truncate on public.vehicles from anon,authenticated;

create or replace function public.cf_request_vehicle_archive(p_company_id uuid,p_plate text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_plate text;
begin
  if not public.cf_is_fleet_employee() or not public.cf_user_has_company(p_company_id) then
    raise exception 'Brak uprawnień do zgłoszenia pojazdu.';
  end if;
  select v.plate into v_plate from public.vehicles v
    where v.company_id=p_company_id and v.plate=p_plate and v.in_fleet=true for update;
  if v_plate is null then raise exception 'Pojazd nie jest w aktywnej flocie.'; end if;
  select id into v_id from public.cf_vehicle_archive_requests
    where company_id=p_company_id and plate=v_plate and status='pending';
  if v_id is not null then return v_id; end if;
  insert into public.cf_vehicle_archive_requests(company_id,plate,requested_by)
    values(p_company_id,v_plate,auth.uid()) returning id into v_id;
  insert into public.cf_notifications(recipient_user_id,type,title,body,entity_id,company_id)
    select ur.user_id,'vehicle_archive_request','Wniosek o usunięcie pojazdu',
      'Pracownik prosi o usunięcie pojazdu '||v_plate||' z aktywnej floty.',v_id,p_company_id
    from public.user_roles ur where ur.role='admin';
  return v_id;
end;$$;
revoke all on function public.cf_request_vehicle_archive(uuid,text) from public,anon;
grant execute on function public.cf_request_vehicle_archive(uuid,text) to authenticated;

create or replace function public.cf_review_vehicle_archive(p_request_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cf_vehicle_archive_requests%rowtype; v_status text;
begin
  if not public.cf_is_admin() then raise exception 'Tylko administrator może podjąć decyzję.'; end if;
  if p_decision not in ('archive','keep') then raise exception 'Nieprawidłowa decyzja.'; end if;
  select * into r from public.cf_vehicle_archive_requests where id=p_request_id for update;
  if not found or r.status<>'pending' then raise exception 'Wniosek nie jest już oczekujący.'; end if;
  if p_decision='archive' then
    update public.vehicles set in_fleet=false,fleet_removed_at=now()
      where company_id=r.company_id and plate=r.plate and in_fleet=true;
    if not found then raise exception 'Pojazd nie jest już w aktywnej flocie.'; end if;
    v_status:='archived';
  else
    v_status:='kept';
  end if;
  update public.cf_vehicle_archive_requests set status=v_status,reviewed_by=auth.uid(),reviewed_at=now()
    where id=r.id;
  insert into public.cf_notifications(recipient_user_id,type,title,body,entity_id,company_id)
    values(r.requested_by,'vehicle_archive_result','Decyzja o pojeździe '||r.plate,
      case when v_status='archived' then 'Administrator usunął pojazd z aktywnej floty.'
      else 'Administrator pozostawił pojazd w aktywnej flocie.' end,r.id,r.company_id);
  return jsonb_build_object('status',v_status,'plate',r.plate);
end;$$;
revoke all on function public.cf_review_vehicle_archive(uuid,text) from public,anon;
grant execute on function public.cf_review_vehicle_archive(uuid,text) to authenticated;

-- Employees may read photos of their assigned company, but cannot change photo metadata or files.
drop policy if exists wash_record_photos_insert on public.wash_record_photos;
create policy wash_record_photos_insert on public.wash_record_photos for insert to authenticated
  with check (public.cf_is_admin() and created_by=auth.uid() and exists (
    select 1 from public.wash_records wr where wr.id=wash_record_id and public.cf_user_has_company(wr.company_id)
  ));
drop policy if exists wash_record_photos_delete on public.wash_record_photos;
create policy wash_record_photos_delete on public.wash_record_photos for delete to authenticated
  using (public.cf_is_admin());
drop policy if exists wash_record_photos_update_hash on public.wash_record_photos;
create policy wash_record_photos_update_hash on public.wash_record_photos for update to authenticated
  using (public.cf_is_admin()) with check (public.cf_is_admin());
drop policy if exists wash_record_photos_select on public.wash_record_photos;
create policy wash_record_photos_select on public.wash_record_photos for select to authenticated
  using (public.cf_is_admin() or (public.cf_is_fleet_employee() and exists (
    select 1 from public.wash_records wr where wr.id=wash_record_id and public.cf_user_has_company(wr.company_id)
  )));

drop policy if exists cf_photos_object_insert on storage.objects;
create policy cf_photos_object_insert on storage.objects for insert to authenticated
  with check (bucket_id='zdjecia' and public.cf_is_admin());
drop policy if exists cf_photos_object_delete on storage.objects;
create policy cf_photos_object_delete on storage.objects for delete to authenticated
  using (bucket_id='zdjecia' and public.cf_is_admin());
drop policy if exists cf_photos_object_select on storage.objects;
create policy cf_photos_object_select on storage.objects for select to authenticated
  using (bucket_id='zdjecia' and (public.cf_is_admin() or (public.cf_is_fleet_employee() and exists (
    select 1 from public.wash_record_photos p
    join public.wash_records wr on wr.id=p.wash_record_id
    where p.storage_path=objects.name and public.cf_user_has_company(wr.company_id)
  ))));
