-- Aga draft creation and issued-invoice accounting share the owner's existing settings.
-- No invoice is issued by this RPC; Bill's explicit issuance remains authoritative.
create or replace function public.rs_aga_bill_draft(
 p_id uuid,p_amount numeric,p_date date,p_rate numeric,p_received boolean,p_note text,p_revision bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.rs_settings; r public.bill_invoices; template jsonb; annual jsonb; payload jsonb; days integer:=0;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_revision is null or p_id is null or p_date is null or p_amount is null or p_amount<=0 or p_amount>999999999.99 or p_amount<>round(p_amount,2) or p_rate is null or p_rate<0 or p_rate>=100 or length(coalesce(p_note,''))>512 then raise exception 'Nieprawidłowe dane faktury.';end if;
 select * into r from public.bill_invoices where id=p_id for update;
 if found then
  if r.creator_id<>auth.uid() or r.payload#>>'{source,app}'<>'aga' then raise exception 'Ten identyfikator należy do innego dokumentu.';end if;
  return jsonb_build_object('invoiceId',r.id,'status',r.status);
 end if;
 select * into s from public.rs_settings where owner_id=auth.uid() for update;
 if not found or s.revision<>p_revision then raise exception 'RS_CONFLICT: Rozliczenie zmieniło się. Odśwież dane.';end if;
 -- Recheck after waiting on the owner settings lock (concurrent retry).
 select * into r from public.bill_invoices where id=p_id;
 if found then
  if r.creator_id<>auth.uid() or r.payload#>>'{source,app}'<>'aga' then raise exception 'Nieprawidłowe powiązanie dokumentu.';end if;
  return jsonb_build_object('invoiceId',r.id,'status',r.status);
 end if;
 select b.payload into template from public.bill_invoices b where b.creator_id=auth.uid()
  and b.payload#>>'{buyer,name}' ilike 'AGAR SERWIS%' and b.payload->>'currency'='PLN'
  order by b.created_at desc,b.id desc limit 1;
 if template is null then raise exception 'Nie znaleziono schematu faktury dla AGAR SERWIS w Bill.';end if;
 begin days:=greatest(0,least(365,(template->>'dueDate')::date-(template->>'issueDate')::date));exception when others then days:=0;end;
 payload:=jsonb_build_object('brand',coalesce(template->>'brand','cleanfleet'),'issueDate',p_date::text,'saleDate',p_date::text,'dueDate',(p_date+days)::text,
  'currency','PLN','buyer',template->'buyer','recipient',null,'payment',coalesce(template->>'payment','transfer'),'bank',coalesce(template->>'bank',''),
  'notes',coalesce(p_note,''),'source',jsonb_build_object('app','aga','id',p_id::text),
  'lines',jsonb_build_array(jsonb_build_object('name','Usługi sprzątające','unit','szt.','qty','1','price',to_char(p_amount,'FM9999999990.00'))));
 insert into public.bill_invoices(id,creator_id,payload) values(p_id,auth.uid(),payload) returning * into r;
 annual:=coalesce(s.payload->'agaAnnual','{"invoices":[],"taxes":[]}'::jsonb);
 annual:=jsonb_set(annual,'{billDrafts}',coalesce(annual->'billDrafts','{}'::jsonb)||jsonb_build_object(p_id::text,jsonb_build_object('rate',p_rate,'received',p_received,'note',coalesce(p_note,''),'date',p_date,'amount',p_amount)),true);
 update public.rs_settings set payload=jsonb_set(s.payload,'{agaAnnual}',annual,true),revision=s.revision+1,updated_at=now() where owner_id=auth.uid();
 return jsonb_build_object('invoiceId',r.id,'status',r.status);
end;$$;
revoke all on function public.rs_aga_bill_draft(uuid,numeric,date,numeric,boolean,text,bigint) from public,anon;
grant execute on function public.rs_aga_bill_draft(uuid,numeric,date,numeric,boolean,text,bigint) to authenticated;

create or replace function public.rs_aga_bill_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.rs_settings; annual jsonb; context jsonb; item jsonb; amount numeric; rate numeric; rows jsonb;
begin
 if old.payload#>>'{source,app}' is distinct from 'aga' or old.payload ? 'correction' then return case when tg_op='DELETE' then old else new end;end if;
 if auth.uid() is distinct from old.creator_id or not public.cf_is_admin() then raise exception 'Brak dostępu do rozliczenia faktury.';end if;
 if tg_op='UPDATE' and (new.creator_id is distinct from old.creator_id or new.payload->'source' is distinct from old.payload->'source') then raise exception 'Nie można zmienić powiązania faktury z rozliczeniem Aga.';end if;
 if old.status<>'draft' then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op='UPDATE' and (new.status='draft' or new.number is null) then return new;end if;
 select * into s from public.rs_settings where owner_id=old.creator_id for update;
 annual:=coalesce(s.payload->'agaAnnual','{}'::jsonb);context:=annual#>array['billDrafts',old.id::text];
 if tg_op='DELETE' then
  if context is not null then update public.rs_settings set payload=jsonb_set(s.payload,'{agaAnnual}',jsonb_set(annual,'{billDrafts}',(annual->'billDrafts')-old.id::text)),revision=s.revision+1,updated_at=now() where owner_id=old.creator_id;end if;
  return old;
 end if;
 if context is null then raise exception 'Brak kontekstu rozliczenia Aga. Odśwież dane przed wystawieniem.';end if;
 if new.payload->>'currency'<>'PLN' or new.payload ? 'correction' then raise exception 'Rozliczenie Aga wymaga zwykłej faktury w PLN.';end if;
 select sum(round((line->>'qty')::numeric*(line->>'price')::numeric,2)-coalesce((line->>'discount')::numeric,0)) into amount from jsonb_array_elements(new.payload->'lines') line;
 rate:=(context->>'rate')::numeric;
 if amount is null or amount<=0 or rate is null or rate<0 or rate>=100 then raise exception 'Nieprawidłowa kwota lub stawka rozliczenia.';end if;
 item:=jsonb_build_object('id',new.id::text,'sourceBillId',new.id::text,'date',new.payload->>'issueDate','amount',amount,'rate',rate,'number',new.number,
  'description',(select string_agg(line->>'name',' · ') from jsonb_array_elements(new.payload->'lines') line),'received',context->'received','note',coalesce(context->>'note',''));
 select coalesce(jsonb_agg(entry),'[]'::jsonb) into rows from jsonb_array_elements(coalesce(annual->'invoices','[]'::jsonb)) entry where entry->>'sourceBillId' is distinct from new.id::text and entry->>'id' is distinct from new.id::text;
 annual:=jsonb_set(annual,'{invoices}',rows||jsonb_build_array(item),true);
 annual:=jsonb_set(annual,'{billDrafts}',(annual->'billDrafts')-new.id::text,true);
 update public.rs_settings set payload=jsonb_set(s.payload,'{agaAnnual}',annual,true),revision=s.revision+1,updated_at=now() where owner_id=old.creator_id;
 return new;
end;$$;
revoke all on function public.rs_aga_bill_link() from public,anon,authenticated;
create trigger rs_aga_bill_link before update or delete on public.bill_invoices for each row execute function public.rs_aga_bill_link();
