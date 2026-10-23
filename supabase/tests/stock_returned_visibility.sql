begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text:='1111111111-20260110-abcdef123abc-ba';c text:='1111111111-20260410-abcdef123abc-bb'; x text; cx text; meta jsonb; row jsonb;
begin
 meta:=jsonb_build_object('ksefNumber',n,'invoiceNumber','TEST-RETURNED','issueDate','2026-01-10','invoiceType','Vat','grossAmount',100,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Sklep testowy'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')));
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-01-10</P_1><P_2>TEST-RETURNED</P_2><P_15>100</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>1</P_8B><P_8A>szt.</P_8A><P_11A>100</P_11A></FaWiersz></Fa></Faktura>';
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta));perform public.rs_ksef_store_xml(n,x);
 cx:=replace(replace(replace(x,'2026-01-10','2026-04-10'),'TEST-RETURNED','TEST-RETURNED-CORR'),'<P_15>100</P_15><RodzajFaktury>VAT</RodzajFaktury>','<P_15>-100</P_15><RodzajFaktury>KOR</RodzajFaktury><DaneFaKorygowanej><DataWystFaKorygowanej>2026-01-10</DataWystFaKorygowanej><NrFaKorygowanej>TEST-RETURNED</NrFaKorygowanej><NrKSeFFaKorygowanej>'||n||'</NrKSeFFaKorygowanej></DaneFaKorygowanej>');
 cx:=replace(replace(cx,'<P_8B>1</P_8B>','<P_8B>-1</P_8B>'),'<P_11A>100</P_11A>','<P_11A>-100</P_11A>');
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta||jsonb_build_object('ksefNumber',c,'invoiceNumber','TEST-RETURNED-CORR','issueDate','2026-04-10','invoiceType','Kor','grossAmount',-100)));
 perform public.rs_ksef_store_xml(c,cx);
 select a into row from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if row is null or (row->>'available')::numeric<>0 or (row->>'returned')::numeric<>1 or (row->>'manualReturned')::numeric<>0 then raise exception 'Fully corrected return is absent from stock view';end if;
end;$$;
rollback;
