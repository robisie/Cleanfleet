create or replace function public.bill_ksef_archive_index() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'metadata',metadata,'hasContent',has_content,'savedAt',saved_at)) from (
  select distinct on(kind,ksef_number) kind,ksef_number,metadata,has_content,saved_at from (
   select kind,ksef_number,metadata,content is not null as has_content,saved_at,1 as priority from public.bill_ksef_archive where owner_id=auth.uid()
   union all
   select 'purchases',ksef_number,metadata,false,null::timestamptz,2 from public.rs_ksef_documents where owner_id=auth.uid() and metadata->>'source' is distinct from 'nip-receipt'

  ) sources order by kind,ksef_number,priority
 ) saved),'[]'::jsonb);
end;$$;

-- The Bill table remains server-only. Its existing service writes maintain this cache.
create function public.bill_ksef_cache_accepted_sale() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='accepted' and new.xml is not null and new.ksef_number ~* '^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$' then
  insert into public.bill_ksef_archive(owner_id,kind,ksef_number,metadata,content)
  values(new.creator_id,'sales',new.ksef_number,jsonb_build_object('billId',new.id,'source','bill-accepted','ksefNumber',new.ksef_number,'invoiceNumber',new.number,'issueDate',new.payload->>'issueDate',
    'seller',jsonb_build_object('nip','6351861297','name','Robisię-Fer'),
    'buyer',jsonb_build_object('name',new.payload#>>'{buyer,name}','identifier',jsonb_build_object('type',case when new.payload#>>'{buyer,nip}' is null then 'None' else 'Nip' end,'value',coalesce(new.payload#>>'{buyer,nip}',''))),
    'grossAmount',coalesce(nullif((xpath('string(/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="P_15"])',xmlparse(document new.xml)))[1]::text,'')::numeric,0),
    'currency',new.payload->>'currency','invoiceType',case when new.payload->'correction' is null or new.payload->'correction'='null'::jsonb then 'Vat' else 'Kor' end,'invoiceHash',encode(sha256(convert_to(new.xml,'UTF8')),'base64')),encode(convert_to(new.xml,'UTF8'),'base64'))
  on conflict(owner_id,kind,ksef_number) do update set metadata=excluded.metadata,content=excluded.content,saved_at=now();
 end if;
 return new;
end;$$;
revoke all on function public.bill_ksef_cache_accepted_sale() from public,anon,authenticated;
create trigger bill_ksef_cache_accepted_sale after insert or update of status,xml,ksef_number on public.bill_invoices
 for each row execute function public.bill_ksef_cache_accepted_sale();

insert into public.bill_ksef_archive(owner_id,kind,ksef_number,metadata,content,saved_at)
select creator_id,'sales',ksef_number,jsonb_build_object('billId',id,'source','bill-accepted','ksefNumber',ksef_number,'invoiceNumber',number,'issueDate',payload->>'issueDate',
    'seller',jsonb_build_object('nip','6351861297','name','Robisię-Fer'),
    'buyer',jsonb_build_object('name',payload#>>'{buyer,name}','identifier',jsonb_build_object('type',case when payload#>>'{buyer,nip}' is null then 'None' else 'Nip' end,'value',coalesce(payload#>>'{buyer,nip}',''))),
    'grossAmount',coalesce(nullif((xpath('string(/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="P_15"])',xmlparse(document xml)))[1]::text,'')::numeric,0),
    'currency',payload->>'currency','invoiceType',case when payload->'correction' is null or payload->'correction'='null'::jsonb then 'Vat' else 'Kor' end,'invoiceHash',encode(sha256(convert_to(xml,'UTF8')),'base64')),encode(convert_to(xml,'UTF8'),'base64'),updated_at
 from public.bill_invoices where status='accepted' and xml is not null and ksef_number ~* '^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$'
 on conflict(owner_id,kind,ksef_number) do nothing;

alter table public.bill_ksef_archive add constraint bill_ksef_archive_valid_content check (
 (metadata->>'ksefNumber'=ksef_number and metadata#>>'{seller,nip}'=left(ksef_number,10)
 and (case when kind='purchases' then metadata#>>'{buyer,identifier,value}'='6351861297' else metadata#>>'{seller,nip}'='6351861297' end)
 and (content is null or encode(sha256(decode(content,'base64')),'base64')=metadata->>'invoiceHash')) is true
);
notify pgrst,'reload schema';
