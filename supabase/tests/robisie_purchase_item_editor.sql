begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; x text; link public.rs_ksef_links; data jsonb; preview jsonb; selected_items jsonb; row_id text; failed boolean; old_revision bigint;
begin
 p:=public.rs_create_project('{"name":"PURCHASE FORM TEST","purchases":[]}'::jsonb,current_date);
 x:='<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>LINE TEST</P_2><P_15>282</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><NrWierszaFa>10</NrWierszaFa><P_7>Farba &amp; grunt</P_7><P_8B>2</P_8B><P_8A>szt.</P_8A><P_10>20</P_10><P_11>100</P_11><P_12>23</P_12></FaWiersz><FaWiersz><NrWierszaFa>20</NrWierszaFa><P_7>Prywatny zakup</P_7><P_11A>54</P_11A><P_12>8</P_12></FaWiersz><FaWiersz><NrWierszaFa>30</NrWierszaFa><P_7>Materiał drugi</P_7><P_11>100</P_11><P_11Vat>5</P_11Vat><P_12>5</P_12></FaWiersz></Fa></Faktura>';
 link:=public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-d1',x,array[1,2,3]);
 select * into p from public.rs_projects where id=p.id;row_id:=p.payload#>>'{purchases,0,id}';preview:=public.rs_ksef_purchase_preview(x);
 select jsonb_agg(i order by (i->>'index')::integer) into selected_items from jsonb_array_elements(preview->'items') i where (i->>'index')::integer in (1,3);
 data:=jsonb_set(p.payload,'{purchases,0}',(p.payload#>'{purchases,0}')||jsonb_build_object('amount',228,'charge',228,'paid',true,'paidAmount',20,'shop','Sklep formularz','description','Farba & grunt 2 szt.; Materiał drugi','invoiceItems',selected_items,'selectedKsefRows','[1,3]'::jsonb,'invoiceGrossAmount',282));
 p:=public.rs_save_purchase_ksef_form(p.id,p.revision,link.ksef_number,x,array[1,3],array[1,2,3],data);
 if p.payload#>>'{purchases,0,id}'<>row_id or (p.payload#>>'{purchases,0,amount}')::numeric<>228 or (p.payload#>>'{purchases,0,paidAmount}')::numeric<>20 or p.payload#>>'{purchases,0,shop}'<>'Sklep formularz' or (select document->'selectedIndices' from public.rs_ksef_links where ksef_number=link.ksef_number)<>'[1,3]'::jsonb then raise exception 'Purchase form did not commit atomically';end if;
 -- Bill edits the same record; Robisię reads the updated selection.
 link:=public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[2],p.id,array[1,3]);
 select * into p from public.rs_projects where id=p.id;
 if (p.payload#>>'{purchases,0,amount}')::numeric<>54 or (p.payload#>>'{purchases,0,paidAmount}')::numeric<>20 then raise exception 'Bill round-trip mismatch';end if;
 -- Invalid shrink/form payment changes roll back both the form and metadata.
 old_revision:=p.revision;data:=jsonb_set(p.payload,'{purchases,0}',(p.payload#>'{purchases,0}')||jsonb_build_object('amount',54,'charge',54,'paidAmount',100,'shop','SHOULD ROLLBACK'));
 failed:=false;begin perform public.rs_save_purchase_ksef_form(p.id,p.revision,link.ksef_number,x,array[2],array[2],data);exception when others then failed:=true;end;
 if not failed or (select revision from public.rs_projects where id=p.id)<>old_revision or (select payload#>>'{purchases,0,shop}' from public.rs_projects where id=p.id)='SHOULD ROLLBACK' then raise exception 'Invalid form was not atomic';end if;
 -- Invalid row indices fail after the form write; the complete transaction still rolls back.
 data:=jsonb_set(p.payload,'{purchases,0}',(p.payload#>'{purchases,0}')||jsonb_build_object('amount',282,'charge',282,'shop','SHOULD ROLLBACK'));
 failed:=false;begin perform public.rs_save_purchase_ksef_form(p.id,p.revision,link.ksef_number,x,array[1,1,1],array[2],data);exception when others then failed:=true;end;
 if not failed or (select revision from public.rs_projects where id=p.id)<>old_revision then raise exception 'Failed selection left a partial form save';end if;
 failed:=false;begin perform public.rs_save_purchase_ksef_form(p.id,p.revision-1,link.ksef_number,x,array[2],array[2],p.payload);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale project overwritten';end if;
 failed:=false;begin perform public.rs_save_purchase_ksef_form(p.id,p.revision,link.ksef_number,x,array[2],array[1],p.payload);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale Bill selection overwritten';end if;
 -- Explicit investor markup remains possible while the invoice amount is exact.
 select jsonb_agg(i) into selected_items from jsonb_array_elements(preview->'items') i where (i->>'index')::integer=3;
 data:=jsonb_set(p.payload,'{purchases,0}',(p.payload#>'{purchases,0}')||jsonb_build_object('amount',105,'charge',110,'paidAmount',30,'invoiceItems',selected_items,'selectedKsefRows','[3]'::jsonb));
 p:=public.rs_save_purchase_ksef_form(p.id,p.revision,link.ksef_number,x,array[3],array[2],data);
 if (p.payload#>>'{purchases,0,amount}')::numeric<>105 or (p.payload#>>'{purchases,0,charge}')::numeric<>110 or (p.payload#>>'{purchases,0,paidAmount}')::numeric<>30 then raise exception 'Investor cost or payment lost';end if;
end;$$;
rollback;
