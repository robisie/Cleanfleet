begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare a public.rs_projects;b public.rs_projects;other public.rs_projects;r jsonb;ctx jsonb;next_payload jsonb;x text;cx text;n text:='1111111111-20261024-abcdef111111-aa';cn text:='1111111111-20261024-abcdef222222-aa';failed boolean;
begin
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-CORRECTION-A',2026,10,910001,'{"name":"Correction A","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into a;
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-CORRECTION-B',2026,10,910002,'{"name":"Correction B","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into b;
 insert into public.rs_projects(contract_number,year,month,serial,payload) values('TEST-CORRECTION-OTHER',2026,10,910003,'{"name":"Other","purchases":[],"receipts":[],"invoiceSettlements":[]}') returning * into other;
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-24</P_1><P_2>COST SOURCE TEST</P_2><P_15>1000</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8B>10</P_8B><P_8A>szt.</P_8A><P_11A>1000</P_11A></FaWiersz></Fa></Faktura>';
 cx:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-24</P_1><P_2>COST CORRECTION TEST</P_2><P_15>-200</P_15><RodzajFaktury>KOR</RodzajFaktury><DaneFaKorygowanej><NrFaKorygowanej>COST SOURCE TEST</NrFaKorygowanej><DataWystFaKorygowanej>2026-10-24</DataWystFaKorygowanej><NrKSeFFaKorygowanej>'||n||'</NrKSeFFaKorygowanej></DaneFaKorygowanej><FaWiersz><P_7>Farba</P_7><P_8B>-2</P_8B><P_8A>szt.</P_8A><P_11A>-200</P_11A></FaWiersz></Fa></Faktura>';
 perform public.rs_ksef_store_metadata(jsonb_build_array(jsonb_build_object('ksefNumber',n,'invoiceNumber','COST SOURCE TEST','issueDate','2026-10-24','invoiceType','Vat','grossAmount',1000,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Test sklep'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297'))),jsonb_build_object('ksefNumber',cn,'invoiceNumber','COST CORRECTION TEST','issueDate','2026-10-24','invoiceType','Kor','grossAmount',-200,'currency','PLN','seller',jsonb_build_object('nip','1111111111','name','Test sklep'),'buyer',jsonb_build_object('identifier',jsonb_build_object('value','6351861297')))));
 perform public.rs_ksef_store_xml(n,x);
 r:=public.rs_allocate_ksef_purchase(a.id,n,x,'[{"index":1,"quantity":6}]',a.revision);a:=jsonb_populate_record(null::public.rs_projects,r->'project');
 r:=public.rs_allocate_ksef_purchase(b.id,n,x,'[{"index":1,"quantity":4}]',b.revision);b:=jsonb_populate_record(null::public.rs_projects,r->'project');
 -- One investment was already fully paid. Preserve that real money after correction.
 next_payload:=jsonb_set(jsonb_set(a.payload,'{purchases,0,paid}','true'),'{purchases,0,paidAmount}','600');
 update public.rs_projects set payload=next_payload,revision=revision+1 where id=a.id returning * into a;
 perform public.rs_ksef_store_xml(cn,cx);
 ctx:=public.rs_ksef_cost_correction_context(cn);
 if jsonb_array_length(ctx->'projects')<>2 or (select (v->>'suggested')::numeric from jsonb_array_elements(ctx->'projects') v where v->>'id'=a.id::text)<>120 then raise exception 'Wrong partial suggestion';end if;
 failed:=false;begin perform public.rs_apply_ksef_cost_correction(other.id,cn,100,other.revision);exception when others then failed:=true;end;if not failed then raise exception 'Unrelated investment accepted';end if;
 failed:=false;begin perform public.rs_apply_ksef_cost_correction(a.id,cn,120,a.revision+1);exception when others then failed:=true;end;if not failed then raise exception 'Stale revision accepted';end if;
 r:=public.rs_apply_ksef_cost_correction(a.id,cn,120,a.revision);a:=jsonb_populate_record(null::public.rs_projects,r->'project');
 if (a.payload#>>'{purchases,0,amount}')::numeric<>480 or (a.payload#>>'{purchases,0,charge}')::numeric<>480 or (a.payload#>>'{purchases,0,paidAmount}')::numeric<>600 then raise exception 'Cost or recorded payment wrong';end if;
 perform public.rs_validate_purchase_sources(a.payload);
 r:=public.rs_apply_ksef_cost_correction(a.id,cn,120,a.revision-1);
 if not (r->>'alreadyApplied')::boolean or (r#>>'{project,payload,purchases,0,amount}')::numeric<>480 then raise exception 'Repeated correction deducted twice';end if;
 failed:=false;begin perform public.rs_apply_ksef_cost_correction(b.id,cn,81,b.revision);exception when others then failed:=true;end;if not failed then raise exception 'Correction over-allocation accepted';end if;
 r:=public.rs_apply_ksef_cost_correction(b.id,cn,80,b.revision);b:=jsonb_populate_record(null::public.rs_projects,r->'project');
 if public.rs_ksef_project_cost(n,1)<>800 then raise exception 'Warehouse investment costs ignore corrections';end if;
 if (b.payload#>>'{purchases,0,amount}')::numeric<>320 or (public.rs_ksef_cost_correction_context(cn)->>'remaining')::numeric<>0 then raise exception 'Wrong remaining correction';end if;
 failed:=false;begin perform public.rs_validate_purchase_sources(jsonb_set(a.payload,'{purchases,0,paidAmount}','601'));exception when others then failed:=true;end;if not failed then raise exception 'Overpayment increased after correction';end if;
 failed:=false;begin update public.rs_projects set payload=jsonb_set(a.payload,'{purchases,0,amount}','600') where id=a.id;exception when others then failed:=true;end;if not failed then raise exception 'Corrected cost overwritten';end if;
 failed:=false;begin delete from public.rs_ksef_links where ksef_number=cn and project_id=a.id;exception when others then failed:=true;end;if not failed then raise exception 'Applied correction deleted';end if;
 set constraints all immediate;
end;$$;
rollback;
