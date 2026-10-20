begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.user_roles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare p public.rs_projects; q public.rs_projects; link public.rs_ksef_links; duplicate public.rs_ksef_links; x text; payload jsonb; failed boolean;
begin
 p:=public.rs_create_project('{"name":"KSEF TEST","purchases":[]}'::jsonb,current_date);
 q:=public.rs_create_project('{"name":"KSEF OTHER TEST","purchases":[]}'::jsonb,current_date);
 x:='<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"><Podmiot1><DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Sklep &amp; Materiały</Nazwa></DaneIdentyfikacyjne><Adres><AdresL1>Adres testowy</AdresL1></Adres></Podmiot1><Podmiot2><DaneIdentyfikacyjne><NIP>6351861297</NIP><Nazwa>Spółka</Nazwa></DaneIdentyfikacyjne></Podmiot2><Fa><KodWaluty>PLN</KodWaluty><P_1>2026-10-20</P_1><P_2>TEST/FV/1</P_2><P_15>123.45</P_15><RodzajFaktury>VAT</RodzajFaktury><FaWiersz><P_7>Farba</P_7><P_8A>l</P_8A><P_8B>5</P_8B><P_11>100.36585</P_11><P_12>23</P_12></FaWiersz><Platnosc><TerminPlatnosci><Termin>2026-11-01</Termin></TerminPlatnosci></Platnosc></Fa></Faktura>';
 link:=public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-ab','purchases',x);
 select r.payload into payload from public.rs_projects r where id=p.id;
 if jsonb_array_length(payload->'purchases')<>1 or payload#>>'{purchases,0,shop}'<>'Sklep & Materiały' or (payload#>>'{purchases,0,amount}')::numeric<>123.45 or payload#>>'{purchases,0,paid}'<>'false' or payload#>>'{purchases,0,description}'<>'Farba 5 l' then raise exception 'Purchase import mismatch';end if;
 duplicate:=public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-ab','purchases',x);
 if duplicate.document->>'id'<>link.document->>'id' or (select jsonb_array_length(r.payload->'purchases') from public.rs_projects r where id=p.id)<>1 then raise exception 'Duplicate imported';end if;
 failed:=false;begin perform public.rs_assign_ksef(q.id,'1111111111-20261020-abcdefabcdef-ab','purchases',x);exception when others then failed:=true;end;
 if not failed then raise exception 'Cross-investment duplicate allowed';end if;
 link:=public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-ac','purchases',replace(x,'<KodWaluty>PLN','<KodWaluty>EUR'));
 if link.document->>'referenceOnly'<>'true' or (select jsonb_array_length(r.payload->'purchases') from public.rs_projects r where id=p.id)<>1 then raise exception 'Foreign currency changed PLN ledger';end if;
 link:=public.rs_assign_ksef(p.id,'6351861297-20261020-abcdefabcdef-ad','sales',replace(replace(x,'1111111111','6351861297'),'<P_2>TEST/FV/1','<P_2>TEST/SALE/1'));
 if link.document#>>'{payload,lines,0,price}'<>'123.45' or link.document->>'originKind'<>'sales' then raise exception 'External sales mismatch';end if;
 failed:=false;begin perform public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-ae','sales',x);exception when others then failed:=true;end;
 if not failed then raise exception 'Wrong seller accepted';end if;
 failed:=false;begin perform public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-af','purchases','<!DOCTYPE foo>'||x);exception when others then failed:=true;end;
 if not failed then raise exception 'DOCTYPE accepted';end if;
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;begin perform public.rs_assign_ksef(p.id,'1111111111-20261020-abcdefabcdef-af','purchases',x);exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthenticated import allowed';end if;
end;$$;
rollback;
