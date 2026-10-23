begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text:='1111111111-20261020-abcdef123abc-ca';x text;meta jsonb;r jsonb;failed boolean;
begin
 meta:=jsonb_build_object('ksefNumber',n,'invoiceNumber','TEST-WAREHOUSE','issueDate','2026-10-20','invoiceType','Vat','grossAmount',400,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Test sklep'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')));
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>TEST-WAREHOUSE</P_2><P_15>400</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>4</P_8B><P_8A>szt.</P_8A><P_11A>400</P_11A></FaWiersz></Fa></Faktura>';
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta));perform public.rs_ksef_store_xml(n,x);
 perform public.rs_ksef_set_use(n,1,'auto',2,0);
 select a into r from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if (r->>'available')::numeric<>2 or (r->>'classifiedAuto')::numeric<>2 or (r#>>'{uses,auto,revision}')::integer<>1 then raise exception 'Auto allocation wrong';end if;
 if (public.rs_ksef_allocation_context(n)#>>'{links,0,document,selectedQuantities,0,quantity}')::numeric<>2 then raise exception 'Auto quantity not reserved in investment picker';end if;
 failed:=false;begin perform public.rs_ksef_select_quantities(n,(select id from public.rs_projects limit 1),(select preview from public.rs_ksef_documents where ksef_number=n),'[{"index":1,"quantity":3}]');exception when others then failed:=true;end;
 if not failed then raise exception 'Investment picker over-allocated classified quantity';end if;
 failed:=false;begin perform public.rs_ksef_set_use(n,1,'firmowe',3,0);exception when others then failed:=true;end;
 if not failed then raise exception 'Over-allocation accepted';end if;
 perform public.rs_ksef_set_use(n,1,'firmowe',2,0);
 select a into r from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if (r->>'available')::numeric<>0 or (r->>'classifiedCompany')::numeric<>2 then raise exception 'Fully classified item hidden';end if;
 failed:=false;begin perform public.rs_ksef_set_use(n,1,'auto',1,0);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale revision accepted';end if;
 failed:=false;begin perform public.rs_ksef_set_return(n,1,1,0);exception when others then failed:=true;end;
 if not failed then raise exception 'Returned an allocated item';end if;
 perform public.rs_ksef_set_use(n,1,'auto',0,1);
 select a into r from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if (r->>'available')::numeric<>2 then raise exception 'Released Auto quantity missing';end if;
end;$$;
rollback;
