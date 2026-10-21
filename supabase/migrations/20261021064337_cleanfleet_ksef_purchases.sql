-- Invoice snapshots and individual purchase rows share one atomic editing operation.
create table public.cf_ksef_costs (
 ksef_number text primary key,
 created_by uuid not null default auth.uid() references auth.users(id),
 invoice_number text not null, supplier text not null, purchase_date date not null,
 xml text not null, preview jsonb not null, revision bigint not null default 0,
 created_at timestamptz not null default now()
);
alter table public.cf_ksef_costs enable row level security;
create policy cf_ksef_costs_admin on public.cf_ksef_costs to authenticated using ((select public.cf_is_admin())) with check ((select public.cf_is_admin()));
revoke all on public.cf_ksef_costs from public,anon;
grant select,insert,update on public.cf_ksef_costs to authenticated;
alter table public.cf_purchases add column source_ksef_number text references public.cf_ksef_costs(ksef_number), add column source_ksef_index integer;
alter table public.cf_purchases add constraint cf_purchase_source_pair check ((source_ksef_number is null and source_ksef_index is null) or (source_ksef_number is not null and source_ksef_index>0));
create unique index cf_purchase_ksef_line on public.cf_purchases(source_ksef_number,source_ksef_index);

create function public.cf_ksef_cost_context(p_number text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 select jsonb_build_object('link',to_jsonb(c)-'xml','purchases',coalesce((select jsonb_agg(to_jsonb(p) order by p.source_ksef_index) from public.cf_purchases p where p.source_ksef_number=p_number),'[]')) into result from public.cf_ksef_costs c where c.ksef_number=p_number;
 return coalesce(result,'{"link":null,"purchases":[]}'::jsonb)||jsonb_build_object('blocked',coalesce((select coalesce(nullif(r.document->'selectedIndices','null'),(select jsonb_agg(i->'index') from jsonb_array_elements(r.items) i)) from public.rs_ksef_links r where r.ksef_number=p_number and r.kind='purchases'),'[]'::jsonb));
end;$$;

create function public.cf_save_ksef_costs(p_number text,p_xml text,p_entries jsonb,p_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.cf_ksef_costs; preview jsonb; d record; item jsonb; entry jsonb; indices integer[]; source text;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_number is null or p_number!~*'^\d{10}-\d{8}-[a-f0-9]{12}-[a-f0-9]{2}$' then raise exception 'Nieprawidłowy numer KSeF.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into saved from public.cf_ksef_costs where ksef_number=p_number for update;
 if (saved.ksef_number is null and p_revision is not null) or (saved.ksef_number is not null and p_revision is distinct from saved.revision) then raise exception 'Dane zmieniły się. Otwórz przypisanie ponownie.';end if;
 source:=coalesce(saved.xml,p_xml);
 if saved.ksef_number is not null and p_xml is not null and p_xml<>saved.xml then raise exception 'Treść faktury różni się od zapisanego dokumentu.';end if;
 preview:=public.rs_ksef_purchase_preview(source);
 if not coalesce((preview->>'canSelect')::boolean,false) or exists(select 1 from jsonb_array_elements(preview->'items') i where (i->>'gross')::numeric<0) then raise exception 'Ten dokument wymaga osobnego rozliczenia. Import kosztów obsługuje uzgodnione dodatnie pozycje w PLN.';end if;
 if p_entries is null or jsonb_typeof(p_entries)<>'array' then raise exception 'Nieprawidłowa lista pozycji.';end if;
 select coalesce(array_agg((x->>'index')::integer),'{}') into indices from jsonb_array_elements(p_entries) x;
 if cardinality(indices)<>(select count(distinct n) from unnest(indices) n) or array_position(indices,null) is not null then raise exception 'Powtórzone lub nieprawidłowe pozycje.';end if;
 select * into d from xmltable('/*[local-name()="Faktura"]' passing xmlparse(document source) columns
 invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',issue_date date path '*[local-name()="Fa"]/*[local-name()="P_1"]',
 seller text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]');
 if d.seller_nip is distinct from left(p_number,10) or d.invoice_number is null or d.issue_date is null or d.seller is null then raise exception 'Nieprawidłowe dane faktury.';end if;
 if saved.ksef_number is null then
  if cardinality(indices)=0 then raise exception 'Wybierz pozycje faktury.';end if;
  insert into public.cf_ksef_costs(ksef_number,invoice_number,supplier,purchase_date,xml,preview) values(p_number,d.invoice_number,d.seller,d.issue_date,source,preview);
 end if;
 for entry in select * from jsonb_array_elements(p_entries) loop
  select i into item from jsonb_array_elements(preview->'items') i where (i->>'index')::integer=(entry->>'index')::integer;
  if item is null then raise exception 'Pozycja nie istnieje na fakturze.';end if;
  if not coalesce(entry->>'category','')=any(array['Chemia','Sprzęt','Akcesoria','Materiały eksploatacyjne','Odzież robocza','Serwis i naprawy','Paliwo / dojazdy','Marketing / reklama','Pozostałe']) then raise exception 'Wybierz kategorię kosztu.';end if;
  if coalesce((item->>'quantity')::numeric,1)<=0 then raise exception 'Pozycja ma nieprawidłową ilość.';end if;
  insert into public.cf_purchases(name,amount,quantity,unit_price,purchase_date,category,supplier,company_id,note,source_ksef_number,source_ksef_index)
  values(coalesce(nullif(item->>'name',''),'Pozycja '||(item->>'index')),(item->>'gross')::numeric,coalesce((item->>'quantity')::numeric,1),round((item->>'gross')::numeric/coalesce((item->>'quantity')::numeric,1),2),d.issue_date,entry->>'category',d.seller,nullif(entry->>'company_id','')::uuid,nullif(entry->>'note',''),p_number,(item->>'index')::integer)
  on conflict(source_ksef_number,source_ksef_index) do update set category=excluded.category,company_id=excluded.company_id,note=excluded.note;
 end loop;
 delete from public.cf_purchases where source_ksef_number=p_number and not(source_ksef_index=any(indices));
 update public.cf_ksef_costs set revision=revision+1 where ksef_number=p_number;
 return public.cf_ksef_cost_context(p_number);
end;$$;

-- Serialize both applications by invoice. Deferred validation sees the final
-- selected rows, including Robisię's full-import-then-selection transaction.
create function public.cf_lock_cost_invoice() returns trigger language plpgsql security invoker set search_path='' as $$
declare number text;
begin
 if tg_table_name='cf_purchases' then
  number:=coalesce(new.source_ksef_number,old.source_ksef_number);
  if tg_op='UPDATE' and old.source_ksef_number is not null and (new.source_ksef_number is distinct from old.source_ksef_number or new.source_ksef_index is distinct from old.source_ksef_index) then raise exception 'Zmień przypisanie przez pozycje faktury.';end if;
 else number:=coalesce(new.ksef_number,old.ksef_number);end if;
 if number is not null then
  perform pg_advisory_xact_lock(hashtextextended(number,0));
  if tg_table_name='cf_purchases' then update public.cf_ksef_costs set revision=revision+1 where ksef_number=number;end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
-- Definer is needed only for cross-owner collision checks; no document data is returned.
create function public.cf_check_cost_overlap() returns trigger language plpgsql security definer set search_path='' as $$
declare number text; conflict_found boolean;
begin
 if tg_table_name='cf_purchases' then number:=coalesce(new.source_ksef_number,old.source_ksef_number);else number:=coalesce(new.ksef_number,old.ksef_number);end if;
 if number is null then return null;end if;
 select exists(select 1 from public.cf_purchases p join public.rs_ksef_links r on r.ksef_number=p.source_ksef_number where p.source_ksef_number=number and r.kind='purchases' and (r.document->'selectedIndices' is null or r.document->'selectedIndices'='null'::jsonb or r.document->'selectedIndices' @> to_jsonb(array[p.source_ksef_index]))) into conflict_found;
 if conflict_found then raise exception 'Pozycja faktury jest już kosztem w drugiej aplikacji. Odznacz ją tam przed przeniesieniem.';end if;
 return null;
end;$$;
create trigger cf_purchase_invoice_lock before insert or update or delete on public.cf_purchases for each row execute function public.cf_lock_cost_invoice();
create trigger rs_cost_invoice_lock before insert or update or delete on public.rs_ksef_links for each row execute function public.cf_lock_cost_invoice();
create constraint trigger cf_purchase_cost_overlap after insert or update on public.cf_purchases deferrable initially deferred for each row execute function public.cf_check_cost_overlap();
create constraint trigger rs_purchase_cost_overlap after insert or update on public.rs_ksef_links deferrable initially deferred for each row execute function public.cf_check_cost_overlap();
revoke all on function public.cf_ksef_cost_context(text),public.cf_save_ksef_costs(text,text,jsonb,bigint),public.cf_lock_cost_invoice(),public.cf_check_cost_overlap() from public,anon;
grant execute on function public.cf_ksef_cost_context(text),public.cf_save_ksef_costs(text,text,jsonb,bigint) to authenticated;
