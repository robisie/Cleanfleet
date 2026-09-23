(function(root){'use strict';
const E=root.CFReportEngine,C=E.catalog;
const esc=v=>E.text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=v=>v==null||v===''?'—':v===true?'Tak':v===false?'Nie':E.text(v);
const fmt=v=>v==null?'—':Number(v).toLocaleString('pl-PL',{maximumFractionDigits:2});
let bridge,host,data={},result=null,owner=null,loading=false,serial=0,viewRows=null,page=0,sortField='',sortDir=1,detailStack=[];
let cfg={source:'wash_records',title:'Raport CleanFleet',dateField:'wash_date',from:'',to:'',filters:[],groups:[],columns:['company_name','plate','type','wash_date','performed_by','cost','approved','paid','invoice_invoice_number'],metricIds:['count','completed','vehicles','sum','avg'],chart:'bar',chartMetric:'count'};
const initialConfig=JSON.parse(JSON.stringify(cfg));
const $=s=>host.querySelector(s),$$=s=>[...host.querySelectorAll(s)];
const isLocked=s=>/^cf_earning/.test(s)&&!bridge.canEarnings();
const staffSources=new Set(['wash_records','vehicles','companies','invoices','invoice_items','wash_change_requests','wash_record_photos','cf_messages']);
const canReports=()=>bridge?.canReports?.()===true||bridge?.isAdmin?.()===true;
const companyScope=()=>{const ids=bridge?.allowedCompanyIds?.();return Array.isArray(ids)?[...new Set(ids.map(String).filter(Boolean))]:null;};
const sourceAllowed=source=>bridge?.isAdmin?.()===true||staffSources.has(source);
function guard(){if(!canReports())throw Error('Brak uprawnień do raportów.');if(!sourceAllowed(cfg.source))throw Error('To źródło danych jest niedostępne dla tego konta.');if(isLocked(cfg.source))throw Error('Najpierw odblokuj moduł Moje zarobki kodem PIN.');}
function reset(){serial++;loading=false;cfg=JSON.parse(JSON.stringify(initialConfig));data={};result=null;owner=null;viewRows=null;detailStack=[];document.getElementById('cfVehicleReportPreview')?.remove();if(host)host.remove();host=null;}
async function identity(){const {data:{session},error}=await bridge.db.auth.getSession();if(error||!session)throw Error('Sesja wygasła. Zaloguj się ponownie.');return session.user.id;}
async function all(table,where={},admin=true){if(!C[table])throw Error('Niedozwolone źródło danych.');if(admin)guard();const scope=companyScope();if(scope&&scope.length===0)return[];const rows=[],seen=new Set();let expected=null;for(let offset=0;;offset+=500){let q=bridge.db.from(table).select(Object.keys(C[table].fields).join(','),{count:'exact'});if(scope){if(table==='companies')q=q.in('id',scope);else if(C[table].fields.company_id)q=q.in('company_id',scope);}for(const col of C[table].order)q=q.order(col,{ascending:true});for(const [k,v]of Object.entries(where))q=q.eq(k,v);const {data:part,error,count}=await q.range(offset,offset+499);if(error)throw error;if(expected===null)expected=count;if(count!==expected)throw Error('Dane zmieniły się podczas pobierania. Wygeneruj raport ponownie.');for(const row of part||[]){const k=JSON.stringify(C[table].order.map(c=>row[c]));if(seen.has(k))throw Error('Dane zmieniły się podczas pobierania. Powtórz raport.');seen.add(k);rows.push(row);}if(!part||part.length<500)break;}if(expected!=null&&rows.length!==expected)throw Error('Nie udało się pobrać kompletnych danych.');return rows;}
async function load(source){guard();const id=await identity();if(owner&&owner!==id)reset();owner=id;const names=new Set([source]);if(C[source].fields.company_id)names.add('companies');if(source==='vehicles')names.add('wash_records');if(source==='wash_records')for(const t of ['vehicles','invoices','invoice_items'])names.add(t);if(['invoice_items','wash_change_requests','wash_record_photos'].includes(source)){names.add('wash_records');names.add('vehicles');names.add('companies');if(source==='invoice_items')names.add('invoices');}const pairs=await Promise.all([...names].map(async t=>[t,await all(t)]));guard();if(await identity()!==id)throw Error('Użytkownik zmienił się podczas pobierania. Otwórz raport ponownie.');const out=Object.fromEntries(pairs);if(!bridge.isAdmin?.()){const washIds=new Set((out.wash_records||[]).map(r=>String(r.id))),invoiceIds=new Set((out.invoices||[]).map(r=>String(r.id)));if(out.invoice_items)out.invoice_items=out.invoice_items.filter(r=>washIds.has(String(r.wash_record_id))||invoiceIds.has(String(r.invoice_id)));if(out.wash_change_requests)out.wash_change_requests=out.wash_change_requests.filter(r=>washIds.has(String(r.wash_record_id)));if(out.wash_record_photos)out.wash_record_photos=out.wash_record_photos.filter(r=>washIds.has(String(r.wash_record_id)));}return out;}
function options(items,value,empty){return(empty?'<option value="">'+esc(empty)+'</option>':'')+items.map(([v,l])=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(l)+'</option>').join('');}
function fieldOptions(value,predicate=()=>true){return options(Object.entries(E.fields(cfg.source)).filter(([,d])=>predicate(d)).map(([k,d])=>[k,d.label]),value,'—');}
function metricText(m){return fmt(m.value)+(m.money&&m.value!=null?' zł':'');}
function label(caption,body){return '<label><span>'+caption+'</span>'+body+'</label>';}
function mount(){host=document.createElement('section');host.id='cfReports';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label','Raporty CleanFleet');document.body.append(host);}
function templatesKey(){return'cf-report-templates-v1:'+owner;}
function templates(){try{return JSON.parse(localStorage.getItem(templatesKey())||'[]');}catch{return[];}}
function orderedFields(fields){return Object.entries(fields).sort(([a],[b])=>{const ai=cfg.columns.indexOf(a),bi=cfg.columns.indexOf(b);if(ai>=0&&bi>=0)return ai-bi;if(ai>=0)return-1;if(bi>=0)return 1;return 0;});}
function render(){if(!host)mount();const f=E.fields(cfg.source),ms=E.metrics(cfg.source,cfg),sources=Object.entries(C).filter(([k])=>sourceAllowed(k));host.innerHTML='<div class="r-wrap"><header><div><p class="r-muted">CLEANFLEET · '+esc(bridge.roleLabel?.()||'RAPORTY')+'</p><h1>Raporty</h1></div><button data-action="close" aria-label="Zamknij raporty">Zamknij ×</button></header><div id="rNotice" role="status"></div><div id="rConfig"><section class="r-box"><div class="r-barline"><h2>1. Co chcę policzyć?</h2><div class="r-flex"><select id="rTemplate" aria-label="Szablon">'+options(templates().map((t,i)=>[String(i),t.name]),'','Wybierz szablon')+'</select><button data-action="save-template">Zapisz szablon</button><button data-action="delete-template">Usuń szablon</button></div></div><p class="r-muted">Szablony są zapisywane dla Twojego konta w tej przeglądarce.</p><div class="r-grid">'+label('Źródło danych','<select id="rSource">'+options(sources.map(([k,v])=>[k,v.label]),cfg.source)+'</select>')+label('Tytuł raportu','<input id="rTitle" value="'+esc(cfg.title)+'">')+label('Pole do sumy / średniej','<select id="rAmount">'+fieldOptions(cfg.amountField||C[cfg.source].money,d=>d.type==='number')+'</select>')+label('Dodatkowo policz unikalne wartości','<select id="rDistinct">'+fieldOptions(cfg.distinctField)+'</select>')+'</div><div class="r-columns" id="rMetrics">'+ms.map(m=>'<label><input type="checkbox" value="'+m.id+'" '+(cfg.metricIds.includes(m.id)?'checked':'')+'>'+esc(m.label)+'</label>').join('')+'</div></section><section class="r-box"><h2>2. Jakie dane uwzględnić?</h2><div class="r-grid">'+label('Data według pola','<select id="rDate">'+fieldOptions(cfg.dateField,d=>['date','datetime'].includes(d.type))+'</select>')+label('Od','<input type="date" id="rFrom" value="'+esc(cfg.from)+'">')+label('Do (włącznie)','<input type="date" id="rTo" value="'+esc(cfg.to)+'">')+'<div class="r-flex"><button data-action="month">Ten miesiąc</button><button data-action="all-dates">Cały okres</button></div></div><p class="r-muted">Filtry łączą się jako ORAZ. Wartości zaznaczone w jednym filtrze łączą się jako LUB. Puste daty oznaczają cały okres. Daty godzinowe: strefa Europe/Warsaw.</p><div id="rFilters"></div><button data-action="add-filter">Dodaj filtr</button></section><section class="r-box"><h2>3. Jak pogrupować / porównać wyniki?</h2><div id="rGroups"></div><button data-action="add-group">Dodaj grupowanie</button></section><section class="r-box"><h2>4. Jak pokazać wynik?</h2><div class="r-grid">'+label('Wykres','<select id="rChart">'+options([['bar','Słupkowy'],['line','Liniowy'],['share','Udziałowy'],['none','Bez wykresu']],cfg.chart)+'</select>')+label('Metryka wykresu','<select id="rChartMetric">'+options(ms.map(m=>[m.id,m.label]),cfg.chartMetric)+'</select>')+'</div><div class="r-column-picker"><div class="r-barline"><div><h3>Dane widoczne w tabeli i PDF</h3><p class="r-muted">Zaznacz tylko informacje, które mają znaleźć się w gotowym raporcie.</p></div><div class="r-flex"><span class="r-column-count">Wybrano: '+cfg.columns.length+'</span><button data-action="columns-example">Przykład: tablica + pranie</button><button data-action="columns-none">Wyczyść</button><button data-action="columns-all">Wszystkie</button></div></div><div class="r-columns" id="rColumns">'+orderedFields(f).map(([k,d])=>'<label><input type="checkbox" value="'+k+'" '+(cfg.columns.includes(k)?'checked':'')+'>'+esc(d.label)+'</label>').join('')+'</div></div><div class="r-flex r-actions"><button class="primary" data-action="generate">Generuj / odśwież raport</button></div></section></div><div id="rResults"></div><div id="rDetails" hidden></div></div>';
 renderFilters();renderGroups();bind();if(result)renderResult();}
function readConfig(){cfg.title=$('#rTitle').value.trim()||'Raport CleanFleet';cfg.dateField=$('#rDate').value;cfg.from=$('#rFrom').value;cfg.to=$('#rTo').value;cfg.amountField=$('#rAmount').value;cfg.distinctField=$('#rDistinct').value;cfg.chart=$('#rChart').value;cfg.chartMetric=$('#rChartMetric').value;cfg.columns=$$('#rColumns input:checked').map(x=>x.value);cfg.metricIds=$$('#rMetrics input:checked').map(x=>x.value);}
function renderFilters(){const defs=E.fields(cfg.source);$('#rFilters').innerHTML=cfg.filters.map((f,i)=>'<div class="r-filter" data-filter="'+i+'"><select aria-label="Pole filtra" data-part="field">'+fieldOptions(f.field)+'</select><select aria-label="Warunek" data-part="op">'+options([['in','Jeden lub wiele'],['contains','Zawiera tekst'],['range','Od / do'],['empty','Brak danych'],['notempty','Dane uzupełnione']],f.op)+'</select><div class="r-input"></div><button data-remove="'+i+'" aria-label="Usuń filtr">×</button></div>').join('');$$('[data-filter]').forEach(row=>{const i=Number(row.dataset.filter),f=cfg.filters[i],area=row.querySelector('.r-input'),d=defs[f.field];if(!d)return;
 if(f.op==='in'){const vals=[...new Map(E.enrich(cfg.source,data).map(r=>[JSON.stringify(r[f.field]??null),r[f.field]??null])).values()].sort((a,b)=>display(a).localeCompare(display(b),'pl',{numeric:true}));area.innerHTML='<input type="search" placeholder="Znajdź wartość…" aria-label="Wyszukaj wartość filtra"><div class="r-values">'+vals.map((v,j)=>'<label><input type="checkbox" data-value="'+j+'" '+((f.values||[]).some(x=>JSON.stringify(x)===JSON.stringify(v))?'checked':'')+'>'+esc(display(v))+'</label>').join('')+'</div>';area.querySelector('input[type=search]').oninput=e=>area.querySelectorAll('.r-values label').forEach(l=>l.hidden=!l.textContent.toLocaleLowerCase('pl').includes(e.target.value.toLocaleLowerCase('pl')));area.querySelectorAll('[data-value]').forEach(b=>b.onchange=()=>{f.values=[...area.querySelectorAll('[data-value]:checked')].map(x=>vals[Number(x.dataset.value)]);dirty();});}
 else if(f.op==='range'){const type=['date','datetime'].includes(d.type)?'date':d.type==='number'?'number':'text';area.innerHTML='<div class="r-flex"><input aria-label="Minimum" data-bound="min" type="'+type+'" step="any" value="'+esc(f.min??'')+'"><input aria-label="Maksimum" data-bound="max" type="'+type+'" step="any" value="'+esc(f.max??'')+'"></div>';area.querySelectorAll('input').forEach(b=>b.onchange=()=>{f[b.dataset.bound]=b.value;dirty();});}
 else if(f.op==='contains'){area.innerHTML='<input aria-label="Szukany tekst" value="'+esc(f.value||'')+'">';area.firstChild.oninput=e=>{f.value=e.target.value;dirty();};}
 row.querySelector('[data-part=field]').onchange=e=>{cfg.filters[i]={field:e.target.value,op:'in',values:[]};renderFilters();dirty();};row.querySelector('[data-part=op]').onchange=e=>{f.op=e.target.value;renderFilters();dirty();};row.querySelector('[data-remove]').onclick=()=>{cfg.filters.splice(i,1);renderFilters();dirty();};});}
function renderGroups(){$('#rGroups').innerHTML=cfg.groups.map((g,i)=>'<div class="r-flex r-actions"><select aria-label="Grupowanie '+(i+1)+'" data-group-field="'+i+'">'+fieldOptions(g.field)+'</select><select aria-label="Przedział czasu" data-bucket="'+i+'">'+options([['day','Dzień'],['week','Tydzień od poniedziałku'],['month','Miesiąc'],['year','Rok']],g.bucket)+'</select><button data-remove-group="'+i+'" aria-label="Usuń grupowanie">×</button></div>').join('');$$('[data-group-field]').forEach(el=>el.onchange=()=>{cfg.groups[+el.dataset.groupField].field=el.value;dirty();});$$('[data-bucket]').forEach(el=>el.onchange=()=>{cfg.groups[+el.dataset.bucket].bucket=el.value;dirty();});$$('[data-remove-group]').forEach(el=>el.onclick=()=>{cfg.groups.splice(+el.dataset.removeGroup,1);renderGroups();dirty();});}
function notice(message,error=false){if(host)$('#rNotice').innerHTML=message?'<p class="'+(error?'r-error':'r-muted')+'">'+esc(message)+'</p>':'';}
function dirty(){if(result)notice('Konfiguracja została zmieniona. Kliknij „Generuj”, aby przeliczyć wynik i eksporty.');}
function busy(value){loading=value;if(!host)return;$$('#rConfig input,#rConfig select,#rConfig button,button[data-action=pdf],button[data-action=xlsx]').forEach(b=>b.disabled=value);}
async function generate(){if(loading)return;readConfig();try{guard();if((cfg.from||cfg.to)&&!cfg.dateField)throw Error('Wybierz pole daty albo usuń zakres dat.');if(!cfg.columns.length)throw Error('Wybierz przynajmniej jedną kolumnę tabeli.');if(!cfg.metricIds.length)throw Error('Wybierz przynajmniej jedną metrykę.');busy(true);notice('Pobieram komplet danych…');const token=++serial;const fresh=await load(cfg.source);if(token!==serial)return;data=fresh;result=E.report(data,cfg);result.loadedAt=new Date().toISOString();viewRows=null;page=0;sortField='';renderFilters();renderResult();notice('Wynik obliczony dla '+result.rows.length+' rekordów. Eksporty i szczegóły korzystają z tego samego zestawu danych.');$('#rResults').scrollIntoView({block:'start'});}catch(e){notice(e.message||String(e),true);}finally{busy(false);}}
function bind(){host.onclick=async ev=>{const b=ev.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;try{if(a==='close'){host.hidden=true;return;}if(a==='generate')return await generate();if(a==='add-filter'){readConfig();cfg.filters.push({field:Object.keys(E.fields(cfg.source))[0],op:'in',values:[]});renderFilters();dirty();}if(a==='add-group'){cfg.groups.push({field:E.fields(cfg.source).company_name?'company_name':Object.keys(E.fields(cfg.source))[0],bucket:'month'});renderGroups();dirty();}if(a==='month'){const d=E.day(new Date().toISOString(),'datetime');$('#rFrom').value=d.slice(0,7)+'-01';$('#rTo').value=new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7),0)).toISOString().slice(0,10);dirty();}if(a==='all-dates'){$('#rFrom').value='';$('#rTo').value='';dirty();}if(a==='columns-none'||a==='columns-all'||a==='columns-example'){const defs=E.fields(cfg.source);cfg.columns=a==='columns-none'?[]:a==='columns-all'?Object.keys(defs):['plate','wash_date','ordered_by','notes','completion_notes'].filter(k=>defs[k]);render();dirty();return;}if(a==='save-template'){readConfig();const name=prompt('Nazwa szablonu raportu:');if(!name?.trim())return;const list=templates(),i=list.findIndex(t=>t.name===name.trim());const t={name:name.trim(),cfg:JSON.parse(JSON.stringify(cfg))};if(i>=0)list[i]=t;else list.push(t);localStorage.setItem(templatesKey(),JSON.stringify(list));render();notice('Szablon zapisany.');}if(a==='delete-template'){const i=$('#rTemplate').value;if(i==='')return;const list=templates();list.splice(+i,1);localStorage.setItem(templatesKey(),JSON.stringify(list));render();}if(a==='pdf'||a==='xlsx'){guard();if(!result)throw Error('Najpierw wygeneruj raport.');if(isLocked(result.cfg.source))throw Error('Odblokuj zarobki kodem PIN.');busy(true);notice('Przygotowuję plik…');if(a==='pdf')await exportPDF(result);else exportXLSX(result);notice('Plik raportu jest gotowy.');}if(a==='back-report'){viewRows=null;page=0;renderResult();}if(a==='prev'){page=Math.max(0,page-1);renderRows();}if(a==='next'){page++;renderRows();}if(a==='back-detail'){backDetail();}}catch(e){notice(e.message||String(e),true);}finally{if(a==='pdf'||a==='xlsx')busy(false);}};
 $('#rSource').onchange=async ev=>{readConfig();cfg.source=ev.target.value;cfg.dateField=C[cfg.source].date;cfg.amountField=C[cfg.source].money;cfg.distinctField='';cfg.filters=[];cfg.groups=[];cfg.columns=Object.keys(E.fields(cfg.source)).filter(k=>!/_id$|^id$/.test(k)).slice(0,10);cfg.metricIds=['count','vehicles','sum','avg'];cfg.chartMetric='count';result=null;data={};render();try{busy(true);data=await load(cfg.source);renderFilters();notice('Dane do filtrów gotowe.');}catch(e){notice(e.message,true);}finally{busy(false);}};
 $('#rTemplate').onchange=async ev=>{const t=templates()[+ev.target.value];if(ev.target.value===''||!t)return;cfg=JSON.parse(JSON.stringify(t.cfg));result=null;data={};render();try{busy(true);data=await load(cfg.source);renderFilters();notice('Szablon wczytany. Możesz zmienić okres i wygenerować raport.');}catch(e){notice(e.message,true);}finally{busy(false);}};
 for(const id of ['#rAmount','#rDistinct'])$(id).onchange=()=>{readConfig();render();dirty();};$$('#rConfig input,#rConfig select').forEach(el=>el.addEventListener('change',dirty));$$('#rColumns input').forEach(el=>el.addEventListener('change',()=>{readConfig();const c=$('.r-column-count');if(c)c.textContent='Wybrano: '+cfg.columns.length;}));}
