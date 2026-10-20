begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; x text; preview jsonb; link public.rs_ksef_links; payload jsonb; failed boolean; special text;
begin
 p:=public.rs_create_project('{"name":"LINE SELECTION TEST","purchases":[]}'::jsonb,current_date);
 x:='<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>LINE TEST</P_2><P_15>282</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><NrWierszaFa>10</NrWierszaFa><P_7>Farba &amp; grunt</P_7><P_8B>2</P_8B><P_8A>szt.</P_8A><P_10>20</P_10><P_11>100</P_11><P_12>23</P_12></FaWiersz><FaWiersz><NrWierszaFa>20</NrWierszaFa><P_7>Prywatny zakup</P_7><P_11A>54</P_11A><P_12>8</P_12></FaWiersz><FaWiersz><NrWierszaFa>30</NrWierszaFa><P_7>Materiał drugi</P_7><P_11>100</P_11><P_11Vat>5</P_11Vat><P_12>5</P_12></FaWiersz></Fa></Faktura>';
 preview:=public.rs_ksef_purchase_preview(x);
 if preview->>'canSelect'<>'true' or (preview#>>'{items,0,gross}')::numeric<>123 or (preview#>>'{items,1,gross}')::numeric<>54 or preview#>>'{items,0,name}'<>'Farba & grunt' then raise exception 'Preview/rate/discount mismatch';end if;
 link:=public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b1',x,array[3,1]);
 select r.payload into payload from public.rs_projects r where r.id=p.id;
 if (payload#>>'{purchases,0,amount}')::numeric<>228 or (payload#>>'{purchases,0,charge}')::numeric<>228 or jsonb_array_length(payload#>'{purchases,0,invoiceItems}')<>2 or payload#>>'{purchases,0,description}' like '%Prywatny zakup%' or (link.document->>'grossAmount')::numeric<>282 or (link.document->>'importedAmount')::numeric<>228 then raise exception 'Selected import mismatch';end if;
 perform public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b1',x,array[1,3]);
 if (select jsonb_array_length(r.payload->'purchases') from public.rs_projects r where r.id=p.id)<>1 then raise exception 'Retry duplicated purchase';end if;
 failed:=false;begin perform public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b1',x,array[2]);exception when others then failed:=true;end;
 if not failed then raise exception 'Existing selection silently overwritten';end if;
 failed:=false;begin perform public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b2',x,array[]::integer[]);exception when others then failed:=true;end;
 if not failed then raise exception 'Empty selection accepted';end if;
 failed:=false;begin perform public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b2',x,array[1,1]);exception when others then failed:=true;end;
 if not failed then raise exception 'Duplicate selection accepted';end if;
 failed:=false;begin perform public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b2',x,array[99]);exception when others then failed:=true;end;
 if not failed then raise exception 'Unknown index accepted';end if;
 -- Summary difference larger than rounding: partial assignment must fail.
 special:=replace(x,'<P_15>282</P_15>','<P_15>200</P_15>');
 if public.rs_ksef_purchase_preview(special)->>'canSelect'<>'false' then raise exception 'Unreconciled summary accepted';end if;
 failed:=false;begin perform public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-b2',special,array[1]);exception when others then failed:=true;end;
 if not failed then raise exception 'Unreconciled partial import accepted';end if;
 -- A one-cent summary rounding difference is visible and fully reconciled.
 special:=replace(x,'<P_15>282</P_15>','<P_15>282.01</P_15>');preview:=public.rs_ksef_purchase_preview(special);
 if preview->>'canSelect'<>'true' or (select sum((i->>'gross')::numeric) from jsonb_array_elements(preview->'items') i)<>282.01 then raise exception 'Rounding mismatch';end if;
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;begin perform public.rs_ksef_purchase_preview(x);exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthenticated preview allowed';end if;
end;$$;
rollback;
