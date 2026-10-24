-- Cost corrections retain the original purchase and all investor payment records.
create function public.rs_ksef_cost_correction_context(p_number text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.rs_ksef_documents; ref jsonb; remaining numeric; projects jsonb;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 select * into c from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number;
 if c.preview is null or c.metadata->>'currency'<>'PLN' or c.metadata->>'invoiceType' not ilike 'kor%' or (c.preview->>'gross')::numeric>=0 then raise exception 'Wybierz zweryfikowaną ujemną korektę w PLN.';end if;
 if jsonb_array_length(c.refs)<>1 then raise exception 'Korekta wskazuje kilka faktur lub nie ma jednoznacznego powiązania. Wymaga osobnego podziału kosztów.';end if;
 ref:=c.refs->0;
 remaining:=-(c.preview->>'gross')::numeric+coalesce((select sum((document#>>'{costAdjustment,amount}')::numeric) from public.rs_ksef_links where owner_id=auth.uid() and ksef_number=p_number),0);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.payload->>'name','number',p.contract_number,'revision',p.revision,'sourceNumber',d.ksef_number,'invoiceNumber',d.metadata->>'invoiceNumber','purchaseId',x->>'id','cost',(x->>'amount')::numeric,
  'partial',coalesce((l.document->>'importedAmount')::numeric,(x->>'allocatedInvoiceAmount')::numeric,(x->>'amount')::numeric)<coalesce((d.preview->>'gross')::numeric,(l.document->>'grossAmount')::numeric,(d.metadata->>'grossAmount')::numeric),
  'suggested',greatest(0,least(remaining,(x->>'amount')::numeric,round(-(c.preview->>'gross')::numeric*coalesce((l.document->>'importedAmount')::numeric,(x->>'allocatedInvoiceAmount')::numeric,(x->>'amount')::numeric)/nullif(coalesce((d.preview->>'gross')::numeric,(l.document->>'grossAmount')::numeric,(d.metadata->>'grossAmount')::numeric),0),2))))),'[]') into projects
 from public.rs_ksef_documents d join public.rs_ksef_links l on l.ksef_number=d.ksef_number and l.owner_id=auth.uid() and l.kind='purchases' and not coalesce((l.document->>'referenceOnly')::boolean,false)
 join public.rs_projects p on p.id=l.project_id and p.owner_id=auth.uid()
 cross join lateral jsonb_array_elements(coalesce(p.payload->'purchases','[]')) x
 where d.owner_id=auth.uid() and d.metadata#>>'{seller,nip}'=c.metadata#>>'{seller,nip}'
 and (case when nullif(ref->>'ksefNumber','') is not null then upper(d.ksef_number)=upper(ref->>'ksefNumber') else d.metadata->>'invoiceNumber'=ref->>'number' and d.metadata->>'issueDate'=ref->>'issueDate' end)
 and x->>'sourceKsefNumber'=d.ksef_number and (x->>'amount')::numeric>0
 and not exists(select 1 from public.rs_ksef_links a where a.owner_id=auth.uid() and a.ksef_number=p_number and a.project_id=p.id and a.document ? 'costAdjustment');
 return jsonb_build_object('remaining',greatest(0,remaining),'total',-(c.preview->>'gross')::numeric,'projects',projects);
end;$$;

-- Existing paid money can exceed the corrected cost. It cannot be increased again
-- until the excess has been resolved. The old project's payment records are the limit.
create function public.rs_ksef_correction_paid_limit(p_item jsonb) returns numeric
language sql stable security invoker set search_path='' as $$
 select coalesce(max(case when coalesce((x->>'paid')::boolean,false) then coalesce((x->>'paidAmount')::numeric,0) else 0 end
  +coalesce((select sum(value::numeric) from jsonb_each_text(coalesce(x->'invoicePayments','{}'))),0)
  +coalesce((select sum(value::numeric) from jsonb_each_text(coalesce(x->'receiptPayments','{}'))),0)),0)
 from public.rs_projects p cross join lateral jsonb_array_elements(coalesce(p.payload->'purchases','[]')) x
 where p.owner_id=auth.uid() and x->>'id'=p_item->>'id'
 and exists(select 1 from public.rs_ksef_links l where l.owner_id=auth.uid() and l.project_id=p.id and l.document#>>'{costAdjustment,purchaseId}'=x->>'id');
$$;
do $$declare definition text;begin
 select pg_get_functiondef('public.rs_validate_purchase_sources(jsonb)'::regprocedure) into definition;
 if position('cash+invoices+advances>n' in definition)=0 then raise exception 'Nieoczekiwana wersja walidatora wpłat.';end if;
 execute replace(definition,'cash+invoices+advances>n','cash+invoices+advances>greatest(n,public.rs_ksef_correction_paid_limit(item))');
end;$$;

create function public.rs_guard_corrected_purchase() returns trigger language plpgsql security invoker set search_path='' as $$
declare x jsonb; y jsonb;
begin
 if current_setting('app.rs_cost_correction_write',true)='on' then return new;end if;
 for x in select value from jsonb_array_elements(coalesce(old.payload->'purchases','[]')) where jsonb_array_length(coalesce(value->'ksefCorrections','[]'))>0 loop
  select value into y from jsonb_array_elements(coalesce(new.payload->'purchases','[]')) where value->>'id'=x->>'id';
  if y is null or (y->'amount',y->'charge',y->'sourceKsefNumber',y->'ksefCorrections',y->'correctionPaidBaseline',y->'selectedKsefQuantities',y->'selectedKsefRows',y->'invoiceItems') is distinct from (x->'amount',x->'charge',x->'sourceKsefNumber',x->'ksefCorrections',x->'correctionPaidBaseline',x->'selectedKsefQuantities',x->'selectedKsefRows',x->'invoiceItems') then raise exception 'Zakup uwzględnia korekty KSeF. Nie można usunąć go ani nadpisać jego kwot lub pozycji.';end if;
 end loop;
 return new;
end;$$;
create trigger rs_guard_corrected_purchase before update of payload on public.rs_projects for each row execute function public.rs_guard_corrected_purchase();
create function public.rs_guard_cost_correction_link() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.document ? 'costAdjustment' then raise exception 'Korekta została rozliczona w kosztach. Nie można usunąć ani nadpisać jej powiązania.';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger rs_guard_cost_correction_link before update or delete on public.rs_ksef_links for each row execute function public.rs_guard_cost_correction_link();

create function public.rs_apply_ksef_cost_correction(p_project uuid,p_number text,p_amount numeric,p_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.rs_ksef_documents; p public.rs_projects; context jsonb; target jsonb; purchase jsonb; adjusted jsonb; document jsonb; link public.rs_ksef_links; delta numeric; charge_delta numeric; prior_flag text;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Podaj dodatnią kwotę obniżenia kosztu.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_number,0));
 context:=public.rs_ksef_cost_correction_context(p_number);
 select value into target from jsonb_array_elements(context->'projects') where value->>'id'=p_project::text;
 if target is not null then perform pg_advisory_xact_lock(hashtextextended(target->>'sourceNumber',0));end if;
 select * into p from public.rs_projects where id=p_project and owner_id=auth.uid() for update;
 if p.id is null then raise exception 'Nie znaleziono inwestycji.';end if;
 select * into link from public.rs_ksef_links where owner_id=auth.uid() and project_id=p_project and ksef_number=p_number;
 if link.document ? 'costAdjustment' then
  if -(link.document#>>'{costAdjustment,amount}')::numeric<>p_amount then raise exception 'Ta korekta jest już rozliczona z inną kwotą.';end if;
  return jsonb_build_object('project',to_jsonb(p),'link',to_jsonb(link),'alreadyApplied',true);
 end if;
 if p.revision<>p_revision or p_revision is null then raise exception 'RS_CONFLICT: Inwestycja zmieniła się. Odśwież dane.';end if;
 context:=public.rs_ksef_cost_correction_context(p_number);
 select value into target from jsonb_array_elements(context->'projects') where value->>'id'=p_project::text;
 if target is null or p_amount>(context->>'remaining')::numeric or p_amount>(target->>'cost')::numeric then raise exception 'Kwota przekracza pozostałą korektę lub koszt zakupu w tej inwestycji.';end if;
 perform pg_advisory_xact_lock(hashtextextended(target->>'sourceNumber',0));
 select * into c from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number;
 select value into purchase from jsonb_array_elements(p.payload->'purchases') where value->>'id'=target->>'purchaseId';
 delta:=-p_amount;charge_delta:=-least(p_amount,greatest(0,coalesce((purchase->>'charge')::numeric,0)));
 adjusted:=purchase||jsonb_build_object('amount',(purchase->>'amount')::numeric+delta,'charge',(purchase->>'charge')::numeric+charge_delta,'ksefCorrections',coalesce(purchase->'ksefCorrections','[]')||jsonb_build_array(jsonb_build_object('ksefNumber',p_number,'number',c.metadata->>'invoiceNumber','date',c.metadata->>'issueDate','amount',delta,'charge',charge_delta)));
 if not (purchase ? 'paidAmount') then adjusted:=adjusted||jsonb_build_object('correctionPaidBaseline',coalesce(purchase->'correctionPaidBaseline',purchase->'amount'));end if;
 document:=jsonb_build_object('id',coalesce(link.document->>'id',gen_random_uuid()::text),'number',c.metadata->>'invoiceNumber','status','accepted','ksef_number',p_number,'originKind','purchases','externalKsef',true,'referenceOnly',true,'grossAmount',c.preview->'gross','selectedQuantities','[]'::jsonb,
  'payload',jsonb_build_object('currency','PLN','brand','robisie','issueDate',c.metadata->>'issueDate','seller',c.metadata->'seller','buyer',c.metadata->'buyer','source',jsonb_build_object('app','robisie','id',p_project),'lines','[]'::jsonb),
  'costAdjustment',jsonb_build_object('purchaseId',purchase->>'id','sourceNumber',target->>'sourceNumber','amount',delta,'charge',charge_delta));
 insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document,items) values(p_number,p_project,auth.uid(),'purchases',document,c.preview->'items')
 on conflict(ksef_number,project_id) do update set document=excluded.document,items=excluded.items returning * into link;
 p.payload:=jsonb_set(p.payload-'_undo','{purchases}',(select jsonb_agg(case when value->>'id'=purchase->>'id' then adjusted else value end order by ord) from jsonb_array_elements(p.payload->'purchases') with ordinality a(value,ord)));
 perform public.rs_validate_purchase_sources(p.payload);
 prior_flag:=current_setting('app.rs_cost_correction_write',true);perform set_config('app.rs_cost_correction_write','on',true);
 update public.rs_projects set payload=p.payload,revision=revision+1,updated_at=now() where id=p_project and owner_id=auth.uid() returning * into p;
 perform set_config('app.rs_cost_correction_write',coalesce(prior_flag,''),true);
 return jsonb_build_object('project',to_jsonb(p),'link',to_jsonb(link));
end;$$;
revoke all on function public.rs_ksef_cost_correction_context(text),public.rs_ksef_correction_paid_limit(jsonb),public.rs_apply_ksef_cost_correction(uuid,text,numeric,bigint) from public,anon;
grant execute on function public.rs_ksef_cost_correction_context(text),public.rs_ksef_correction_paid_limit(jsonb),public.rs_apply_ksef_cost_correction(uuid,text,numeric,bigint) to authenticated;
revoke all on function public.rs_guard_corrected_purchase(),public.rs_guard_cost_correction_link() from public,anon,authenticated;