function selectedMetrics(r=result){return r.metrics.filter(m=>r.cfg.metricIds.includes(m.id));}
function renderResult(){if(!result)return;const ms=selectedMetrics();$('#rResults').innerHTML='<section class="r-box"><div class="r-barline"><div><h2>'+esc(result.cfg.title)+'</h2><p class="r-muted">'+esc(C[result.cfg.source].label)+' · stan: '+esc(new Date(result.loadedAt).toLocaleString('pl-PL'))+'</p></div><div class="r-flex"><button data-action="pdf">PDF</button><button data-action="xlsx">XLSX</button></div></div><p class="r-muted">'+esc(describe(result).join(' · '))+'</p><div class="r-cards">'+ms.map(m=>'<button class="r-card" data-metric="'+esc(m.id)+'"><span>'+esc(m.label)+'</span><strong>'+metricText(m)+'</strong><small>Sprawdź dane →</small></button>').join('')+'</div><p class="r-muted">Średnie pomijają brakujące kwoty. Unikalny pojazd = firma + rejestracja. Częstotliwość to liczba wykonanych prań na unikalny pojazd w wybranym zbiorze. Odstępy obejmują tylko kolejne prania tego samego pojazdu w tym zbiorze; kilka prań jednego dnia daje odstęp 0 dni.</p><div class="r-chart" id="rChartView">'+chartSVG(result)+'</div><div class="r-scroll"><table><thead><tr><th>Grupa</th>'+ms.map(m=>'<th>'+esc(m.label)+'</th>').join('')+'</tr></thead><tbody>'+result.groups.map((g,i)=>'<tr><td><button class="link" data-group="'+i+'">'+esc(g.label)+'</button></td>'+ms.map(m=>{const gm=g.metrics.find(x=>x.id===m.id);return'<td><button class="link" data-group="'+i+'" data-gmetric="'+m.id+'">'+metricText(gm)+'</button></td>';}).join('')+'</tr>').join('')+'</tbody></table></div></section><section class="r-box" id="rRows"></section>';
 $$('[data-metric]').forEach(b=>b.onclick=()=>drill(result.metrics.find(m=>m.id===b.dataset.metric),null));$$('[data-group]').forEach(b=>{const action=()=>{const g=result.groups[+b.dataset.group];const m=b.dataset.gmetric?g.metrics.find(x=>x.id===b.dataset.gmetric):{rows:g.rows,label:g.label};drill(m,g);};b.onclick=action;b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action();}};});renderRows();}
