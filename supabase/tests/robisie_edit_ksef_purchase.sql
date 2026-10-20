begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; q public.rs_projects; x text; link public.rs_ksef_links; purchase_id text; data jsonb; failed boolean;
begin
 p:=public.rs_create_project('{"name":"EDIT KSEF TEST","purchases":[]}'::jsonb,current_date);
 q:=public.rs_create_project('{"name":"MOVE KSEF TEST","purchases":[]}'::jsonb,current_date);
 x:='<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>LINE TEST</P_2><P_15>282</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><NrWierszaFa>10</NrWierszaFa><P_7>Farba &amp; grunt</P_7><P_8B>2</P_8B><P_8A>szt.</P_8A><P_10>20</P_10><P_11>100</P_11><P_12>23</P_12></FaWiersz><FaWiersz><NrWierszaFa>20</NrWierszaFa><P_7>Prywatny zakup</P_7><P_11A>54</P_11A><P_12>8</P_12></FaWiersz><FaWiersz><NrWierszaFa>30</NrWierszaFa><P_7>Materiał drugi</P_7><P_11>100</P_11><P_11Vat>5</P_11Vat><P_12>5</P_12></FaWiersz></Fa></Faktura>';
 link:=public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-c1',x,array[1,3]);
 select payload into data from public.rs_projects where id=p.id;purchase_id:=data#>>'{purchases,0,id}';
 link:=public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[2],p.id,array[1,3]);
 select payload into data from public.rs_projects where id=p.id;
 if jsonb_array_length(data->'purchases')<>1 or data#>>'{purchases,0,id}'<>purchase_id or (data#>>'{purchases,0,amount}')::numeric<>54 or data#>>'{purchases,0,description}' not like '%Prywatny zakup%' then raise exception 'Edit duplicated/missed selection';end if;
 update public.rs_projects set payload=jsonb_set(jsonb_set(payload,'{purchases,0,paid}','true'),'{purchases,0,paidAmount}','20') where id=p.id;
 update public.rs_projects set payload=jsonb_set(payload,'{purchases,0,invoicePayments}','{"invoice-test":10}') where id=p.id;
 link:=public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[1],p.id,array[2]);
 select payload into data from public.rs_projects where id=p.id;
 if data#>>'{purchases,0,paid}'<>'true' or (data#>>'{purchases,0,paidAmount}')::numeric<>20 or (data#>>'{purchases,0,charge}')::numeric<>123 or (data#>>'{purchases,0,invoicePayments,invoice-test}')::numeric<>10 then raise exception 'Edit lost manual payment';end if;
 update public.rs_projects set payload=jsonb_set(payload,'{purchases,0,paidAmount}','100') where id=p.id;
 failed:=false;begin perform public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[2],p.id,array[1]);exception when others then failed:=true;end;
 if not failed or (select document->'selectedIndices' from public.rs_ksef_links where ksef_number=link.ksef_number)<>'[1]'::jsonb then raise exception 'Paid shrink not atomic';end if;
 failed:=false;begin perform public.rs_edit_ksef_purchase(q.id,link.ksef_number,x,array[1],p.id,array[1]);exception when others then failed:=true;end;
 if not failed then raise exception 'Paid purchase moved';end if;
 update public.rs_projects set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{purchases,0,paid}','false'),'{purchases,0,paidAmount}','0'),'{purchases,0,invoicePayments}','{}') where id=p.id;
 update public.rs_projects set payload=payload||jsonb_build_object('invoiceSettlements',jsonb_build_array(jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('kind','purchase','id',purchase_id,'amount',50))))) where id=p.id;
 failed:=false;begin perform public.rs_edit_ksef_purchase(q.id,link.ksef_number,x,array[1],p.id,array[1]);exception when others then failed:=true;end;
 if not failed then raise exception 'Purchase with invoice allocation moved';end if;
 update public.rs_projects set payload=payload-'invoiceSettlements' where id=p.id;
 link:=public.rs_edit_ksef_purchase(q.id,link.ksef_number,x,array[3],p.id,array[1]);
 if (select jsonb_array_length(payload->'purchases') from public.rs_projects where id=p.id)<>0 or (select payload#>>'{purchases,0,id}' from public.rs_projects where id=q.id)<>purchase_id or (link.document#>>'{payload,source,id}')<>q.id::text or (link.document->>'importedAmount')::numeric<>105 then raise exception 'Move mismatch';end if;
 failed:=false;begin perform public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[2],p.id,array[1]);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale assignment overwrote current state';end if;
 -- Whole-invoice imports made before line selection are editable too.
 link:=public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-c2','purchases',x);
 link:=public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[2],p.id,null);
 if link.document->'selectedIndices'<>'[2]'::jsonb then raise exception 'Legacy whole-invoice edit failed';end if;
end;$$;
rollback;
