begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; x text; link public.rs_ksef_links; after_payload jsonb; original jsonb; failed boolean:=false; pid uuid:=gen_random_uuid();
begin
 original:=jsonb_build_object('id',pid,'date','2026-10-01','shop','Ręczny wpis','description','Farba','invoice','','amount',123,'charge',110,'paid',false,'paidAmount',0,'receiptPayments',jsonb_build_object('advance',50));
 p:=public.rs_create_project(jsonb_build_object('name','DUPLICATE REVIEW TEST','purchases',jsonb_build_array(original),'receipts',jsonb_build_array(jsonb_build_object('id','advance','date','2026-10-01','kind','materials','amount',50)),'invoiceSettlements','[]'::jsonb),current_date);
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>DUPLICATE TEST</P_2><P_15>177</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_11A>123</P_11A></FaWiersz><FaWiersz><P_7>Prywatne</P_7><P_11A>54</P_11A></FaWiersz></Fa></Faktura>';
 begin perform public.rs_import_ksef_purchase(p.id,'1111111111-20261020-abcdefabcdee-aa',x,array[1],null,p.revision+1,pid);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale revision accepted';end if;
 failed:=false;begin perform public.rs_import_ksef_purchase(p.id,'1111111111-20261020-abcdefabcdee-aa',x,array[2],null,p.revision,pid);exception when others then failed:=true;end;
 if not failed then raise exception 'Different amount accepted';end if;
 link:=public.rs_import_ksef_purchase(p.id,'1111111111-20261020-abcdefabcdee-aa',x,array[1],null,p.revision,pid);
 select r.payload into after_payload from public.rs_projects r where r.id=p.id;
 if jsonb_array_length(after_payload->'purchases')<>1 then raise exception 'Duplicate purchase created';end if;
 if after_payload#>>'{purchases,0,id}'<>pid::text or after_payload#>>'{purchases,0,charge}'<>'110' or after_payload#>'{purchases,0,receiptPayments}'<>original->'receiptPayments' or after_payload->'receipts'<>p.payload->'receipts' then raise exception 'Financial fields changed';end if;
 if after_payload#>>'{purchases,0,sourceKsefNumber}'<>link.ksef_number or after_payload#>>'{purchases,0,description}' like '%Prywatne%' or (link.document->>'importedAmount')::numeric<>123 then raise exception 'Invoice metadata wrong';end if;
 -- A retry after a lost response does not duplicate or overwrite the replacement.
 perform public.rs_import_ksef_purchase(p.id,link.ksef_number,x,array[1],null,p.revision,pid);
 if (select r.payload from public.rs_projects r where r.id=p.id)<>after_payload then raise exception 'Retry changed financial state';end if;
 failed:=false;begin perform public.rs_import_ksef_purchase(p.id,'1111111111-20261020-abcdefabcdee-ab',x,array[1],null,p.revision+1,pid);exception when others then failed:=true;end;
 if not failed then raise exception 'Replaced a purchase already linked to KSeF';end if;
end;$$;
rollback;