function drill(m,g){guard();const title=(g?g.label+' · ':'')+m.label;viewRows={rows:m.rows,title,metric:m};page=0;sortField='';renderRows();$('#rRows').scrollIntoView({block:'start'});}
function renderRows(){const pane=$('#rRows');if(!pane||!result)return;let rows=[...(viewRows?.rows||result.rows)],cols=result.cfg.columns,defs=result.fields;const m=viewRows?.metric;let kind='rows';if(m?.kind==='vehicles'){kind='vehicles';rows=E.distinctVehicles(rows);cols=['company_name','plate'];defs={company_name:{label:'Firma'},plate:{label:'Rejestracja'}};}else if(m?.kind==='distinct'){kind='distinct';const grouped=new Map();for(const r of rows){const k=E.text(r[m.field]);if(!grouped.has(k))grouped.set(k,{[m.field]:r[m.field],_count:0,rows:[]});grouped.get(k)._count++;grouped.get(k).rows.push(r);}rows=[...grouped.values()];cols=[m.field,'_count'];defs={...defs,_count:{label:'Liczba rekordów'}};}else if(m?.kind==='interval'){kind='pairs';rows=(m.pairs||[]).map(p=>({company_name:p.to.company_name,plate:p.to.plate,from_date:p.from.wash_date,to_date:p.to.wash_date,days:p.days,from_id:p.from.id,to_id:p.to.id}));cols=['company_name','plate','from_date','to_date','days','from_id','to_id'];defs=Object.fromEntries(['Firma','Rejestracja','Poprzednie pranie','Kolejne pranie','Odstęp (dni)','Poprzedni wpis','Kolejny wpis'].map((v,i)=>[cols[i],{label:v}]));}
 if(sortField)rows.sort((a,b)=>{const x=a[sortField],y=b[sortField];return sortDir*(typeof x==='number'&&typeof y==='number'?x-y:display(x).localeCompare(display(y),'pl',{numeric:true}));});const pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages-1);const shown=rows.slice(page*50,page*50+50);pane.innerHTML='<div class="r-barline"><h2>'+esc(viewRows?.title||'Dane źródłowe')+' <small>('+rows.length+')</small></h2>'+(viewRows?'<button data-action="back-report">← Wszystkie dane raportu</button>':'')+'</div>'+(m?.kind==='frequency'?'<p>'+m.rows.length+' wykonanych prań / '+E.distinctVehicles(m.rows).length+' pojazdów = '+fmt(m.value)+'</p>':'')+'<div class="r-scroll"><table><thead><tr><th>Szczegóły</th>'+cols.map(k=>'<th><button class="link" data-sort="'+esc(k)+'">'+esc(defs[k]?.label||k)+(sortField===k?(sortDir===1?' ↑':' ↓'):'')+'</button></th>').join('')+'</tr></thead><tbody>'+shown.map((r,i)=>'<tr><td><button class="link" data-row="'+i+'">Otwórz</button></td>'+cols.map(k=>'<td>'+esc(display(r[k]))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><div class="r-barline r-actions"><p class="r-muted">Strona '+(page+1)+' / '+pages+' · Eksport obejmuje wszystkie przefiltrowane rekordy raportu nadrzędnego.</p><div class="r-flex"><button data-action="prev" '+(page===0?'disabled':'')+'>←</button><button data-action="next" '+(page===pages-1?'disabled':'')+'>→</button></div></div>';
 pane.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sortDir=sortField===b.dataset.sort?-sortDir:1;sortField=b.dataset.sort;renderRows();});pane.querySelectorAll('[data-row]').forEach(b=>b.onclick=()=>{const r=shown[+b.dataset.row];if(kind==='distinct'){viewRows={rows:r.rows,title:display(r[m.field]),metric:{kind:'count'}};page=0;renderRows();}else if(kind==='vehicles')showEntity('vehicles',data.vehicles?.find(v=>v.plate===r.plate&&v.company_id===r.company_id)||r);else if(kind==='pairs')showEntity('wash_records',data.wash_records.find(w=>w.id===r.to_id));else showEntity(result.cfg.source,r);});}
function showEntity(source,row){guard();if(!row)return;const detail={source,row};detailStack.push(detail);paintDetail(detail);}
function paintDetail({source,row}){const el=$('#rDetails');$('#rConfig').hidden=true;$('#rResults').hidden=true;el.hidden=false;const defs=E.fields(source);let links=[];const washId=row.wash_record_id||row.source_wash_record_id;const wash=data.wash_records?.find(w=>w.id===washId);const companyId=row.company_id||row.wash_company_id||wash?.company_id;const plate=row.plate||row.vehicle_plate||row.wash_plate||wash?.plate;const vehicle=data.vehicles?.find(v=>v.plate===plate&&v.company_id===companyId);const company=data.companies?.find(c=>c.id===companyId);if(wash)links.push(['Wpis prania','wash_records',wash]);if(vehicle&&source!=='vehicles')links.push(['Karta pojazdu','vehicles',vehicle]);if(company&&source!=='companies')links.push(['Firma / klient','companies',company]);el.innerHTML='<section class="r-box r-detail"><button data-action="back-detail">← Powrót</button><h2>'+esc(source==='vehicles'?'Karta pojazdu · '+row.plate:C[source].label)+'</h2><dl>'+Object.entries(defs).filter(([k])=>row[k]!=null&&row[k]!=='').map(([k,d])=>'<div><dt>'+esc(d.label)+'</dt><dd>'+esc(display(row[k]))+'</dd></div>').join('')+'</dl><div class="r-flex">'+links.map(([l],i)=>'<button data-entity="'+i+'">'+l+'</button>').join('')+'</div></section>';el.querySelectorAll('[data-entity]').forEach(b=>b.onclick=()=>{const [,s,r]=links[+b.dataset.entity];showEntity(s,r);});if(source==='vehicles'&&data.wash_records){const washes=data.wash_records.filter(w=>w.plate===row.plate&&w.company_id===row.company_id).sort((a,b)=>String(b.wash_date||'').localeCompare(String(a.wash_date||'')));el.firstChild.insertAdjacentHTML('beforeend','<h3>Historia dostępna w pobranym zestawie ('+washes.length+')</h3>'+washes.map((w,i)=>'<p><button class="link" data-wash="'+i+'">'+esc(w.wash_date||'Oczekujące')+' · '+esc(w.performed_by||'—')+' · '+fmt(w.cost)+' zł</button></p>').join(''));el.querySelectorAll('[data-wash]').forEach(b=>b.onclick=()=>showEntity('wash_records',washes[+b.dataset.wash]));}el.scrollIntoView({block:'start'});}
function backDetail(){detailStack.pop();if(detailStack.length)paintDetail(detailStack.at(-1));else{$('#rDetails').hidden=true;$('#rConfig').hidden=false;$('#rResults').hidden=false;$('#rRows').scrollIntoView({block:'start'});}}
function describe(r){const c=r.cfg,f=r.fields;return ['Źródło: '+C[c.source].label,'Okres: '+(c.from||'bez początku')+' – '+(c.to||'bez końca')+(c.dateField?' ('+f[c.dateField].label+')':''),...(c.filters||[]).map(x=>(f[x.field]?.label||x.field)+': '+(x.op==='in'?(x.values||[]).map(display).join(' LUB ')||'nic nie wybrano':x.op==='range'?(x.min||'−∞')+' – '+(x.max||'+∞'):x.op==='empty'?'brak danych':x.op==='notempty'?'uzupełnione':x.value)), 'Grupowanie: '+(c.groups.map(g=>(f[g.field]?.label||g.field)+(['date','datetime'].includes(f[g.field]?.type)?' / '+({day:'dzień',week:'tydzień',month:'miesiąc',year:'rok'}[g.bucket]||'dzień'):'')).join(' → ')||'brak')];}
const palette=['#819b0b','#226e85','#c38627','#7562a2','#b45168','#447b4c','#516781'];
function chartSVG(r){if(r.cfg.chart==='none'||!r.groups.length)return'';const vals=r.groups.map(g=>g.metrics.find(m=>m.id===r.cfg.chartMetric)?.value??0),max=Math.max(1,...vals.map(Math.abs)),hasNegative=vals.some(v=>v<0),total=vals.reduce((s,v)=>s+v,0);const labels=r.groups.map(g=>g.label);if(r.cfg.chart==='share'&&(hasNegative||total<=0))return'<p class="r-muted">Wykres udziałowy wymaga dodatniej sumy i wartości nieujemnych.</p>';if(r.cfg.chart==='share'){let x=0;return'<svg font-family="Arial, sans-serif" xmlns="http://www.w3.org/2000/svg" width="900" height="'+(65+labels.length*30)+'" role="img" aria-label="Wykres udziałowy">'+vals.map((v,i)=>{const width=v/total*870,s='<rect x="'+(15+x)+'" y="8" width="'+width+'" height="35" fill="'+palette[i%palette.length]+'" data-group="'+i+'" tabindex="0"><title>'+esc(labels[i]+': '+fmt(v))+'</title></rect>';x+=width;return s;}).join('')+labels.map((l,i)=>'<g data-group="'+i+'" tabindex="0"><rect x="15" y="'+(60+i*30)+'" width="14" height="14" fill="'+palette[i%palette.length]+'"/><text x="38" y="'+(72+i*30)+'" font-size="13">'+esc(l)+' · '+fmt(vals[i])+' ('+fmt(vals[i]/total*100)+'%)</text></g>').join('')+'</svg>';}
 if(r.cfg.chart==='line'){const width=Math.max(900,vals.length*100),height=330;const point=(v,i)=>[65+i*(width-120)/Math.max(1,vals.length-1),hasNegative?145-v/max*110:250-v/max*220];return'<svg font-family="Arial, sans-serif" xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" role="img" aria-label="Wykres liniowy"><polyline fill="none" stroke="#819b0b" stroke-width="3" points="'+vals.map((v,i)=>point(v,i).join(',')).join(' ')+'"/>'+vals.map((v,i)=>{const [x,y]=point(v,i);return'<g data-group="'+i+'" tabindex="0"><circle cx="'+x+'" cy="'+y+'" r="8" fill="#587307"/><text x="'+x+'" y="'+(y-14)+'" font-size="12" text-anchor="middle">'+fmt(v)+'</text><text x="'+x+'" y="280" font-size="11" text-anchor="middle">'+esc(labels[i].slice(0,17))+'</text><title>'+esc(labels[i]+': '+fmt(v))+'</title></g>';}).join('')+'</svg>';}
 return'<svg font-family="Arial, sans-serif" xmlns="http://www.w3.org/2000/svg" width="900" height="'+Math.max(65,labels.length*43)+'" role="img" aria-label="Wykres słupkowy">'+vals.map((v,i)=>'<g data-group="'+i+'" tabindex="0"><text x="8" y="'+(i*43+24)+'" font-size="13">'+esc(labels[i].slice(0,28))+'</text><rect x="'+(hasNegative?(v<0?555-Math.abs(v)/max*240:555):245)+'" y="'+(i*43+5)+'" width="'+Math.abs(v)/max*(hasNegative?240:550)+'" height="27" fill="'+palette[i%palette.length]+'"/><text x="825" y="'+(i*43+24)+'" font-size="13">'+fmt(v)+'</text><title>'+esc(labels[i]+': '+fmt(v))+'</title></g>').join('')+'</svg>';}
