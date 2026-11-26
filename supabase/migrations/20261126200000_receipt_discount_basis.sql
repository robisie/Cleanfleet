-- Preserve the actual payment and discount separately from the selected stock/accounting amount.
create or replace function public.rs_receipt_save(p_hash text,p_data jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare i jsonb;items jsonb:='[]';n numeric;gross numeric;total numeric;idx integer:=0;number text;docdate date;paid numeric;discount numeric;basis text;
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_data is null or jsonb_typeof(p_data)<>'object' or coalesce(p_data->>'buyerNip','')<>'6351861297' or coalesce(p_data->>'sellerNip','')!~'^[0-9]{10}$' or p_data->>'sellerNip'='6351861297'
 or length(trim(coalesce(p_data->>'seller','')))<2 or length(trim(coalesce(p_data->>'seller','')))>200 or length(trim(coalesce(p_data->>'number','')))<1 or length(trim(coalesce(p_data->>'number','')))>100 or coalesce(p_data->>'date','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 or coalesce(jsonb_typeof(p_data->'items'),'')<>'array' then raise exception 'Sprawdź datę, numer, oba NIP-y, sklep i pozycje paragonu.';end if;
 if jsonb_array_length(p_data->'items') not between 1 and 80 then raise exception 'Paragon musi zawierać od 1 do 80 pozycji.';end if;
 begin docdate:=(p_data->>'date')::date;total:=(p_data->>'total')::numeric;exception when others then raise exception 'Nieprawidłowa data lub kwota paragonu.';end;
 begin
  paid:=coalesce((p_data->>'paidAmount')::numeric,total);discount:=coalesce((p_data->>'discountAmount')::numeric,0);basis:=coalesce(p_data->>'amountBasis','paid');
 exception when others then raise exception 'Nieprawidłowa kwota zapłaty lub rabatu.';end;
 if paid<0 or paid>1000000 or paid<>round(paid,2) or paid::text in ('NaN','Infinity','-Infinity') or discount<0 or discount>1000000 or discount<>round(discount,2) or discount::text in ('NaN','Infinity','-Infinity') or basis not in ('paid','beforeDiscount') or (basis='paid' and total<>paid) or (basis='beforeDiscount' and total<>paid+discount) then
  raise exception 'Kwota zapłacona, rabat i wybrana kwota rozliczenia muszą się zgadzać.';
 end if;
 if docdate is null or total is null or docdate>current_date+1 or docdate<date '2000-01-01' or total<0 or total>1000000 or total::text in ('NaN','Infinity','-Infinity') or total<>round(total,2) then raise exception 'Nieprawidłowa data lub kwota paragonu.';end if;
 for i in select value from jsonb_array_elements(p_data->'items') loop
  idx:=idx+1;
  begin n:=(i->>'quantity')::numeric;gross:=(i->>'gross')::numeric;exception when others then raise exception 'Sprawdź ilość i cenę pozycji %.',idx;end;
  if length(trim(coalesce(i->>'name',''))) not between 2 and 200 or length(trim(coalesce(i->>'unit',''))) not between 1 and 25 or n is null or gross is null or n<=0 or n>1000000 or n<>round(n,6) or n::text in ('NaN','Infinity','-Infinity') or gross<0 or gross>1000000 or gross<>round(gross,2) or gross::text in ('NaN','Infinity','-Infinity') then raise exception 'Sprawdź pozycję %.',idx;end if;
  items:=items||jsonb_build_array(jsonb_build_object('index',idx,'name',trim(i->>'name'),'quantity',n,'unit',trim(i->>'unit'),'gross',gross));
 end loop;
 if (select sum((v->>'gross')::numeric) from jsonb_array_elements(items) v)<>total then raise exception 'Suma pozycji musi być równa kwocie paragonu.';end if;
 if exists(select 1 from public.rs_ksef_documents where owner_id=auth.uid() and metadata->>'source'='nip-receipt' and (metadata->>'sourceHash'=p_hash or (metadata#>>'{seller,nip}'=p_data->>'sellerNip' and metadata->>'issueDate'=p_data->>'date' and metadata->>'invoiceNumber'=p_data->>'number' and (metadata->>'grossAmount')::numeric=total))) then raise exception 'Ten paragon jest już w magazynie. Wyszukaj go po numerze.';end if;
 number:='PARAGON-'||gen_random_uuid()::text;
 insert into public.rs_ksef_documents(owner_id,ksef_number,metadata,preview) values(auth.uid(),number,
 jsonb_build_object('source','nip-receipt','sourceHash',p_hash,'ksefNumber',number,'invoiceNumber',trim(p_data->>'number'),'issueDate',docdate,'grossAmount',total,'paidAmount',paid,'discountAmount',discount,'amountBasis',basis,'currency','PLN','invoiceType','RECEIPT','seller',jsonb_build_object('name',trim(p_data->>'seller'),'nip',p_data->>'sellerNip'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value',p_data->>'buyerNip'))),
 jsonb_build_object('items',items,'gross',total,'currency','PLN','canSelect',true));
 return number;
end;$$;
revoke all on function public.rs_receipt_save(text,jsonb) from public,anon;
grant execute on function public.rs_receipt_save(text,jsonb) to authenticated;
