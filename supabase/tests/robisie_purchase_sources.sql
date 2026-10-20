begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; x text; link public.rs_ksef_links; data jsonb; preview jsonb; selected_items jsonb; row_id text; failed boolean; old_revision bigint;
begin
 p:=public.rs_create_project('{"name":"PURCHASE SOURCES TEST","purchases":[]}'::jsonb,current_date);
 x:='<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test sklep</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>LINE TEST</P_2><P_15>282</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><NrWierszaFa>10</NrWierszaFa><P_7>Farba &amp; grunt</P_7><P_8B>2</P_8B><P_8A>szt.</P_8A><P_10>20</P_10><P_11>100</P_11><P_12>23</P_12></FaWiersz><FaWiersz><NrWierszaFa>20</NrWierszaFa><P_7>Prywatny zakup</P_7><P_11A>54</P_11A><P_12>8</P_12></FaWiersz><FaWiersz><NrWierszaFa>30</NrWierszaFa><P_7>Materiał drugi</P_7><P_11>100</P_11><P_11Vat>5</P_11Vat><P_12>5</P_12></FaWiersz></Fa></Faktura>';
 link:=public.rs_assign_ksef_selected(p.id,'1111111111-20261020-abcdefabcdef-d1',x,array[1,2,3]);
 select * into p from public.rs_projects where id=p.id;row_id:=p.payload#>>'{purchases,0,id}';preview:=public.rs_ksef_purchase_preview(x);

 data:=jsonb_set(p.payload,'{purchases,0}',(p.payload#>'{purchases,0}')||jsonb_build_object('amount',228,'charge',300,'paid',true,'paidAmount',50,'invoicePayments','{"sales":100}'::jsonb,'receiptPayments','{"old":150}'::jsonb));
 data:=data||jsonb_build_object('receipts',jsonb_build_array(jsonb_build_object('id','old','date','2026-10-01','kind','materials','amount',150)),'invoiceSettlements',jsonb_build_array(jsonb_build_object('id','sales','number','SALES TEST','date','2026-10-20','total',500,'existingReceipts','[]'::jsonb,'allocations',jsonb_build_array(jsonb_build_object('key','purchase:'||row_id,'kind','purchase','id',row_id,'amount',100,'paid',100)))));
 p:=public.rs_save_purchase_ksef_settlement(p.id,p.revision,link.ksef_number,x,array[1,3],array[1,2,3],data);
 if (p.payload#>>'{purchases,0,amount}')::numeric<>228 or (p.payload#>>'{purchases,0,charge}')::numeric<>300 or (p.payload#>>'{purchases,0,invoicePayments,sales}')::numeric<>100 or (select document->'selectedIndices' from public.rs_ksef_links where ksef_number=link.ksef_number)<>'[1,3]'::jsonb then raise exception 'Sources/selection did not save atomically';end if;
 old_revision:=p.revision;
 data:=jsonb_set(p.payload,'{receipts}','[]'::jsonb);failed:=false;
 begin perform public.rs_save_project(p.id,data,p.revision);exception when others then failed:=true;end;
 if not failed or (select revision from public.rs_projects where id=p.id)<>old_revision then raise exception 'An older editor removed an allocated advance';end if;

 -- Bill must include allocations from earlier advances in its shrink guard.
 failed:=false;begin perform public.rs_edit_ksef_purchase(p.id,link.ksef_number,x,array[2],p.id,array[1,3]);exception when others then failed:=true;end;
 if not failed or (select revision from public.rs_projects where id=p.id)<>old_revision then raise exception 'Bill shrank a settled purchase';end if;
 -- Missing/inconsistent invoice ledger and overspent earlier advances reject everything.
 data:=jsonb_set(p.payload,'{purchases,0,invoicePayments,sales}','90');
 failed:=false;begin perform public.rs_save_purchase_ksef_settlement(p.id,p.revision,link.ksef_number,x,array[1,3],array[1,3],data);exception when others then failed:=true;end;
 if not failed then raise exception 'Inconsistent invoice payment accepted';end if;
 data:=jsonb_set(p.payload,'{receipts,0,amount}','149');
 failed:=false;begin perform public.rs_save_purchase_ksef_settlement(p.id,p.revision,link.ksef_number,x,array[1,3],array[1,3],data);exception when others then failed:=true;end;
 if not failed then raise exception 'Overspent advance accepted';end if;
 failed:=false;begin perform public.rs_save_purchase_ksef_settlement(p.id,p.revision,link.ksef_number,x,array[1,1],array[1,3],p.payload);exception when others then failed:=true;end;
 if not failed then raise exception 'Duplicate rows accepted';end if;
 failed:=false;begin perform public.rs_save_purchase_ksef_settlement(p.id,p.revision-1,link.ksef_number,x,array[1,3],array[1,3],p.payload);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale revision accepted';end if;
 -- One save can shrink items and release invoice money into a material advance.
 data:=jsonb_set(p.payload,'{purchases,0}',(p.payload#>'{purchases,0}')||jsonb_build_object('amount',54,'charge',54,'paid',false,'paidAmount',0,'invoicePayments','{}'::jsonb,'receiptPayments','{}'::jsonb));
 data:=jsonb_set(data,'{invoiceSettlements,0,allocations}',jsonb_build_array(jsonb_build_object('key','materials:advance','kind','materials','id','advance','amount',100,'paid',100)));
 p:=public.rs_save_purchase_ksef_settlement(p.id,p.revision,link.ksef_number,x,array[2],array[1,3],data);
 if (p.payload#>>'{purchases,0,amount}')::numeric<>54 or (p.payload#>>'{invoiceSettlements,0,allocations,0,paid}')::numeric<>100 then raise exception 'Combined shrink/reallocation failed';end if;
 if has_function_privilege('anon','public.rs_save_purchase_ksef_settlement(uuid,bigint,text,text,integer[],integer[],jsonb)','EXECUTE') then raise exception 'Anonymous execute exposed';end if;
end;$$;
rollback;