function safeName(s){return s.replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,80)||'Raport_CleanFleet';}
function exportXLSX(r){if(!root.XLSX)throw Error('Biblioteka XLSX jest niedostępna. Odśwież aplikację.');const X=root.XLSX,wb=X.utils.book_new(),ms=selectedMetrics(r);function sheet(name,aoa){const ws=X.utils.aoa_to_sheet(aoa,{cellDates:true});if(aoa.length>1)ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:aoa.length-1,c:aoa[0].length-1}})};ws['!cols']=aoa[0].map(()=>({wch:24}));for(const addr of Object.keys(ws)){if(addr[0]==='!')continue;const cell=ws[addr];if(cell.t==='d')cell.z='yyyy-mm-dd hh:mm';}X.utils.book_append_sheet(wb,ws,name);}
 sheet('Opis',[['Raport',r.cfg.title],['Wygenerowano',new Date(r.loadedAt)],...describe(r).map(v=>['Warunek',v]),['Definicja częstotliwości','Wykonane prania / unikalne pojazdy w wybranym zbiorze'],['Definicja odstępu','Średnia z kolejnych dat prań, oddzielnie dla firmy i pojazdu, tylko w przefiltrowanym zbiorze'],['Brak kwoty','Pominięty w średniej; nie jest zamieniany na 0']]);sheet('Podsumowanie',[['Metryka','Wartość','Rekordy źródłowe'],...ms.map(m=>[m.label,m.value,m.rows.length])]);sheet('Grupy',[['Grupa',...ms.map(m=>m.label)],...r.groups.map(g=>[g.label,...ms.map(m=>g.metrics.find(x=>x.id===m.id).value)])]);const keys=Object.keys(r.fields);sheet('Dane pełne',[keys.map(k=>r.fields[k].label),...r.rows.map(row=>keys.map(k=>{const v=row[k];if(v==null)return null;if(['date','datetime'].includes(r.fields[k].type))return new Date(v);return typeof v==='object'?JSON.stringify(v):v;}))]);X.writeFile(wb,safeName(r.cfg.title)+'.xlsx',{compression:true});}
async function exportPDFLegacy(r,extra){if(!root.jspdf?.jsPDF||!root.CFReportFont)throw Error('Biblioteka PDF jest niedostępna. Odśwież aplikację.');const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.addFileToVFS('CleanFleet.ttf',root.CFReportFont);doc.addFont('CleanFleet.ttf','CleanFleet','normal');doc.setFont('CleanFleet');let y=18;const width=277;function line(txt,size=10){doc.setFontSize(size);const lines=doc.splitTextToSize(E.text(txt),width);for(const l of lines){if(y>191){doc.addPage();y=18;}doc.text(l,10,y);y+=size*.45+1.6;}}line('CLEANFLEET',11);line(r.cfg.title,19);line('Wygenerowano: '+new Date(r.loadedAt).toLocaleString('pl-PL'),9);describe(r).forEach(v=>line(v,9));if(extra)extra.forEach(v=>line(v,11));line('PODSUMOWANIE',12);selectedMetrics(r).forEach(m=>line(m.label+': '+metricText(m),10));
 const table=(heads,rows)=>{doc.autoTable({head:[heads],body:rows,startY:y,margin:{top:16,bottom:16,left:10,right:10},styles:{font:'CleanFleet',fontStyle:'normal',fontSize:8,overflow:'linebreak',cellPadding:2},headStyles:{fillColor:[80,104,22],fontStyle:'normal'},alternateRowStyles:{fillColor:[245,247,240]},rowPageBreak:'avoid',showHead:'everyPage'});y=doc.lastAutoTable.finalY+9;};
 if(r.cfg.chart!=='none'&&r.groups.length){line('WYKRES · '+(r.metrics.find(m=>m.id===r.cfg.chartMetric)?.label||''),12);for(let start=0;start<r.groups.length;start+=12){const part={...r,groups:r.groups.slice(start,start+12),cfg:{...r.cfg,chart:r.cfg.chart==='share'?'bar':r.cfg.chart}};if(r.cfg.chart==='share'&&start===0)line('Udział procentowy grup w całym wyniku; prezentacja słupkowa w PDF.',9);let svg=chartSVG(part);if(r.cfg.chart==='share'){const total=r.groups.reduce((s,g)=>s+(g.metrics.find(m=>m.id===r.cfg.chartMetric)?.value||0),0);if(total>0&&!r.groups.some(g=>(g.metrics.find(m=>m.id===r.cfg.chartMetric)?.value||0)<0)){part.groups=part.groups.map(g=>({...g,label:g.label+' ('+fmt((g.metrics.find(m=>m.id===r.cfg.chartMetric)?.value||0)/total*100)+'%)'}));svg=chartSVG(part);}else svg='';}if(svg.startsWith('<svg')){const canvas=await svgCanvas(svg);const h=Math.min(145,canvas.height/canvas.width*width);if(y+h>191){doc.addPage();y=18;}doc.addImage(canvas,'PNG',10,y,width,h);y+=h+8;canvas.width=canvas.height=0;}await new Promise(resolve=>setTimeout(resolve,0));}}
 line('Definicje: brak kwoty jest pomijany w średniej. Unikalny pojazd = firma + rejestracja. Prań na pojazd = wykonane prania / unikalne pojazdy w tym zbiorze. Odstęp = średnia z kolejnych dat prań tego samego pojazdu, wyłącznie w przefiltrowanym zbiorze.',8);line('GRUPOWANIE',12);const ms=selectedMetrics(r);for(let j=0;j<ms.length;j+=5){const chunk=ms.slice(j,j+5);table(['Grupa',...chunk.map(m=>m.label)],r.groups.map(g=>[g.label,...chunk.map(m=>metricText(g.metrics.find(x=>x.id===m.id)))]));}
 line('DANE ŹRÓDŁOWE — '+r.rows.length+' rekordów',12);const cols=r.cfg.columns;for(let i=0;i<cols.length;i+=6){const chunk=cols.slice(i,i+6);if(cols.length>6)line('Kolumny '+(i+1)+'–'+Math.min(i+6,cols.length)+'; numer wiersza łączy części tabeli.',9);table(['Lp.',...chunk.map(k=>r.fields[k]?.label||k)],r.rows.map((row,n)=>[n+1,...chunk.map(k=>display(row[k]))]));}
 const pages=doc.getNumberOfPages();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setFontSize(8);doc.text('CleanFleet · '+n+' / '+pages,10,202);}doc.save(safeName(r.cfg.title)+'.pdf');return doc;}
