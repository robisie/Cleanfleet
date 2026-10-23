create or replace function public.rs_ksef_store_xml(p_number text,p_xml text) returns void language plpgsql security invoker set search_path='' as $$
declare d public.rs_ksef_documents; v_preview jsonb; v_refs jsonb; info record; doc xml; hash_verified boolean; mismatches text[];
begin
 if auth.uid() is null or not public.cf_is_admin() then raise exception 'Dostęp tylko dla administratora.';end if;
 select * into d from public.rs_ksef_documents where owner_id=auth.uid() and ksef_number=p_number;
 if d.ksef_number is null then raise exception 'Najpierw pobierz metadane faktury.';end if;
 v_preview:=public.rs_ksef_purchase_preview(p_xml);doc:=xmlparse(document p_xml);
 select * into info from xmltable('/*[local-name()="Faktura"]' passing doc columns
  number text path '*[local-name()="Fa"]/*[local-name()="P_2"]',
  issued text path '*[local-name()="Fa"]/*[local-name()="P_1"]',
  kind text path '*[local-name()="Fa"]/*[local-name()="RodzajFaktury"]',
  nip text path '*[local-name()="Podmiot1"]/*[local-name()="DaneIdentyfikacyjne"]/*[local-name()="NIP"]');
 -- KSeF's SHA-256 identifies the original document even when its display metadata
 -- normalizes text differently. TextDecoder removes a UTF-8 BOM, so check both forms.
 hash_verified:=encode(sha256(convert_to(p_xml,'UTF8')),'base64')=d.metadata->>'invoiceHash'
  or encode(sha256(decode('efbbbf','hex')||convert_to(p_xml,'UTF8')),'base64')=d.metadata->>'invoiceHash';
 if btrim(info.nip) is distinct from left(p_number,10) then raise exception 'XML nie zgadza się z wystawcą dokumentu KSeF.';end if;
 if not coalesce(hash_verified,false) then
  -- Keep the semantic checks for legacy or decoded UTF-16 clients, whose original
  -- byte representation cannot be reproduced from this text parameter.
  mismatches:=array_remove(array[
   case when info.number is distinct from d.metadata->>'invoiceNumber' then 'numer faktury' end,
   case when info.issued is distinct from d.metadata->>'issueDate' then 'data wystawienia' end,
   case when (v_preview->>'gross')::numeric is distinct from (d.metadata->>'grossAmount')::numeric then 'kwota brutto' end,
   case when v_preview->>'currency' is distinct from d.metadata->>'currency' then 'waluta' end],null);
  if cardinality(mismatches)>0 then raise exception 'XML nie zgadza się z metadanymi KSeF (%): %.',d.metadata->>'invoiceNumber',array_to_string(mismatches,', ');end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('number',r.number,'issueDate',r.issued,'ksefNumber',nullif(r.ksef,''))),'[]') into v_refs
 from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="DaneFaKorygowanej"]' passing doc columns
  number text path '*[local-name()="NrFaKorygowanej"]',issued text path '*[local-name()="DataWystFaKorygowanej"]',ksef text path '*[local-name()="NrKSeFFaKorygowanej"]') r;
 -- Before/after corrections carry positive quantities on both sides; preserve their sign.
 v_preview:=jsonb_set(v_preview,'{items}',coalesce((select jsonb_agg(i||jsonb_build_object('before',exists(select 1 from xmltable('/*[local-name()="Faktura"]/*[local-name()="Fa"]/*[local-name()="FaWiersz"]' passing doc columns idx for ordinality,before text path '*[local-name()="StanPrzed"]') x where x.idx=(i->>'index')::integer and x.before='1')) order by (i->>'index')::integer) from jsonb_array_elements(v_preview->'items') i),'[]'));
 update public.rs_ksef_documents set preview=v_preview,refs=v_refs,metadata=jsonb_set(metadata,'{invoiceType}',to_jsonb(info.kind)) where owner_id=auth.uid() and ksef_number=p_number;
end;$$;

