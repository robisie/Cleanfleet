-- Explicit, owner-controlled links. KSeF numbers are unique across investments.
create table public.rs_ksef_links (
 ksef_number text primary key,
 project_id uuid not null references public.rs_projects(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('sales','purchases')),
 document jsonb not null,
 items jsonb not null default '[]',
 created_at timestamptz not null default now()
);
create index rs_ksef_links_project on public.rs_ksef_links(project_id);
alter table public.rs_ksef_links enable row level security;
revoke all on public.rs_ksef_links from public,anon,authenticated;
grant select,insert on public.rs_ksef_links to authenticated;
create policy rs_ksef_links_owner_read on public.rs_ksef_links for select to authenticated
 using(owner_id=(select auth.uid()) and (select public.cf_is_admin()));
create policy rs_ksef_links_owner_insert on public.rs_ksef_links for insert to authenticated
 with check(owner_id=(select auth.uid()) and (select public.cf_is_admin()) and exists(select 1 from public.rs_projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create function public.rs_assign_ksef(p_project uuid,p_number text,p_kind text,p_xml text,p_bill_id uuid default null)
returns public.rs_ksef_links language plpgsql security invoker set search_path='' as $$
declare project public.rs_projects; existing public.rs_ksef_links; result public.rs_ksef_links; doc xml; data record; items jsonb; description text; normalized jsonb; purchase jsonb; docid uuid; purchaseid uuid; reference_only boolean;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_number is null or p_number!~*'^\d{10}-\d{8}-[a-f0-9]{12}-[a-f0-9]{2}$' or p_kind not in ('sales','purchases') or p_kind is null then raise exception 'Nieprawidłowy dokument KSeF.';end if;
 if p_xml is null or length(p_xml)>10000000 or p_xml~*'<!DOCTYPE|<!ENTITY' then raise exception 'Nieprawidłowy XML.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 select * into existing from public.rs_ksef_links where ksef_number=p_number;
 if existing.ksef_number is not null then
  if existing.project_id<>p_project or existing.kind<>p_kind then raise exception 'Ta faktura jest już przypisana do innej inwestycji lub rodzaju rozliczenia.';end if;
  return existing;
 end if;
 select * into project from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if project.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 doc:=xmlparse(document p_xml);
 select * into data from xmltable('/*[local-name()="Faktura"]' passing doc columns
  invoice_number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',
  issue_date date path '*[local-name()="Fa"]/*[local-name()="P_1"]',
  gross numeric path '*[local-name()="Fa"]/*[local-name()="P_15"]',
  currency text path '*[local-name()="Fa"]/*[local-name()="KodWaluty"]',
  invoice_type text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
  seller text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',
  seller_nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]',
  buyer text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="Nazwa"]',
  buyer_nip text path '*[local-name()="Podmiot2"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]',
  seller_address text path '*[local-name()="Podmiot1"]/*[local-name()="Adres"]/*[local-name()="AdresL1"]',
  due_date text path '*[local-name()="Fa"]/*[local-name()="Platnosc"]/*[local-name()="TerminPlatnosci"][1]/*[local-name()="Termin"]'
 );
 if data.invoice_number is null or data.issue_date is null or data.gross is null or data.gross::text in ('NaN','Infinity','-Infinity') or data.seller is null or data.currency is null or data.currency!~'^[A-Z]{3}$' or data.seller_nip is distinct from left(p_number,10) then raise exception 'Brak wymaganych danych faktury.';end if;
 if (p_kind='sales' and data.seller_nip is distinct from '6351861297') or (p_kind='purchases' and data.buyer_nip is distinct from '6351861297') then raise exception 'Faktura nie należy do właściwej strony rozliczenia spółki.';end if;
 select coalesce(jsonb_agg(to_jsonb(i)),'[]'),string_agg(concat_ws(' ',i.name,nullif(i.quantity,''),nullif(i.unit,'')),'; ')
 into items,description from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="FaWiersz"]' passing doc columns
 name text path '*[local-name()="P_7"]',quantity text path '*[local-name()="P_8B"]',unit text path '*[local-name()="P_8A"]',net text path '*[local-name()="P_11"]',vat text path '*[local-name()="P_12"]') i;
 reference_only:=data.currency<>'PLN' or data.gross<0 or coalesce(data.invoice_type,'') like 'KOR%';
 docid:=coalesce(p_bill_id,gen_random_uuid());purchaseid:=gen_random_uuid();
 normalized:=jsonb_build_object('id',docid,'number',data.invoice_number,'status','accepted','ksef_number',p_number,'originKind',p_kind,'externalKsef',true,'sourceBillId',p_bill_id,'referenceOnly',reference_only,
  'payload',jsonb_build_object('brand','robisie','currency',data.currency,'issueDate',data.issue_date,'dueDate',data.due_date,'buyer',jsonb_build_object('name',data.buyer,'nip',data.buyer_nip),'seller',jsonb_build_object('name',data.seller,'nip',data.seller_nip,'address',data.seller_address),'source',jsonb_build_object('app','robisie','id',p_project),'lines',jsonb_build_array(jsonb_build_object('name',coalesce(description,data.invoice_number),'qty','1','price',abs(data.gross)::text,'unit','kpl'))),'grossAmount',data.gross);
 if p_kind='purchases' and not reference_only then
  if exists(select 1 from jsonb_array_elements(coalesce(project.payload->'purchases','[]')) x where x->>'sourceKsefNumber'=p_number or (x->>'invoice'=data.invoice_number and lower(x->>'shop')=lower(data.seller))) then raise exception 'Ten zakup już istnieje w inwestycji. Sprawdź wcześniejszy wpis przed importem.';end if;
  purchase:=jsonb_build_object('id',purchaseid,'date',data.issue_date,'shop',data.seller,'description',coalesce(description,'Zakup z faktury '||data.invoice_number),'invoice',data.invoice_number,'amount',data.gross,'charge',data.gross,'paid',false,'paidAmount',0,'sourceKsefNumber',p_number,'invoiceItems',items,'supplierNip',data.seller_nip,'supplierAddress',data.seller_address,'dueDate',data.due_date);
  update public.rs_projects set payload=jsonb_set(payload,'{purchases}',coalesce(payload->'purchases','[]')||jsonb_build_array(purchase)),revision=revision+1,updated_at=now() where id=p_project;
 end if;
 insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document,items) values(p_number,p_project,auth.uid(),p_kind,normalized,items) returning * into result;
 return result;
end;$$;
revoke all on function public.rs_assign_ksef(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.rs_assign_ksef(uuid,text,text,text,uuid) to authenticated;
