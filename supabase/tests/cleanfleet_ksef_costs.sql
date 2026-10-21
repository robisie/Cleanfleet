begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare x text; n text:='1111111111-20261021-cfcfcfcfcfcf-aa'; c jsonb; p public.rs_projects; original uuid; failed boolean; rev bigint;
begin
 x:='<Faktura><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Test dostawca</Nazwa></DaneIdentyfikacyjne></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-21</P_1><P_2>CF TEST</P_2><P_15>177</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Chemia</P_7><P_8B>2</P_8B><P_11A>123</P_11A></FaWiersz><FaWiersz><P_7>Farba</P_7><P_11A>54</P_11A></FaWiersz></Fa></Faktura>';
 c:=public.cf_save_ksef_costs(n,x,'[{"index":1,"category":"Chemia"}]');
 if jsonb_array_length(c->'purchases')<>1 or (c#>>'{purchases,0,amount}')::numeric<>123 or (c#>>'{purchases,0,quantity}')::numeric<>2 or (c#>>'{purchases,0,unit_price}')::numeric<>61.50 then raise exception 'Incorrect imported costs';end if;
 original:=(c#>>'{purchases,0,id}')::uuid;rev:=(c#>>'{link,revision}')::bigint;
 c:=public.cf_save_ksef_costs(n,null,'[{"index":1,"category":"Sprzęt","note":"edited"},{"index":2,"category":"Pozostałe"}]',rev);
 if jsonb_array_length(c->'purchases')<>2 or (c#>>'{purchases,0,id}')::uuid<>original or c#>>'{purchases,0,category}'<>'Sprzęt' then raise exception 'Edit duplicated retained row';end if;
 failed:=false;begin perform public.cf_save_ksef_costs(n,null,'[]',rev);exception when others then failed:=true;end;
 if not failed then raise exception 'Stale edit accepted';end if;
 rev:=(c#>>'{link,revision}')::bigint;
 failed:=false;begin perform public.cf_save_ksef_costs(n,null,'[{"index":99,"category":"Pozostałe"}]',rev);exception when others then failed:=true;end;
 if not failed then raise exception 'Invalid line accepted';end if;
 c:=public.cf_save_ksef_costs(n,null,'[{"index":1,"category":"Chemia"}]',rev);
 if jsonb_array_length(c->'purchases')<>1 then raise exception 'Deselection did not remove cost';end if;
 p:=public.rs_create_project(jsonb_build_object('name','CF CROSS APP TEST','purchases','[]'::jsonb,'receipts','[]'::jsonb,'invoiceSettlements','[]'::jsonb),current_date);
 perform public.rs_assign_ksef_selected(p.id,n,x,array[2],null);
 set constraints all immediate;
 c:=public.cf_ksef_cost_context(n);
 if c->'blocked'<>'[2]'::jsonb then raise exception 'Missing other app position marker';end if;
 -- CF cannot take a Robisię position. Failure must leave original purchase intact.
 failed:=false;begin perform public.cf_save_ksef_costs(n,null,'[{"index":2,"category":"Chemia"}]',(c#>>'{link,revision}')::bigint);exception when others then failed:=true;end;
 if not failed then raise exception 'Cross-app duplicate accepted';end if;
 if (select count(*) from public.cf_purchases where source_ksef_number=n)<>1 or not exists(select 1 from public.cf_purchases where id=original) then raise exception 'Failed edit was not atomic';end if;
 -- Opposite direction uses the same check.
 failed:=false;begin update public.rs_ksef_links set document=jsonb_set(document,'{selectedIndices}','[1,2]') where ksef_number=n;exception when others then failed:=true;end;
 if not failed then raise exception 'Robisie overlap accepted';end if;
 c:=public.cf_ksef_cost_context(n);perform public.cf_save_ksef_costs(n,null,'[]',(c#>>'{link,revision}')::bigint);
 if exists(select 1 from public.cf_purchases where source_ksef_number=n) then raise exception 'Remove all failed';end if;
 -- Saved canonical positions remain available after removing every cost.
 c:=public.cf_ksef_cost_context(n);if jsonb_array_length(c#>'{link,preview,items}')<>2 then raise exception 'Lost invoice snapshot';end if;
end;$$;
reset role;
set local role anon;
do $$begin
 if has_function_privilege('anon','public.cf_save_ksef_costs(text,text,jsonb,bigint)','EXECUTE') or has_table_privilege('anon','public.cf_ksef_costs','SELECT') then raise exception 'Anonymous access';end if;
end;$$;
rollback;
