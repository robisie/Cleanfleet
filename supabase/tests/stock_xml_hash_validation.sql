begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text:='1111111111-20261023-abcdef123abc-ac';x text;meta jsonb;failed boolean;digest text;
begin
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-23</P_1><P_2>TEST/1</P_2><P_15>100</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>1</P_8B><P_8A>szt.</P_8A><P_11A>100</P_11A></FaWiersz></Fa></Faktura>';
 digest:=encode(sha256(convert_to(x,'UTF8')),'base64');
 meta:=jsonb_build_object('ksefNumber',n,'invoiceNumber','TEST / 1','issueDate','2026-10-23','invoiceType','Vat','grossAmount',100,'currency','PLN','invoiceHash',digest,'seller',jsonb_build_object('nip','1111111111','name','Test'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')));
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta));
 perform public.rs_ksef_store_xml(n,x);
 if not exists(select 1 from public.rs_ksef_documents where ksef_number=n and preview is not null) then raise exception 'Verified original XML rejected';end if;
 -- BOM-stripping during UTF-8 decoding must not cause a false mismatch.
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta||jsonb_build_object('invoiceHash',encode(sha256(decode('efbbbf','hex')||convert_to(x,'UTF8')),'base64'))));
 perform public.rs_ksef_store_xml(n,x);
 -- Unverified, mismatched XML remains rejected with field-level diagnostics.
 failed:=false;begin perform public.rs_ksef_store_xml(n,replace(x,'<P_15>100</P_15>','<P_15>200</P_15>'));exception when others then failed:=position('kwota brutto' in sqlerrm)>0;end;
 if not failed then raise exception 'Unverified amount mismatch accepted';end if;
 failed:=false;begin perform public.rs_ksef_store_xml(n,replace(x,'<P_1>2026-10-23</P_1>','<P_1>2026-10-22</P_1>'));exception when others then failed:=position('data wystawienia' in sqlerrm)>0;end;
 if not failed then raise exception 'Unverified date mismatch accepted';end if;
 -- Correct hash cannot override purchase ownership or a different seller.
 x:=replace(x,'1111111111','2222222222');
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta||jsonb_build_object('invoiceHash',encode(sha256(convert_to(x,'UTF8')),'base64'))));
 failed:=false;begin perform public.rs_ksef_store_xml(n,x);exception when others then failed:=true;end;
 if not failed then raise exception 'Wrong seller accepted';end if;
end;$$;
rollback;
