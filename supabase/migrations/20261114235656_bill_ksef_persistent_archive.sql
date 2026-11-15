-- Original KSeF bytes are shared by Bill and the warehouse, scoped to the admin.
create table public.bill_ksef_archive (
 owner_id uuid not null default auth.uid() references auth.users(id),
 kind text not null check(kind in ('purchases','sales')),
 ksef_number text not null check(ksef_number ~* '^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$'),
 metadata jsonb not null,
 content text,
 saved_at timestamptz not null default now(),
 primary key(owner_id,kind,ksef_number),
 check(metadata->>'ksefNumber'=ksef_number),
 check(metadata#>>'{seller,nip}'=left(ksef_number,10)),
 check(case when kind='purchases' then metadata#>>'{buyer,identifier,value}'='6351861297' else metadata#>>'{seller,nip}'='6351861297' end),
 check(content is null or (octet_length(content)<=13981016 and octet_length(decode(content,'base64')) between 1 and 10485760 and encode(sha256(decode(content,'base64')),'base64')=metadata->>'invoiceHash'))
);
alter table public.bill_ksef_archive enable row level security;
create policy bill_ksef_archive_owner on public.bill_ksef_archive for all to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()))
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
revoke all on public.bill_ksef_archive from public,anon,authenticated;
grant select,insert,update on public.bill_ksef_archive to authenticated;

create function public.bill_ksef_archive_store(p_kind text,p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; meta jsonb; original text;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_kind not in ('purchases','sales') or p_kind is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1250 then raise exception 'Nieprawidłowa lista faktur.';end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  meta:=item->'metadata';original:=item->>'content';
  if jsonb_typeof(meta) is distinct from 'object' or coalesce(meta->>'invoiceHash','')!~'^[A-Za-z0-9+/]{43}=$'
    or coalesce(meta->>'ksefNumber','')!~*'^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$'
    or meta#>>'{seller,nip}' is distinct from left(meta->>'ksefNumber',10)
    or (case when p_kind='purchases' then meta#>>'{buyer,identifier,value}' else meta#>>'{seller,nip}' end) is distinct from '6351861297'
    then raise exception 'Nieprawidłowy dokument KSeF.';end if;
  insert into public.bill_ksef_archive(owner_id,kind,ksef_number,metadata,content)
   values(auth.uid(),p_kind,meta->>'ksefNumber',meta,original)
  on conflict(owner_id,kind,ksef_number) do update set metadata=excluded.metadata,
   content=case when excluded.content is not null then excluded.content when bill_ksef_archive.metadata->>'invoiceHash'=excluded.metadata->>'invoiceHash' then bill_ksef_archive.content else null end,
   saved_at=now()
  where bill_ksef_archive.metadata is distinct from excluded.metadata or (excluded.content is not null and bill_ksef_archive.content is distinct from excluded.content);
 end loop;
end;$$;

create function public.bill_ksef_archive_index() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'metadata',metadata,'hasContent',has_content,'savedAt',saved_at)) from (
  select distinct on(kind,ksef_number) kind,ksef_number,metadata,has_content,saved_at from (
   select kind,ksef_number,metadata,content is not null as has_content,saved_at,1 as priority from public.bill_ksef_archive where owner_id=auth.uid()
   union all
   select 'purchases',ksef_number,metadata,false,null::timestamptz,2 from public.rs_ksef_documents where owner_id=auth.uid() and metadata->>'source' is distinct from 'nip-receipt'
   union all
   select 'sales',ksef_number,jsonb_build_object('billId',id,'source','bill-accepted','ksefNumber',ksef_number,'invoiceNumber',number,'issueDate',payload->>'issueDate',
    'seller',jsonb_build_object('nip','6351861297','name','Robisię-Fer'),
    'buyer',jsonb_build_object('name',payload#>>'{buyer,name}','identifier',jsonb_build_object('type',case when payload#>>'{buyer,nip}' is null then 'None' else 'Nip' end,'value',coalesce(payload#>>'{buyer,nip}',''))),
    'grossAmount',coalesce(nullif((xpath('string(/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="P_15"])',xmlparse(document xml)))[1]::text,'')::numeric,0),
    'currency',payload->>'currency','invoiceType',case when payload->'correction' is null or payload->'correction'='null'::jsonb then 'Vat' else 'Kor' end,'invoiceHash',encode(sha256(convert_to(xml,'UTF8')),'base64')),
    true,updated_at,0 from public.bill_invoices where creator_id=auth.uid() and status='accepted' and xml is not null and ksef_number ~* '^[0-9]{10}-[0-9]{8}-[a-f0-9]{12}-[a-f0-9]{2}$'
  ) sources order by kind,ksef_number,priority
 ) saved),'[]'::jsonb);
end;$$;
revoke all on function public.bill_ksef_archive_store(text,jsonb),public.bill_ksef_archive_index() from public,anon;
grant execute on function public.bill_ksef_archive_store(text,jsonb),public.bill_ksef_archive_index() to authenticated;
notify pgrst,'reload schema';
