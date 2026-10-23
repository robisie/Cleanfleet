begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare a public.rs_projects; b public.rs_projects; c public.rs_projects; r jsonb; x text; n text:='1111111111-20261023-abcdef123abc-aa'; la public.rs_ksef_links; lb public.rs_ksef_links; payload jsonb; failed boolean; original_id text;
begin
 -- Direct inserts avoid consuming the real investment numbering sequence; everything rolls back.
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-KSEF-SPLIT-A',2026,10,900001,'{"name":"Test split A","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into a;
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-KSEF-SPLIT-B',2026,10,900002,'{"name":"Test split B","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into b;
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-KSEF-SPLIT-C',2026,10,900003,'{"name":"Test split C","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into c;
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-23</P_1><P_2>SPLIT TEST</P_2><P_15>450</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>4</P_8B><P_8A>szt.</P_8A><P_11A>400</P_11A></FaWiersz><FaWiersz><P_7>Grunt</P_7><P_8B>1</P_8B><P_11A>50</P_11A></FaWiersz></Fa></Faktura>';
 r:=public.rs_allocate_ksef_purchase(a.id,n,x,'[{"index":1,"quantity":2}]',a.revision);
 a:=jsonb_populate_record(null::public.rs_projects,r->'project');la:=jsonb_populate_record(null::public.rs_ksef_links,r->'link');
 if (a.payload#>>'{purchases,0,amount}')::numeric<>200 or (a.payload#>>'{purchases,0,invoiceItems,0,quantity}')::numeric<>2 then raise exception 'First quantity/cost incorrect';end if;
 original_id:=a.payload#>>'{purchases,0,id}';
 r:=public.rs_allocate_ksef_purchase(b.id,n,x,'[{"index":1,"quantity":2},{"index":2,"quantity":1}]',b.revision);
 b:=jsonb_populate_record(null::public.rs_projects,r->'project');lb:=jsonb_populate_record(null::public.rs_ksef_links,r->'link');
 if (b.payload#>>'{purchases,0,amount}')::numeric<>250 then raise exception 'Second assignment incorrect';end if;
 set constraints all immediate;
 if jsonb_array_length(public.rs_ksef_allocation_context(n)->'links')<>2 then raise exception 'Missing assignments';end if;
 failed:=false;begin perform public.rs_allocate_ksef_purchase(c.id,n,x,'[{"index":1,"quantity":1}]',c.revision);exception when others then failed:=true;end;
 if not failed then raise exception 'Over-allocation accepted';end if;
 -- Editing the cost does not change reserved quantities, source invoice or IDs.
 payload:=jsonb_set(a.payload,'{purchases,0,amount}','180');payload:=jsonb_set(payload,'{purchases,0,charge}','220');
 r:=public.rs_allocate_ksef_purchase(a.id,n,null,'[{"index":1,"quantity":2}]',a.revision,la.document,null,payload);
 a:=jsonb_populate_record(null::public.rs_projects,r->'project');la:=jsonb_populate_record(null::public.rs_ksef_links,r->'link');
 if (a.payload#>>'{purchases,0,amount}')::numeric<>180 or (a.payload#>>'{purchases,0,charge}')::numeric<>220 or a.payload#>>'{purchases,0,id}'<>original_id or (la.document->>'grossAmount')::numeric<>450 then raise exception 'Manual amount changed original invoice or purchase identity';end if;
 -- Reducing a reservation makes exactly that quantity available to a third project.
 payload:=jsonb_set(a.payload,'{purchases,0,amount}','100');payload:=jsonb_set(payload,'{purchases,0,charge}','100');
 r:=public.rs_allocate_ksef_purchase(a.id,n,null,'[{"index":1,"quantity":1}]',a.revision,la.document,null,payload);
 a:=jsonb_populate_record(null::public.rs_projects,r->'project');la:=jsonb_populate_record(null::public.rs_ksef_links,r->'link');
 r:=public.rs_allocate_ksef_purchase(c.id,n,x,'[{"index":1,"quantity":1}]',c.revision);c:=jsonb_populate_record(null::public.rs_projects,r->'project');
 failed:=false;begin perform public.rs_allocate_ksef_purchase(a.id,n,null,'[{"index":1,"quantity":1}]',a.revision-1,la.document);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale editor accepted';end if;
 -- A fresh advance remains counted once; reducing cost below it must fail atomically.
 payload:=jsonb_set(a.payload,'{receipts}','[{"id":"advance-test","kind":"materials","amount":100}]');payload:=jsonb_set(payload,'{purchases,0,receiptPayments}','{"advance-test":100}');
 r:=public.rs_allocate_ksef_purchase(a.id,n,null,'[{"index":1,"quantity":1}]',a.revision,la.document,null,payload);a:=jsonb_populate_record(null::public.rs_projects,r->'project');la:=jsonb_populate_record(null::public.rs_ksef_links,r->'link');
 payload:=jsonb_set(a.payload,'{purchases,0,charge}','50');
 failed:=false;begin perform public.rs_allocate_ksef_purchase(a.id,n,null,'[{"index":1,"quantity":0.5}]',a.revision,la.document,null,payload);exception when others then failed:=true;end;
 if not failed then raise exception 'Cost below paid amount accepted';end if;
 failed:=false;begin perform public.rs_unassign_ksef_purchase(a.id,n,a.revision);exception when others then failed:=true;end;
 if not failed then raise exception 'Paid purchase silently deleted';end if;
 -- Detaching another investment leaves its siblings and releases its quantities.
 b:=public.rs_unassign_ksef_purchase(b.id,n,b.revision);
 if exists(select 1 from public.rs_ksef_links where ksef_number=n and project_id=b.id) or not exists(select 1 from public.rs_ksef_links where ksef_number=n and project_id=a.id) then raise exception 'Detaching touched wrong investment';end if;
 if public.cf_ksef_cost_context(n)->'blocked'<>'[1]' then raise exception 'Cross-app context must aggregate siblings';end if;
 set constraints all immediate;
end;$$;
rollback;
