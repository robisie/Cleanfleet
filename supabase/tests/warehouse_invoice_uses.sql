begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text:='1111111111-20261023-abcdef987654-ca';x text;meta jsonb;r jsonb;failed boolean;
begin
 meta:=jsonb_build_object('ksefNumber',n,'invoiceNumber','TEST-WHOLE-INVOICE','issueDate','2026-10-23','invoiceType','Vat','grossAmount',300,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Test sklep'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')));
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-23</P_1><P_2>TEST-WHOLE-INVOICE</P_2><P_15>300</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>2</P_8B><P_8A>szt.</P_8A><P_11A>100</P_11A></FaWiersz><FaWiersz><P_7>Pędzel</P_7><P_8B>4</P_8B><P_8A>szt.</P_8A><P_11A>200</P_11A></FaWiersz></Fa></Faktura>';
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta));perform public.rs_ksef_store_xml(n,x);
 failed:=false;begin perform public.rs_ksef_set_invoice_use(n,'auto',array[1]);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale invoice list accepted';end if;
 perform public.rs_ksef_set_use(n,2,'firmowe',1,0);
 failed:=false;begin perform public.rs_ksef_set_invoice_use(n,'auto',array[1,2]);exception when others then failed:=true;end;
 if not failed then raise exception 'Partially assigned invoice accepted';end if;
 select a into r from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n and (a#>>'{item,index}')::integer=1;
 if (r->>'classifiedAuto')::numeric<>0 then raise exception 'Bulk assignment failed to roll back first line';end if;
 perform public.rs_ksef_set_use(n,2,'firmowe',0,1);
 perform public.rs_ksef_set_invoice_use(n,'auto',array[2,1]);
 select a into r from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n and (a#>>'{item,index}')::integer=1;
 if (r->>'classifiedAuto')::numeric<>2 then raise exception 'First line not fully assigned';end if;
 select a into r from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n and (a#>>'{item,index}')::integer=2;
 if (r->>'classifiedAuto')::numeric<>4 then raise exception 'Second line not fully assigned';end if;
end;$$;
rollback;