function svgCanvas(svg){return new Promise((resolve,reject)=>{const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=img.width*2;c.height=img.height*2;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Nie udało się przygotować wykresu PDF.'));};img.src=url;});}
function logoSrc(){return document.querySelector('.app-logo')?.src||'';}
function setupPDF(orientation='landscape'){
 if(!root.jspdf?.jsPDF||!root.CFReportFont)throw Error('Biblioteka PDF jest niedostępna. Odśwież aplikację.');
 const doc=new root.jspdf.jsPDF({orientation,unit:'mm',format:'a4'});doc.addFileToVFS('CleanFleet.ttf',root.CFReportFont);doc.addFont('CleanFleet.ttf','CleanFleet','normal');doc.setFont('CleanFleet');return doc;
}
function drawLogo(doc,x,y,w,h){const src=logoSrc();if(!src)return;try{const props=doc.getImageProperties(src),ratio=props.width/props.height;let rw=w,rh=w/ratio;if(rh>h){rh=h;rw=h*ratio;}doc.setFillColor(255,255,255);doc.roundedRect(x-2,y-2,rw+4,rh+4,2,2,'F');doc.addImage(src,'PNG',x,y,rw,rh,undefined,'FAST');}catch(_){} }
function pdfHeader(doc,title,subtitle,orientation='landscape'){
 const pw=doc.internal.pageSize.getWidth();doc.setFillColor(22,27,20);doc.rect(0,0,pw,31,'F');doc.setFillColor(164,189,16);doc.rect(0,31,pw,3,'F');drawLogo(doc,10,5,54,20);doc.setTextColor(255,255,255);doc.setFontSize(16);doc.text(title,pw-10,13,{align:'right'});doc.setTextColor(190,199,183);doc.setFontSize(8.5);doc.text(subtitle,pw-10,21,{align:'right'});doc.setTextColor(32,38,28);return 42;
}
function addFooters(doc,label='CleanFleet'){
 const pages=doc.getNumberOfPages(),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setDrawColor(222,228,216);doc.line(10,ph-11,pw-10,ph-11);doc.setTextColor(95,105,90);doc.setFontSize(7.5);doc.text(label,10,ph-6);doc.text(n+' / '+pages,pw-10,ph-6,{align:'right'});}doc.setTextColor(32,38,28);
}
function pdfCards(doc,cards,y,orientation='landscape'){
 const pw=doc.internal.pageSize.getWidth(),margin=10,gap=3,cols=orientation==='portrait'?2:Math.min(4,cards.length||1),cw=(pw-margin*2-gap*(cols-1))/cols,ch=21;cards.forEach((c,i)=>{const col=i%cols,row=Math.floor(i/cols),x=margin+col*(cw+gap),cy=y+row*(ch+gap);doc.setFillColor(244,247,237);doc.setDrawColor(222,231,211);doc.roundedRect(x,cy,cw,ch,2,2,'FD');doc.setTextColor(96,108,89);doc.setFontSize(7.3);doc.text(doc.splitTextToSize(c.label,cw-6).slice(0,2),x+3,cy+5);doc.setTextColor(48,64,13);doc.setFontSize(12);doc.text(E.text(c.value),x+3,cy+16);});doc.setTextColor(32,38,28);return y+Math.ceil(cards.length/cols)*(ch+gap);
}
async function addSvgToPDF(doc,svg,y,width,maxHeight){const canvas=await svgCanvas(svg),h=Math.min(maxHeight,canvas.height/canvas.width*width);doc.addImage(canvas,'PNG',10,y,width,h,undefined,'FAST');canvas.width=canvas.height=0;return y+h;}


function adminPdfHeader(doc,r,logo){
 const pw=doc.internal.pageSize.getWidth();
 doc.setFillColor(255,255,255);doc.rect(0,0,pw,36,'F');
 doc.setTextColor(21,24,22);doc.setFontSize(15.5);doc.text(E.text(r.cfg.title),10,13);
 doc.setTextColor(91,99,94);doc.setFontSize(8.2);
 doc.text(E.text(C[r.cfg.source].label)+' · stan: '+new Date(r.loadedAt).toLocaleString('pl-PL'),10,21);
 if(logo){
   try{
     const p=doc.getImageProperties(logo),ratio=p.width/p.height;let w=48,h=w/ratio;
     if(h>19){h=19;w=h*ratio;}
     doc.addImage(logo,'PNG',pw-10-w,7,w,h,undefined,'FAST');
   }catch(_){}
 }
 doc.setDrawColor(224,229,225);doc.line(10,31,pw-10,31);
 return 37;
}
function adminPdfFooter(doc,r){
 const pages=doc.getNumberOfPages(),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
 for(let n=1;n<=pages;n++){doc.setPage(n);doc.setDrawColor(220,226,229);doc.line(10,ph-10,pw-10,ph-10);doc.setTextColor(92,101,115);doc.setFontSize(6.8);doc.text('CleanFleet · '+E.text(r.cfg.title),10,ph-5.5);doc.text(n+' / '+pages,pw-10,ph-5.5,{align:'right'});}
 doc.setTextColor(32,38,28);
}
function adminPdfFilterLine(doc,r,y){
 const pw=doc.internal.pageSize.getWidth(),parts=describe(r);
 const line=parts.join(' · ');
 doc.setTextColor(84,92,87);doc.setFontSize(7.5);
 const lines=doc.splitTextToSize(line,pw-20);
 doc.text(lines,10,y);
 return y+lines.length*3.5+3;
}
function adminPdfKpis(doc,metrics,y){
 const pw=doc.internal.pageSize.getWidth(),gap=2.4,cards=metrics,cols=Math.min(6,Math.max(1,cards.length)),cw=(pw-20-gap*(cols-1))/cols,ch=25,rowGap=3;
 cards.forEach((m,i)=>{
   const col=i%cols,row=Math.floor(i/cols),x=10+col*(cw+gap),yy=y+row*(ch+rowGap);
   doc.setFillColor(255,255,255);doc.setDrawColor(210,217,211);doc.setLineWidth(.3);doc.roundedRect(x,yy,cw,ch,2.5,2.5,'FD');
   doc.setTextColor(52,58,54);doc.setFontSize(cols>=6?6.7:8);doc.text(doc.splitTextToSize(E.text(m.label),cw-8).slice(0,2),x+4,yy+7);
   doc.setTextColor(35,55,20);doc.setFontSize(cols>=6?11.5:13);doc.text(E.text(metricText(m)),x+4,yy+17);
 });
 const rows=Math.max(1,Math.ceil(cards.length/cols));
 return y+rows*ch+(rows-1)*rowGap+5;
}
function adminPdfExplain(doc,y){
 const pw=doc.internal.pageSize.getWidth();
 const t='Średnie pomijają brakujące kwoty. Unikalny pojazd = firma + rejestracja. Częstotliwość to liczba wykonanych prań na unikalny pojazd w wybranym zbiorze. Odstępy obejmują tylko kolejne prania tego samego pojazdu w tym zbiorze; kilka prań jednego dnia daje odstęp 0 dni.';
 doc.setTextColor(96,103,98);doc.setFontSize(6.9);const lines=doc.splitTextToSize(t,pw-20);doc.text(lines,10,y);return y+lines.length*3.2+4;
}
function adminPdfBarChart(doc,r,y){
 if(r.cfg.chart==='none'||!r.groups.length)return y;
 const pw=doc.internal.pageSize.getWidth(),metricId=r.cfg.chartMetric,items=r.groups.map(g=>({label:g.label,value:Number(g.metrics.find(m=>m.id===metricId)?.value||0)}));
 const max=Math.max(1,...items.map(x=>Math.abs(x.value))),hasNeg=items.some(x=>x.value<0);
 const rowH=9,h=Math.max(16,items.length*rowH+5),labelW=49,valueW=18,barX=10+labelW+3,barW=pw-20-labelW-valueW-8;
 doc.setFillColor(255,255,255);doc.setDrawColor(233,236,233);doc.roundedRect(10,y,pw-20,h,2.5,2.5,'FD');
 items.forEach((it,i)=>{
   const yy=y+7+i*rowH;
   doc.setTextColor(45,50,47);doc.setFontSize(7.2);doc.text(E.text(it.label).slice(0,34),13,yy);
   doc.setFillColor(239,242,240);doc.roundedRect(barX,yy-4.3,barW,5.2,2,2,'F');
   const valW=Math.max(1.5,barW*Math.abs(it.value)/max);
   const color=vrpColors[i%vrpColors.length].match(/\w\w/g).map(z=>parseInt(z,16));
   doc.setFillColor(...color);
   if(hasNeg&&it.value<0)doc.roundedRect(barX+barW-valW,yy-4.3,valW,5.2,2,2,'F');else doc.roundedRect(barX,yy-4.3,valW,5.2,2,2,'F');
   doc.setTextColor(26,31,28);doc.setFontSize(7.3);doc.text(fmt(it.value),pw-13,yy,{align:'right'});
 });
 return y+h+5;
}
function adminPdfGroupTable(doc,r,metrics,y,logo){
 const rows=r.groups.map(g=>[g.label,...metrics.map(m=>metricText(g.metrics.find(x=>x.id===m.id)))]);
 doc.autoTable({
   head:[['Grupa',...metrics.map(m=>m.label)]],body:rows,startY:y,
   margin:{top:38,bottom:15,left:10,right:10},
   styles:{font:'CleanFleet',fontStyle:'normal',fontSize:metrics.length>=6?6.3:7.1,cellPadding:metrics.length>=6?1.8:2.2,overflow:'linebreak',textColor:[35,39,36],lineColor:[225,230,226],lineWidth:.15},
   headStyles:{fillColor:[241,246,235],textColor:[31,38,27],fontStyle:'normal'},
   alternateRowStyles:{fillColor:[252,252,251]},rowPageBreak:'avoid',showHead:'everyPage',
   didDrawPage:()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)adminPdfHeader(doc,r,logo);}
 });
 return doc.lastAutoTable.finalY+6;
}
function adminPdfSourceTable(doc,r,y,logo){
 const cols=r.cfg.columns,pw=doc.internal.pageSize.getWidth();
 for(let i=0;i<cols.length;i+=10){
   const chunk=cols.slice(i,i+10);
   if(i||y>145){doc.addPage();y=adminPdfHeader(doc,r,logo);}
   doc.setTextColor(23,27,24);doc.setFontSize(11.5);doc.text('DANE ŹRÓDŁOWE ('+r.rows.length+')',10,y);y+=6;
   if(cols.length>10){doc.setTextColor(96,103,98);doc.setFontSize(6.8);doc.text('Kolumny '+(i+1)+'–'+Math.min(i+10,cols.length)+' · numer wiersza łączy części tabeli',10,y);y+=4;}
   doc.autoTable({
     head:[[...chunk.map(k=>r.fields[k]?.label||k)]],
     body:r.rows.map(row=>chunk.map(k=>display(row[k]))),
     startY:y,margin:{top:38,bottom:15,left:10,right:10},
     styles:{font:'CleanFleet',fontStyle:'normal',fontSize:6.4,cellPadding:2.1,overflow:'linebreak',valign:'top',textColor:[31,35,32],lineColor:[229,233,230],lineWidth:.12},
     headStyles:{fillColor:[241,246,235],textColor:[31,38,27],fontStyle:'normal'},
     alternateRowStyles:{fillColor:[252,252,251]},rowPageBreak:'avoid',showHead:'everyPage',
     didDrawPage:()=>{if(doc.internal.getCurrentPageInfo().pageNumber>1)adminPdfHeader(doc,r,logo);}
   });
   y=doc.lastAutoTable.finalY+6;
 }
 return y;
}
async function exportPDFVectorFallback(r){
 const doc=setupPDF('landscape'),logo=await lightLogoSrc();
 let y=adminPdfHeader(doc,r,logo);
 y=adminPdfFilterLine(doc,r,y);
 const ms=selectedMetrics(r);
 y=adminPdfKpis(doc,ms,y);
 y=adminPdfExplain(doc,y);
 y=adminPdfBarChart(doc,r,y);
 y=adminPdfGroupTable(doc,r,ms,y,logo);
 y=adminPdfSourceTable(doc,r,y+2,logo);
 adminPdfFooter(doc,r);
 doc.save(safeName(r.cfg.title)+'.pdf');
 return doc;
}

function reportPdfAllRowsHtml(r){
 let rows=[...(r.rows||[])],cols=[...(r.cfg.columns||[])],defs=r.fields||{};
 if(sortField){
   rows.sort((a,b)=>{
     const x=a[sortField],y=b[sortField];
     return sortDir*(typeof x==='number'&&typeof y==='number'
       ? x-y
       : display(x).localeCompare(display(y),'pl',{numeric:true}));
   });
 }
 const sortLabel=k=>esc(defs[k]?.label||k)+(sortField===k?(sortDir===1?' ↑':' ↓'):'');
 return '<div class="r-barline"><h2>Dane źródłowe <small>('+rows.length+')</small></h2></div>'+
   '<div class="r-scroll"><table><thead><tr>'+
   cols.map(k=>'<th>'+sortLabel(k)+'</th>').join('')+
   '</tr></thead><tbody>'+
   rows.map(row=>'<tr>'+
     cols.map(k=>'<td>'+esc(display(row[k]))+'</td>').join('')+'</tr>').join('')+
   '</tbody></table></div>';
}

function buildReportPdfStage(r){
 const source=$('#rResults');
 if(!source)throw Error('Brak podglądu raportu do eksportu.');
 const stage=document.createElement('div');
 stage.className='cf-report-pdf-stage';
 stage.style.cssText='position:fixed;left:-100000px;top:0;width:1360px;padding:18px;background:#f3f5ef;box-sizing:border-box;pointer-events:none;z-index:-1;';
 stage.innerHTML=source.innerHTML;

 const rowsBox=stage.querySelector('#rRows');
 if(rowsBox)rowsBox.innerHTML=reportPdfAllRowsHtml(r);

 stage.querySelectorAll('[data-action="pdf"],[data-action="xlsx"],[data-action="prev"],[data-action="next"],[data-action="back-report"]').forEach(el=>el.remove());
 stage.querySelectorAll('.r-card small,[data-metric] small').forEach(el=>el.remove());
 stage.querySelectorAll('#rRows [data-row],[data-row]').forEach(el=>el.remove());
 stage.querySelectorAll('.r-flex').forEach(el=>{if(!el.children.length&&!el.textContent.trim())el.remove();});

 const css=document.createElement('style');
 css.textContent=
   '.cf-report-pdf-stage .r-scroll{overflow:visible!important;max-height:none!important;}'+
   '.cf-report-pdf-stage .r-chart{overflow:visible!important;max-height:none!important;}'+
   '.cf-report-pdf-stage th{position:static!important;}'+
   '.cf-report-pdf-stage .r-box{break-inside:avoid;}'+
   '.cf-report-pdf-stage .r-card small{display:none!important;}'+
   '.cf-report-pdf-stage [data-row]{display:none!important;}'+
   '.cf-report-pdf-stage button{cursor:default!important;}'+
   '.cf-report-pdf-stage tbody tr:hover{background:transparent!important;}';
 stage.prepend(css);
 host.appendChild(stage);
 return stage;
}

function reportPdfBreaks(stage,cssPageHeight){
 const rootRect=stage.getBoundingClientRect(),height=stage.scrollHeight;
 const candidates=new Set([height]);
 const addBottom=el=>{
   const r=el.getBoundingClientRect();
   const y=Math.round(r.bottom-rootRect.top);
   if(y>0&&y<height)candidates.add(y);
 };
 stage.querySelectorAll('.r-box,#rRows thead tr,#rRows tbody tr').forEach(addBottom);
 const ys=[...candidates].sort((a,b)=>a-b);
 const breaks=[0];
 let start=0;
 while(start<height-2){
   const target=Math.min(height,start+cssPageHeight);
   let end=ys.filter(y=>y>start+80&&y<=target).at(-1);
   if(!end)end=target;
   if(end<=start+2)end=Math.min(height,start+cssPageHeight);
   breaks.push(end);
   start=end;
 }
 if(breaks.at(-1)<height)breaks.push(height);
 return breaks;
}

