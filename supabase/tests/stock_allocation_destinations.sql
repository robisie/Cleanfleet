begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare a public.rs_projects;b public.rs_projects;r jsonb;stock jsonb;n text:='1111111111-20261030-abcdef123abc-ba';x text;meta jsonb;
begin
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-STOCK-DEST-A',2026,10,900021,'{"name":"Test schody","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into a;
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-STOCK-DEST-B',2026,10,900022,'{"name":"Test łazienka","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into b;
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Sklep testowy</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-30</P_1><P_2>TEST-STOCK-DEST</P_2><P_15>100</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>10</P_8B><P_8A>szt.</P_8A><P_11A>100</P_11A></FaWiersz></Fa></Faktura>';
 meta:=jsonb_build_object('ksefNumber',n,'invoiceNumber','TEST-STOCK-DEST','issueDate','2026-10-30','invoiceType','Vat','grossAmount',100,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Sklep testowy'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')));
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta));perform public.rs_ksef_store_xml(n,x);
 perform public.rs_allocate_ksef_purchase(a.id,n,x,'[{"index":1,"quantity":2}]',a.revision);
 perform public.rs_allocate_ksef_purchase(b.id,n,x,'[{"index":1,"quantity":1}]',b.revision);
 perform public.rs_ksef_set_use(n,1,'auto',1,0);
 perform public.rs_ksef_set_use(n,1,'firmowe',1,0);
 set constraints all immediate;
 select value into stock from jsonb_array_elements(public.rs_ksef_stock()) where value#>>'{metadata,ksefNumber}'=n;
 if jsonb_array_length(stock->'destinations')<>4 then raise exception 'Missing stock destinations: %',stock->'destinations';end if;
 if not exists(select 1 from jsonb_array_elements(stock->'destinations') d where d->>'name'='Test schody' and (d->>'quantity')::numeric=2) then raise exception 'Wrong project quantity';end if;
 if (stock->>'assigned')::numeric<>5 or (stock->>'available')::numeric<>5 or (select sum((d->>'quantity')::numeric) from jsonb_array_elements(stock->'destinations') d)<>5 then raise exception 'Stock totals changed';end if;
end;$$;
rollback;
