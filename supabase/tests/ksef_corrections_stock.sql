begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare n text:='1111111111-20260110-abcdef123abc-aa';c text:='1111111111-20260410-abcdef123abc-ab';x text;cx text;meta jsonb;row jsonb;p public.rs_projects;r jsonb;failed boolean;
begin
 meta:=jsonb_build_object('ksefNumber',n,'invoiceNumber','TEST-STOCK','issueDate','2026-01-10','invoiceType','Vat','grossAmount',400,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Test sklep'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')));
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-01-10</P_1><P_2>TEST-STOCK</P_2><P_15>400</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>4</P_8B><P_8A>szt.</P_8A><P_11A>400</P_11A></FaWiersz></Fa></Faktura>';
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta));perform public.rs_ksef_store_xml(n,x);
 select a into row from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if (row->>'available')::numeric<>4 then raise exception 'Initial stock incorrect';end if;
 perform public.rs_ksef_set_return(n,1,1,0);
 if public.rs_ksef_stock_deduction(n,1)<>1 then raise exception 'Manual return missing';end if;
 failed:=false;begin perform public.rs_ksef_set_return(n,1,2,0);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale return editor accepted';end if;
 -- Correction in April refers to January; it confirms the already recorded piece.
 cx:=replace(replace(replace(x,'2026-01-10','2026-04-10'),'TEST-STOCK','TEST-CORR'),'<P_15>400</P_15><RodzajFaktury>VAT</RodzajFaktury>','<P_15>-100</P_15><RodzajFaktury>KOR</RodzajFaktury><DaneFaKorygowanej><DataWystFaKorygowanej>2026-01-10</DataWystFaKorygowanej><NrFaKorygowanej>TEST-STOCK</NrFaKorygowanej><NrKSeFFaKorygowanej>'||n||'</NrKSeFFaKorygowanej></DaneFaKorygowanej>');
 cx:=replace(replace(cx,'<P_8B>4</P_8B>','<P_8B>-1</P_8B>'),'<P_11A>400</P_11A>','<P_11A>-100</P_11A>');
 perform public.rs_ksef_store_metadata(jsonb_build_array(meta||jsonb_build_object('ksefNumber',c,'invoiceNumber','TEST-CORR','issueDate','2026-04-10','invoiceType','Kor','grossAmount',-100)));
 perform public.rs_ksef_store_xml(c,cx);
 if public.rs_ksef_correction_returns(n,1)<>1 or public.rs_ksef_stock_deduction(n,1)<>1 then raise exception 'Correction doubled manual return';end if;
 if not exists(select 1 from jsonb_array_elements(public.rs_ksef_document_index()) d where d#>>'{metadata,ksefNumber}'=c and d#>>'{references,0,ksefNumber}'=n) then raise exception 'Cross-month reference missing';end if;
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-STOCK-ONLY',2026,10,900010,'{"name":"Test stock","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into p;
 failed:=false;begin perform public.rs_allocate_ksef_purchase(p.id,n,x,'[{"index":1,"quantity":4}]',p.revision);exception when others then failed:=true;end;
 if not failed then raise exception 'Allocated returned piece';end if;
 r:=public.rs_allocate_ksef_purchase(p.id,n,x,'[{"index":1,"quantity":2}]',p.revision);
 p:=jsonb_populate_record(null::public.rs_projects,r->'project');
 select a into row from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if (row->>'available')::numeric<>1 or (p.payload#>>'{purchases,0,amount}')::numeric<>200 then raise exception 'Remaining stock/cost incorrect';end if;
 failed:=false;begin perform public.rs_ksef_set_return(n,1,3,1);exception when others then failed:=true;end;
 if not failed then raise exception 'Returned allocated stock';end if;
 -- Before/after price correction: quantities unchanged, stock must not change.
 cx:=replace(cx,'<FaWiersz><P_7>Farba</P_7><P_8B>-1</P_8B><P_8A>szt.</P_8A><P_11A>-100</P_11A></FaWiersz>','<FaWiersz><P_7>Farba</P_7><P_8B>4</P_8B><P_8A>szt.</P_8A><P_11A>400</P_11A><StanPrzed>1</StanPrzed></FaWiersz><FaWiersz><P_7>Farba</P_7><P_8B>4</P_8B><P_8A>szt.</P_8A><P_11A>300</P_11A></FaWiersz>');
 perform public.rs_ksef_store_xml(c,cx);
 if public.rs_ksef_correction_returns(n,1)<>0 then raise exception 'Price correction removed quantity';end if;
 perform public.rs_ksef_set_return(n,1,0,1);
 select a into row from jsonb_array_elements(public.rs_ksef_stock()) a where a#>>'{metadata,ksefNumber}'=n;
 if (row->>'available')::numeric<>2 then raise exception 'Undo did not release manual stock';end if;
 set constraints all immediate;
end;$$;
rollback;