async function exportPDF(r){
 if(!root.jspdf?.jsPDF||!root.html2canvas)return exportPDFVectorFallback(r);
 const stage=buildReportPdfStage(r);
 try{
   if(document.fonts?.ready)await document.fonts.ready;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

   const rect=stage.getBoundingClientRect();
   const doc=new root.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
   const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
   const margin=8,usableW=pw-margin*2,usableH=ph-margin*2;
   const cssPageHeight=rect.width*(usableH/usableW);
   const breaks=reportPdfBreaks(stage,cssPageHeight);

   const canvas=await root.html2canvas(stage,{
     scale:1,
     useCORS:true,
     allowTaint:false,
     backgroundColor:'#f3f5ef',
     logging:false,
     windowWidth:Math.ceil(rect.width),
     windowHeight:Math.ceil(stage.scrollHeight)
   });
   const ratio=canvas.width/rect.width;

   for(let i=0;i<breaks.length-1;i++){
     const cssStart=breaks[i],cssEnd=breaks[i+1];
     const sy=Math.max(0,Math.round(cssStart*ratio));
     const sh=Math.min(canvas.height-sy,Math.max(1,Math.round((cssEnd-cssStart)*ratio)));
     const slice=document.createElement('canvas');
     slice.width=canvas.width;
     slice.height=sh;
     const ctx=slice.getContext('2d');
     ctx.fillStyle='#f3f5ef';
     ctx.fillRect(0,0,slice.width,slice.height);
     ctx.drawImage(canvas,0,sy,canvas.width,sh,0,0,canvas.width,sh);
     if(i)doc.addPage('a4','landscape');
     const imgH=(sh/canvas.width)*usableW;
     doc.addImage(slice.toDataURL('image/png'),'PNG',margin,margin,usableW,Math.min(imgH,usableH),undefined,'FAST');
     slice.width=slice.height=1;
   }
   canvas.width=canvas.height=1;
   doc.save(safeName(r.cfg.title)+'.pdf');
   return doc;
 }catch(err){
   console.error('CleanFleet HTML report PDF:',err);
   return exportPDFVectorFallback(r);
 }finally{
   stage.remove();
 }
}
function pairsForVehicle(done){const gaps=[];for(let i=1;i<done.length;i++){const days=(Date.parse(done[i].wash_date+'T00:00:00Z')-Date.parse(done[i-1].wash_date+'T00:00:00Z'))/86400000;if(Number.isFinite(days)&&days>=0)gaps.push(days);}return gaps;}
function grouped(rows,key,value=()=>1){const m=new Map();for(const r of rows){const k=key(r)||'Brak danych';m.set(k,(m.get(k)||0)+Number(value(r)||0));}return [...m].map(([label,value])=>({label,value})).sort((a,b)=>String(a.label).localeCompare(String(b.label),'pl',{numeric:true}));}

