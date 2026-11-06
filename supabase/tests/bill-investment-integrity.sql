begin;
do $$
declare
  owner uuid := gen_random_uuid();
  project uuid := gen_random_uuid();
  advance uuid := gen_random_uuid();
  final_one uuid := gen_random_uuid();
  final_two uuid := gen_random_uuid();
  bill_invoice uuid := gen_random_uuid();
  bank_invoice uuid := gen_random_uuid();
  ksef_invoice uuid := gen_random_uuid();
  issue_date text := to_char(now() at time zone 'Europe/Warsaw', 'YYYY-MM-DD');
  invoice jsonb;
  advance_payload jsonb;
  row_before jsonb;
  before_number integer;
  invalid jsonb;
begin
  insert into auth.users(id) values (owner);
  insert into public.user_roles(user_id,role) values (owner,'admin');
  perform set_config('request.jwt.claim.sub', owner::text, true);
  insert into public.rs_projects(id,owner_id,contract_number,year,month,serial,payload)
  values (project,owner,'QA-'||project,2099,12,2147483647,'{}');

  advance_payload := jsonb_build_object('documentType','advance','advanceAmount','250.00',
    'currency','PLN','source',jsonb_build_object('app','robisie','id',project));
  insert into public.bill_invoices(id,creator_id,number,payload,status,ksef_number)
  values (advance,owner,'QA advance',advance_payload,'accepted','QA KSeF');
  invoice := jsonb_build_object('issueDate',issue_date,'documentType','final','currency','PLN',
    'source',jsonb_build_object('app','robisie','id',project),'lines','[{"qty":"1","price":"1000"}]'::jsonb,
    'advances',jsonb_build_array(jsonb_build_object('id',advance,'amount','250')));
  insert into public.bill_invoices(id,creator_id,payload) values (final_one,owner,invoice),(final_two,owner,invoice);
  perform public.bill_issue_prepared(final_one,1,invoice);
  select last_number into before_number from public.bill_counters where bill_counters.period=left(issue_date,7);
  begin
    perform public.bill_issue_prepared(final_two,1,invoice);
    raise exception 'QA duplicate reservation accepted';
  exception when raise_exception then
    if sqlerrm <> 'Ta zaliczka jest już rozliczona na fakturze końcowej.' then raise; end if;
  end;
  if not exists (select 1 from public.bill_invoices where id=final_two and status='draft' and number is null)
     or (select last_number from public.bill_counters where bill_counters.period=left(issue_date,7)) is distinct from before_number then
    raise exception 'QA failed reservation changed draft or counter';
  end if;
  update public.bill_invoices set status='uncertain' where id=final_one;
  if (select final_id from public.bill_final_advance_reservations where advance_id=advance) is distinct from final_one then
    raise exception 'QA uncertainty released advance';
  end if;
  update public.bill_invoices set status='rejected' where id=final_one;
  perform public.bill_issue_prepared(final_two,1,invoice);

  invoice := jsonb_build_object('currency','PLN','source',jsonb_build_object('app','robisie','id',project),
    'globalDiscount','10.00','lines','[{"qty":"1","price":"1000.00","discount":"10.00"}]'::jsonb);
  insert into public.bill_invoices(id,creator_id,number,payload,status)
  values (bill_invoice,owner,'QA BILL',invoice,'issued'),
    (bank_invoice,owner,'QA EUR',jsonb_set(invoice,'{currency}','"EUR"'),'issued');
  insert into public.rs_ksef_links(ksef_number,project_id,owner_id,kind,document)
  values ('QA KSeF',project,owner,'sales',jsonb_build_object('id',ksef_invoice,'number','QA KSeF',
    'grossAmount',123.45,'payload',jsonb_build_object('currency','PLN')));
  row_before := jsonb_build_object('invoiceSettlements', jsonb_build_array(
    jsonb_build_object('id',bill_invoice,'number','QA BILL','total',891),
    jsonb_build_object('id',ksef_invoice,'number','QA KSeF','total',123.45),
    jsonb_build_object('id',advance,'number','QA advance','total',250),
    jsonb_build_object('id',final_two,'number',(select number from public.bill_invoices where id=final_two),'total',750)));
  update public.rs_projects set payload=row_before where id=project;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('id',bill_invoice,'number','QA BILL','total',1000),
    jsonb_build_object('id',bill_invoice,'number','QA false','total',891),
    jsonb_build_object('id',bank_invoice,'number','QA EUR','total',891),
    jsonb_build_object('id',ksef_invoice,'number','QA KSeF','total',125),
    jsonb_build_object('id',gen_random_uuid(),'number','QA missing','total',891))) loop
    begin
      update public.rs_projects set payload=jsonb_build_object('invoiceSettlements',jsonb_build_array(invalid)) where id=project;
      raise exception 'QA invalid settlement accepted';
    exception when raise_exception then
      if sqlerrm not like 'Rozliczenie musi mieć numer i kwotę%' then raise; end if;
    end;
  end loop;
  if (select payload from public.rs_projects where id=project) is distinct from row_before then
    raise exception 'QA failed settlement changed project';
  end if;
end;
$$;
rollback;
select 'BILL advance reservation and ROBISIĘ invoice settlement checks passed' as result;
