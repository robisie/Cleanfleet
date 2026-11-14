// Pure warehouse presentation logic. Never mutate invoice, KSeF XML, receipt scans or stock rows.
export const UNIT_CHOICES=['szt.','kpl.','opak.','mb','m','cm','mm','m²','m³','kg','g','t','l','ml','para','rolka','karton','paleta','godz.','usł.'];
export const unitKey=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('pl').replace(/\s+/g,' ').replace(/[.\s_-]/g,'').replace(/²/g,'2').replace(/³/g,'3').slice(0,80);
const aliases={
 'szt.':['szt','szt.','sztuka','sztuki','sztuk'],
 'kpl.':['kpl','kpl.','komplet','komplety'],
 'opak.':['opak','opak.','opakowanie','opakowania','opakowan'],
 'mb':['mb','m.b.','metr bieżący','metry bieżące'],
 'm':['m','metr','metry'],
 'cm':['cm','centymetr','centymetry'],
 'mm':['mm','milimetr','milimetry'],
 'm²':['m2','m²','metr kwadratowy','metry kwadratowe'],
 'm³':['m3','m³','metr sześcienny','metry sześcienne'],
 'kg':['kg','kilogram','kilogramy'],
 'g':['g','gram','gramy'],
 't':['t','tona','tony'],
 'l':['l','litr','litry'],
 'ml':['ml','mililitr','mililitry'],
 'para':['para','pary'],
 'rolka':['rolka','rolki'],
 'karton':['karton','kartony'],
 'paleta':['paleta','palety'],
 'godz.':['godz','godz.','godzina','godziny'],
 'usł.':['usł','usł.','usługa','usługi']
};
const safe=new Map(Object.entries(aliases).flatMap(([canonical,variants])=>variants.map(v=>[unitKey(v),canonical])));
const suggestions=new Map(Object.entries({
 pce:'szt.',pcs:'szt.',piece:'szt.',pieces:'szt.',units:'szt.',unit:'szt.',
 st:'szt.',stl:'szt.',stuck:'szt.',stk:'szt.',opk:'opak.',pack:'opak.',set:'kpl.',sets:'kpl.'
}));
export const unitSuggestion=value=>suggestions.get(unitKey(value))||null;
export function unitDisplay(value,approved={}){
 const raw=String(value??'').trim()||'szt.';
 const key=unitKey(raw);
 return approved[key]||safe.get(key)||raw.toLocaleLowerCase('pl');
}
export function unitReview(rows,approved={}){
 const found=new Map();
 for(const row of rows){
  const raw=String(row.item?.unit??'').trim()||'szt.',key=unitKey(raw);
  if(!key||safe.has(key)||Object.hasOwn(approved,key))continue;
  const record=found.get(key)||{key,raw,count:0,example:'',suggested:unitSuggestion(raw)};
  record.count++;
  if(!record.example)record.example=String(row.item?.name||'').slice(0,120);
  found.set(key,record);
 }
 return [...found.values()].sort((a,b)=>b.count-a.count||a.raw.localeCompare(b.raw,'pl'));
}
export function unitAliasMap(records){return Object.fromEntries((records||[]).map(r=>[r.source_key,r.canonical_unit]));}