function miniChart(items,kind='bar',money=false){if(!items.length)return'<div class="vrp-empty">Brak danych do wykresu.</div>';const w=620,h=Math.max(180,items.length*34+25),max=Math.max(1,...items.map(x=>x.value)),left=145,right=65;return'<svg xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img">'+items.map((x,i)=>{const y=12+i*34,bw=(w-left-right)*x.value/max;return'<g><text x="5" y="'+(y+18)+'" font-size="13" fill="#30372c">'+esc(String(x.label).slice(0,22))+'</text><rect x="'+left+'" y="'+y+'" width="'+bw+'" height="24" rx="4" fill="'+palette[i%palette.length]+'"/><text x="'+(w-5)+'" y="'+(y+18)+'" text-anchor="end" font-size="13" fill="#30372c">'+fmt(x.value)+(money?' zł':'')+'</text></g>';}).join('')+'</svg>';}
function vehicleModel(vehicle,washes,company){
 const allRows=[...washes].sort((a,b)=>String(a.wash_date||a.order_date||a.created_at||'').localeCompare(String(b.wash_date||b.order_date||b.created_at||''))||String(a.id).localeCompare(String(b.id))),done=allRows.filter(w=>w.wash_date),gaps=pairsForVehicle(done),amounts=done.map(w=>E.number(w.cost)).filter(v=>v!==null),total=E.sum(amounts),performers=grouped(done,r=>r.performed_by),types=grouped(done,r=>r.billing_category||r.type),monthlyCount=grouped(done,r=>r.wash_date.slice(0,7)),monthlyValue=grouped(done,r=>r.wash_date.slice(0,7),r=>E.number(r.cost)||0);
 return{vehicle,company,rows:allRows,done,gaps,performers,types,monthlyCount,monthlyValue,stats:{count:done.length,first:done[0]?.wash_date||null,last:done.at(-1)?.wash_date||null,total,average:amounts.length?total/amounts.length:null,interval:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,minGap:gaps.length?Math.min(...gaps):null,maxGap:gaps.length?Math.max(...gaps):null}};
}
function vehicleStatsCards(m){return[['Wykonane usługi',m.stats.count],['Pierwsza usługa',m.stats.first||'—'],['Ostatnia usługa',m.stats.last||'—'],['Łączna wartość',fmt(m.stats.total)+' zł'],['Średnia wartość',m.stats.average==null?'—':fmt(m.stats.average)+' zł'],['Średni odstęp',m.stats.interval==null?'—':fmt(m.stats.interval)+' dni'],['Najkrótszy odstęp',m.stats.minGap==null?'—':fmt(m.stats.minGap)+' dni'],['Najdłuższy odstęp',m.stats.maxGap==null?'—':fmt(m.stats.maxGap)+' dni']];}
function vehicleInfoFields(v){return[['Typ',v.type],['Marka',v.brand],['Model',v.model],['Rok produkcji',v.production_year],['Numer taborowy',v.fleet_number],['Kierowca',v.driver_name],['Uwagi pojazdu',v.vehicle_notes]].filter(x=>x[1]!==null&&x[1]!==undefined&&x[1]!=='');}
function vehicleStatus(r){return r.wash_date?(r.paid?'Zapłacone':r.approved?'Zatwierdzone':'Wykonane · oczekuje'):'Oczekuje na wykonanie';}
let lightLogoCache={src:'',data:''};
async function lightLogoSrc(){
 const src=logoSrc();if(!src)return'';if(lightLogoCache.src===src&&lightLogoCache.data)return lightLogoCache.data;
 try{return await new Promise(resolve=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth||img.width;c.height=img.naturalHeight||img.height;const x=c.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,c.width,c.height);x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height);for(let i=0;i<d.data.length;i+=4){const r=d.data[i],g=d.data[i+1],b=d.data[i+2],a=d.data[i+3];if(a>20&&r>205&&g>205&&b>205&&Math.max(r,g,b)-Math.min(r,g,b)<34){d.data[i]=22;d.data[i+1]=25;d.data[i+2]=22;}}x.putImageData(d,0,0);const out=c.toDataURL('image/png');lightLogoCache={src,data:out};resolve(out);}catch(_){resolve(src);}};img.onerror=()=>resolve(src);img.src=src;});}catch(_){return src;}
}
const vrpColors=['#93b70d','#16b39a','#3a8edb','#f0a51a','#7458c8','#df6d74'];
function vrpBarChart(items,money=false,color='#93b70d'){
 if(!items.length)return'<div class="vrp-empty">Brak danych do wykresu.</div>';
 const max=Math.max(1,...items.map(x=>Number(x.value)||0));
 return'<div class="vrp-bar-scroll"><div class="vrp-barplot" style="--bars:'+items.length+'">'+items.map((x,i)=>{const v=Number(x.value)||0,h=Math.max(3,v/max*100);return'<div class="vrp-bar-item"><div class="vrp-bar-value">'+esc(fmt(v)+(money?' zł':''))+'</div><div class="vrp-bar-track"><span style="height:'+h+'%;background:'+(vrpColors[i%vrpColors.length]||color)+'"></span></div><div class="vrp-bar-label">'+esc(x.label)+'</div></div>';}).join('')+'</div></div>';
}
function vrpDonut(items){
 if(!items.length)return'<div class="vrp-empty">Brak danych do wykresu.</div>';
 const total=items.reduce((s,x)=>s+(Number(x.value)||0),0)||1,circ=2*Math.PI*46;let offset=0;
 const rings=items.map((x,i)=>{const value=Number(x.value)||0,len=circ*value/total,svg='<circle cx="60" cy="60" r="46" fill="none" stroke="'+vrpColors[i%vrpColors.length]+'" stroke-width="15" stroke-linecap="butt" stroke-dasharray="'+len+' '+(circ-len)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 60 60)"/>';offset+=len;return svg;}).join('');
 return'<div class="vrp-donut-wrap"><div class="vrp-donut"><svg viewBox="0 0 120 120" role="img"><circle cx="60" cy="60" r="46" fill="none" stroke="#eef2ed" stroke-width="15"/>'+rings+'</svg><div><strong>'+esc(fmt(total))+'</strong><span>usług</span></div></div><div class="vrp-legend">'+items.map((x,i)=>{const value=Number(x.value)||0,p=total?value/total*100:0;return'<div><i style="background:'+vrpColors[i%vrpColors.length]+'"></i><span>'+esc(x.label)+'</span><b>'+esc(fmt(value))+'</b><em>'+esc(fmt(p))+'%</em></div>';}).join('')+'</div></div>';
}
function vehicleEntryHtml(r,index){
 const status=vehicleStatus(r),pending=!r.wash_date,fields=[['Typ',r.type],['Wykonał',r.performed_by],['Zlecił',r.ordered_by],['Kwota',E.number(r.cost)==null?'—':fmt(r.cost)+' zł'],['Termin',r.order_due_date],['Kategoria',r.billing_category],['Zatwierdzone',display(r.approved)],['Zapłacone',display(r.paid)]];
 return'<article class="vrp-entry"><div class="vrp-entry-top"><div class="vrp-entry-no">'+(index+1)+'</div><div class="vrp-entry-date"><span>Data</span><strong>'+esc(r.wash_date||r.order_date||String(r.created_at||'').slice(0,10)||'—')+'</strong></div><span class="vrp-status '+(pending?'waiting':'done')+'">'+esc(status)+'</span></div><div class="vrp-entry-grid">'+fields.map(x=>'<div><span>'+esc(x[0])+'</span><strong>'+esc(display(x[1]))+'</strong></div>').join('')+'</div><div class="vrp-notes"><span>Opis zlecenia</span><strong>'+esc(display(r.notes))+'</strong></div><div class="vrp-notes"><span>Opis wykonania</span><strong>'+esc(display(r.completion_notes))+'</strong></div></article>';
}

function vrpPlateHtml(plate){
 return '<div class="vrp-real-plate"><div class="vrp-eu"><span class="vrp-stars">★ ★<br>★ ★</span><b>PL</b></div><strong>'+esc(plate)+'</strong></div>';
}
function vrpHorizontalBars(items,money=false){
 if(!items.length)return'<div class="vrp-empty">Brak danych do wykresu.</div>';
 const max=Math.max(1,...items.map(x=>Math.abs(Number(x.value)||0)));
 return'<div class="vrp-hbars">'+items.map((x,i)=>{const v=Number(x.value)||0,p=Math.max(2,Math.abs(v)/max*100);return'<div class="vrp-hbar-row"><span>'+esc(String(x.label))+'</span><div class="vrp-hbar-track"><i style="width:'+p+'%;background:'+vrpColors[i%vrpColors.length]+'"></i></div><b>'+esc(fmt(v)+(money?' zł':''))+'</b></div>';}).join('')+'</div>';
}
function vrpSummaryTable(title,items,money=false){
 if(!items.length)return'';
 return'<section class="vrp-report-block"><h3>'+esc(title)+'</h3><div class="vrp-table-wrap"><table class="vrp-report-table"><thead><tr><th>Grupa</th><th>'+(money?'Wartość':'Liczba')+'</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc(x.label)+'</td><td>'+esc(fmt(x.value)+(money?' zł':''))+'</td></tr>').join('')+'</tbody></table></div></section>';
}
function vrpHistoryTable(rows){
 return'<section class="vrp-report-block"><h3>HISTORIA PRAŃ</h3><div class="vrp-table-wrap"><table class="vrp-report-table vrp-history-table"><thead><tr><th>Data</th><th>Typ</th><th>Wykonał</th><th>Zlecił</th><th>Kwota</th><th>Termin</th><th>Kategoria</th><th>Status</th><th>Zatw.</th><th>Zapł.</th><th>Opis zlecenia</th><th>Opis wykonania</th></tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr><td>'+esc(r.wash_date||r.order_date||String(r.created_at||'').slice(0,10)||'—')+'</td><td>'+esc(display(r.type))+'</td><td>'+esc(display(r.performed_by))+'</td><td>'+esc(display(r.ordered_by))+'</td><td>'+esc(E.number(r.cost)==null?'—':fmt(r.cost)+' zł')+'</td><td>'+esc(display(r.order_due_date))+'</td><td>'+esc(display(r.billing_category))+'</td><td>'+esc(vehicleStatus(r))+'</td><td>'+esc(display(r.approved))+'</td><td>'+esc(display(r.paid))+'</td><td>'+esc(display(r.notes))+'</td><td>'+esc(display(r.completion_notes))+'</td></tr>').join(''):'<tr><td colspan="12">Brak historii usług.</td></tr>')+'</tbody></table></div></section>';
}
function vehiclePreviewHtml(m,logo){
 const v=m.vehicle,c=m.company;
 const meta=[
   'Firma / klient: '+display(c?.short_name||c?.name),
   'Typ: '+display(v.type),
   'Marka: '+display(v.brand),
   'Model: '+display(v.model),
   'Rok: '+display(v.production_year),
   'Tabor: '+display(v.fleet_number),
   'Kierowca: '+display(v.driver_name)
 ];
 return'<div class="vrp-shell">'+
   '<div class="vrp-toolbar"><span>Podgląd karty pojazdu · '+esc(v.plate)+'</span><div><button data-vrp="close">Zamknij</button><button class="primary" data-vrp="download">Pobierz PDF</button></div></div>'+
   '<section class="vrp-report-sheet">'+
     '<header class="vrp-report-head"><div><h1>Karta pojazdu</h1><p>Kompletna historia usług · stan: '+esc(new Date().toLocaleString('pl-PL'))+'</p></div>'+(logo?'<img src="'+esc(logo)+'" alt="CleanFleet">':'<strong class="vrp-logo-text">Clean<span>Fleet</span></strong>')+'</header>'+
     '<div class="vrp-report-line"></div>'+
     '<div class="vrp-vehicle-line">'+vrpPlateHtml(v.plate)+'<div class="vrp-meta-line">'+meta.map(x=>'<span>'+esc(x)+'</span>').join('<b>·</b>')+'</div></div>'+
     '<div class="vrp-kpis">'+vehicleStatsCards(m).map(x=>'<div class="vrp-kpi"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join('')+'</div>'+
     '<p class="vrp-explain">Statystyki obejmują wykonane usługi tego pojazdu. Odstępy liczone są między kolejnymi datami wykonania. Historia na końcu zawiera również wpisy oczekujące.</p>'+
     '<section class="vrp-report-block"><h3>Liczba prań w miesiącach</h3>'+vrpHorizontalBars(m.monthlyCount,false)+'</section>'+
     '<section class="vrp-report-block"><h3>Wartość usług w miesiącach</h3>'+vrpHorizontalBars(m.monthlyValue,true)+'</section>'+
     vrpSummaryTable('Usługi według wykonawców',m.performers,false)+
     vrpHistoryTable(m.rows)+
     '<footer class="vrp-report-footer"><span>CleanFleet · Karta pojazdu · '+esc(v.plate)+'</span><span>Podgląd</span></footer>'+
   '</section>'+
 '</div>';
}
function pdfRoundCard(doc,x,y,w,h,fill=[255,255,255],stroke=[226,232,226],r=3){doc.setFillColor(...fill);doc.setDrawColor(...stroke);doc.roundedRect(x,y,w,h,r,r,'FD');}
function pdfText(doc,text,x,y,size=9,color=[28,32,29],align){doc.setTextColor(...color);doc.setFontSize(size);doc.text(E.text(text),x,y,align?{align}:undefined);}
function pdfLightHeader(doc,v,logo){
 const pw=doc.internal.pageSize.getWidth();doc.setFillColor(255,255,255);doc.rect(0,0,pw,37,'F');
 if(logo){try{const p=doc.getImageProperties(logo),ratio=p.width/p.height;let w=57,h=w/ratio;if(h>22){h=22;w=h*ratio;}doc.addImage(logo,'PNG',10,7,w,h,undefined,'FAST');}catch(_){}}
 pdfText(doc,'Karta pojazdu · '+v.plate,pw-10,15,15,[20,23,21],'right');pdfText(doc,'Kompletna historia usług · '+new Date().toLocaleDateString('pl-PL'),pw-10,23,8.5,[96,105,115],'right');doc.setFillColor(147,183,13);doc.rect(0,36,pw,1.7,'F');return 44;
}
function pdfSectionTitle(doc,title,y,color=[147,183,13]){doc.setFillColor(...color);doc.roundedRect(10,y-3,2.2,8,1.1,1.1,'F');pdfText(doc,title,16,y+3,11.5,[24,28,25]);return y+9;}
function pdfVehicleInfo(doc,m,y){
 const v=m.vehicle,c=m.company,pw=doc.internal.pageSize.getWidth();pdfRoundCard(doc,10,y,pw-20,50,[255,255,255],[230,235,230],3);
 doc.setDrawColor(25,29,27);doc.setLineWidth(.7);doc.roundedRect(16,y+8,67,17,2,2);pdfText(doc,v.plate,49.5,y+19.6,15,[20,23,21],'center');
 if(v.fleet_number){doc.setFillColor(147,183,13);doc.circle(92,y+16.5,8,'F');pdfText(doc,v.fleet_number,92,y+19.2,8.5,[255,255,255],'center');}
 pdfText(doc,'Firma / klient',pw-16,y+10,7.5,[100,107,115],'right');pdfText(doc,c?.short_name||c?.name||'—',pw-16,y+18,11,[25,28,26],'right');
 const info=vehicleInfoFields(v).slice(0,6),cols=2,cw=(pw-32)/cols;info.forEach((it,i)=>{const col=i%cols,row=Math.floor(i/cols),x=16+col*cw,yy=y+29+row*7;doc.setFillColor(247,249,247);doc.roundedRect(x,yy-4,cw-3,6.2,1.2,1.2,'F');pdfText(doc,it[0],x+2,yy,7.2,[96,105,115]);pdfText(doc,display(it[1]),x+cw*.52,yy,8.3,[24,28,25]);});return y+56;
}
function pdfStats(doc,m,y){
 const cards=vehicleStatsCards(m),pw=doc.internal.pageSize.getWidth(),gap=4,cw=(pw-20-gap)/2,ch=20;cards.forEach((it,i)=>{const col=i%2,row=Math.floor(i/2),x=10+col*(cw+gap),yy=y+row*(ch+4);pdfRoundCard(doc,x,yy,cw,ch,[255,255,255],[229,234,229],3);doc.setFillColor(239,246,229);doc.circle(x+9,yy+10,5.8,'F');doc.setFillColor(147,183,13);doc.circle(x+9,yy+10,2,'F');pdfText(doc,it[0],x+18,yy+8,7.3,[94,103,113]);pdfText(doc,it[1],x+18,yy+15,10.5,[20,23,21]);});return y+4*(ch+4);
}
function pdfBarCard(doc,title,items,y,h,money=false,color=[147,183,13]){
 const pw=doc.internal.pageSize.getWidth();pdfRoundCard(doc,10,y,pw-20,h,[255,255,255],[229,234,229],3);doc.setFillColor(...color);doc.roundedRect(15,y+7,2,8,1,1,'F');pdfText(doc,title,21,y+13,11,[24,28,25]);
 if(!items.length){pdfText(doc,'Brak danych do wykresu.',15,y+28,8,[100,108,116]);return;}
 const max=Math.max(1,...items.map(x=>Number(x.value)||0)),plotX=18,plotY=y+24,plotW=pw-36,plotH=h-32,n=items.length,bw=Math.max(3,Math.min(13,(plotW-6)/Math.max(n,1)*.58)),step=plotW/Math.max(n,1);
 doc.setDrawColor(229,233,237);for(let g=0;g<3;g++){const gy=plotY+plotH-g*plotH/2;doc.setLineDashPattern([1,1.5],0);doc.line(plotX,gy,plotX+plotW,gy);}doc.setLineDashPattern([],0);
 items.forEach((it,i)=>{const v=Number(it.value)||0,bh=plotH*(v/max)*.78,x=plotX+i*step+(step-bw)/2,by=plotY+plotH-bh;const col=vrpColors[i%vrpColors.length],rgb=col.match(/\w\w/g).map(z=>parseInt(z,16));doc.setFillColor(...rgb);doc.roundedRect(x,by,bw,bh,1.2,1.2,'F');pdfText(doc,fmt(v)+(money?' zł':''),x+bw/2,Math.max(plotY+4,by-2),7,[25,28,26],'center');pdfText(doc,String(it.label).slice(0,10),x+bw/2,plotY+plotH+5,6.5,[88,98,112],'center');});
}
function pdfDonutCard(doc,title,items,y,h,color=[22,179,154]){
 const pw=doc.internal.pageSize.getWidth();pdfRoundCard(doc,10,y,pw-20,h,[255,255,255],[229,234,229],3);doc.setFillColor(...color);doc.roundedRect(15,y+7,2,8,1,1,'F');pdfText(doc,title,21,y+13,11,[24,28,25]);
 if(!items.length){pdfText(doc,'Brak danych do wykresu.',15,y+28,8,[100,108,116]);return;}
 const total=items.reduce((s,x)=>s+(Number(x.value)||0),0)||1,cx=52,cy=y+h/2+4,r=18,segments=80;for(let s=0;s<segments;s++){const a=(s/segments)*Math.PI*2-Math.PI/2,idx=Math.min(items.length-1,Math.floor((s/segments)*total)===0?0:0);let t=s/segments*total,acc=0,chosen=0;for(let i=0;i<items.length;i++){acc+=Number(items[i].value)||0;if(t<=acc){chosen=i;break;}}const col=vrpColors[chosen%vrpColors.length],rgb=col.match(/\w\w/g).map(z=>parseInt(z,16));doc.setFillColor(...rgb);doc.circle(cx+Math.cos(a)*r,cy+Math.sin(a)*r,1.7,'F');}doc.setFillColor(255,255,255);doc.circle(cx,cy,11,'F');pdfText(doc,fmt(total),cx,cy+1,12,[20,23,21],'center');pdfText(doc,'usług',cx,cy+6,6.5,[96,105,115],'center');
 const lx=82;items.slice(0,6).forEach((it,i)=>{const yy=y+25+i*8,col=vrpColors[i%vrpColors.length],rgb=col.match(/\w\w/g).map(z=>parseInt(z,16));doc.setFillColor(...rgb);doc.circle(lx,yy-1,2.2,'F');pdfText(doc,it.label,lx+6,yy,8,[35,39,36]);pdfText(doc,fmt(it.value),pw-30,yy,8,[25,28,26],'right');pdfText(doc,fmt((Number(it.value)||0)/total*100)+'%',pw-15,yy,7.5,[92,101,115],'right');});
}
function pdfHistoryCard(doc,r,index,y){
 const pw=doc.internal.pageSize.getWidth(),status=vehicleStatus(r),pending=!r.wash_date;
 const orderLines=doc.splitTextToSize(display(r.notes),pw-48),doneLines=doc.splitTextToSize(display(r.completion_notes),pw-48);
 const orderShown=orderLines.slice(0,2),doneShown=doneLines.slice(0,2),h=Math.max(73,65+orderShown.length*4+doneShown.length*4);
 pdfRoundCard(doc,10,y,pw-20,h,[255,255,255],[229,234,229],3);doc.setFillColor(239,246,229);doc.circle(20,y+12,6,'F');pdfText(doc,index+1,20,y+14,10,[80,110,10],'center');doc.setFillColor(239,246,229);doc.circle(34,y+12,5,'F');pdfText(doc,'□',34,y+14,9,[90,125,12],'center');pdfText(doc,'Data',43,y+9,7,[96,105,115]);pdfText(doc,r.wash_date||r.order_date||String(r.created_at||'').slice(0,10)||'—',43,y+16,11,[20,23,21]);
 const pillW=pending?52:31;doc.setFillColor(...(pending?[255,248,232]:[240,248,233]));doc.setDrawColor(...(pending?[242,179,55]:[186,216,159]));doc.roundedRect(pw-15-pillW,y+6,pillW,12,6,6,'FD');pdfText(doc,status,pw-15-pillW/2,y+14,7.2,pending?[150,98,0]:[45,88,15],'center');
 const fields=[['Typ',r.type],['Wykonał',r.performed_by],['Zlecił',r.ordered_by],['Kwota',E.number(r.cost)==null?'—':fmt(r.cost)+' zł'],['Termin',r.order_due_date],['Kategoria',r.billing_category],['Zatwierdzone',display(r.approved)],['Zapłacone',display(r.paid)]];
 const gap=4,cw=(pw-24-gap)/2;fields.forEach((it,i)=>{const col=i%2,row=Math.floor(i/2),x=12+col*(cw+gap),yy=y+23+row*7;doc.setFillColor(247,249,250);doc.roundedRect(x,yy-4,cw,6.2,1.2,1.2,'F');pdfText(doc,it[0],x+2,yy,7,[94,103,113]);pdfText(doc,display(it[1]),x+cw*.48,yy,8,[24,28,25]);});
 const ny=y+53;doc.setFillColor(249,250,250);doc.roundedRect(12,ny-4,pw-24,h-(ny-y)+1,1.4,1.4,'F');
 pdfText(doc,'Opis zlecenia',16,ny,7,[94,103,113]);doc.setFontSize(7.8);doc.setTextColor(35,39,36);doc.text(orderShown,16,ny+5);
 const doneY=ny+9+orderShown.length*4;pdfText(doc,'Opis wykonania',16,doneY,7,[94,103,113]);doc.setFontSize(7.8);doc.setTextColor(35,39,36);doc.text(doneShown,16,doneY+5);return h;
}
function addVehicleFooters(doc,v){
 const pages=doc.getNumberOfPages(),pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setDrawColor(220,226,229);doc.line(10,ph-11,pw-10,ph-11);pdfText(doc,'CleanFleet · '+v.plate,10,ph-6,7,[92,101,115]);pdfText(doc,n+' / '+pages,pw-10,ph-6,7,[92,101,115],'right');}
}
async function vehicleReportPDF(m){
 if(!window.jspdf?.jsPDF) throw new Error('Biblioteka PDF jest niedostępna. Odśwież aplikację.');
 if(!window.html2canvas) throw new Error('Biblioteka podglądu PDF jest niedostępna. Odśwież aplikację.');

 const {jsPDF}=window.jspdf;
 const logo=await lightLogoSrc();

 // Use exactly the same HTML/CSS that is shown in the accepted vehicle-card preview.
 // This keeps the generated PDF visually identical to the preview instead of maintaining
 // a second, separate jsPDF layout.
 let source=document.querySelector('#cfVehicleReportPreview .vrp-report-sheet');
 let tempHost=null;
 if(!source){
   tempHost=document.createElement('div');
   tempHost.className='vrp-pdf-render-host';
   tempHost.style.cssText='position:fixed;left:-100000px;top:0;width:1180px;background:#eef1ef;pointer-events:none;z-index:-1;';
   tempHost.innerHTML=vehiclePreviewHtml(m,logo);
   document.body.appendChild(tempHost);
   source=tempHost.querySelector('.vrp-report-sheet');
 }
 if(!source) throw new Error('Nie udało się przygotować widoku karty pojazdu.');

 // Clone only the report itself; toolbar/actions are intentionally excluded.
 const wrap=document.createElement('div');
 wrap.className='vrp-pdf-render-host';
 wrap.style.cssText='position:fixed;left:-100000px;top:0;width:1180px;background:#eef1ef;padding:0;pointer-events:none;z-index:-1;';
 const clone=source.cloneNode(true);
 clone.style.width='1180px';
 clone.style.maxWidth='none';
 clone.style.margin='0';
 clone.style.borderRadius='0';
 clone.style.boxShadow='none';
 wrap.appendChild(clone);
 document.body.appendChild(wrap);

 try{
   if(document.fonts?.ready) await document.fonts.ready;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

   const canvas=await window.html2canvas(clone,{
     scale:2,
     useCORS:true,
     backgroundColor:'#ffffff',
     logging:false,
     imageTimeout:15000,
     scrollX:0,
     scrollY:0,
     windowWidth:1180
   });

   const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
   const pageW=doc.internal.pageSize.getWidth();
   const pageH=doc.internal.pageSize.getHeight();
   const marginX=8;
   const marginY=8;
   const printableW=pageW-marginX*2;
   const printableH=pageH-marginY*2;

   // Convert physical A4 content height to source-canvas pixels and crop page-by-page.
   const pxPerMm=canvas.width/printableW;
   const slicePx=Math.max(1,Math.floor(printableH*pxPerMm));
   let sy=0,page=0;

   while(sy<canvas.height){
     const sh=Math.min(slicePx,canvas.height-sy);
     const slice=document.createElement('canvas');
     slice.width=canvas.width;
     slice.height=sh;
     const ctx=slice.getContext('2d');
     ctx.fillStyle='#fff';
     ctx.fillRect(0,0,slice.width,slice.height);
     ctx.drawImage(canvas,0,sy,canvas.width,sh,0,0,canvas.width,sh);

     if(page>0) doc.addPage('a4','landscape');
     const imgH=sh/pxPerMm;
     doc.addImage(slice.toDataURL('image/jpeg',0.96),'JPEG',marginX,marginY,printableW,imgH,undefined,'FAST');

     sy+=sh;
     page++;
   }

   // Small neutral page-number footer, matching the preview's restrained footer language.
   const pages=doc.getNumberOfPages();
   for(let p=1;p<=pages;p++){
     doc.setPage(p);
     doc.setDrawColor(220,226,229);
     doc.line(marginX,pageH-5.5,pageW-marginX,pageH-5.5);
     doc.setTextColor(102,112,131);
     doc.setFontSize(6.6);
     doc.text('CleanFleet · Karta pojazdu · '+E.text(m.vehicle.plate),marginX,pageH-2.2);
     doc.text(p+' / '+pages,pageW-marginX,pageH-2.2,{align:'right'});
   }

   doc.save('CleanFleet_'+safeName(m.vehicle.plate)+'_karta_pojazdu.pdf');
   return doc;
 }finally{
   wrap.remove();
   if(tempHost) tempHost.remove();
 }
}
async function open(b){bridge=b;if(!(b.canReports?.()===true||b.isAdmin?.()===true)){reset();return;}try{guard();const id=await identity();if(owner&&owner!==id)reset();owner=id;if(host){host.hidden=false;return;}render();notice('Pobieram wartości filtrów…');busy(true);data=await load(cfg.source);renderFilters();notice('Wybierz zakres danych, grupowanie i kliknij „Generuj”.');}catch(e){if(host)notice(e.message||String(e),true);}finally{busy(false);}}
async function loadVehicleModel(b,plate,companyId){bridge=b;const id=await identity();const [vehicles,washes,companies]=await Promise.all([all('vehicles',{plate,company_id:companyId},false),all('wash_records',{plate,company_id:companyId},false),all('companies',{id:companyId},false)]);if(await identity()!==id)throw Error('Sesja zmieniła się. Spróbuj ponownie.');const vehicle=vehicles[0];if(!vehicle)throw Error('Brak dostępu do pojazdu.');return vehicleModel(vehicle,washes,companies[0]);}
async function vehicleReportPreview(b,plate,companyId){const existing=document.getElementById('cfVehicleReportPreview');if(existing)existing.remove();const model=await loadVehicleModel(b,plate,companyId),logo=await lightLogoSrc(),preview=document.createElement('section');preview.id='cfVehicleReportPreview';preview.setAttribute('role','dialog');preview.setAttribute('aria-modal','true');preview.setAttribute('aria-label','Podgląd karty pojazdu');preview.innerHTML=vehiclePreviewHtml(model,logo);document.body.append(preview);preview.querySelector('[data-vrp=close]').onclick=()=>preview.remove();preview.querySelector('[data-vrp=download]').onclick=async e=>{const btn=e.currentTarget;btn.disabled=true;btn.textContent='Tworzę PDF…';try{await vehicleReportPDF(model);btn.textContent='Pobrano PDF';}catch(err){console.error('CleanFleet vehicle PDF:',err);btn.textContent='Nie udało się utworzyć PDF';}finally{setTimeout(()=>{if(btn.isConnected){btn.disabled=false;btn.textContent='Pobierz PDF';}},1500);}};return model;}
async function vehiclePDF(b,plate,companyId){return vehicleReportPDF(await loadVehicleModel(b,plate,companyId));}
root.CFReports={open,reset,vehicleReportPreview,vehiclePDF,vehicleModel,vehicleReportPDF};
})(window);
