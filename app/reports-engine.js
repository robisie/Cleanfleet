/* Pure reporting engine. One row per source record; joins never expand rows. */
(function(root){'use strict';
const catalog=typeof module!=='undefined'&&module.exports?require('./reports-catalog.js'):root.CFReportCatalog;
const key=r=>JSON.stringify([r.company_id??null,r.plate??r.vehicle_plate??null]);
const text=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
const day=(v,t)=>!v?'':t==='datetime'?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):String(v).slice(0,10);
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const sum=values=>values.reduce((a,b)=>a+Math.round(b*100),0)/100;
const numericSum=values=>values.reduce((a,b)=>a+b,0);
function fields(source){const f=JSON.parse(JSON.stringify(catalog[source].fields));
 if(f.company_id)f.company_name={label:'Firma / klient',type:'text'};
 if(source==='wash_records'){
  for(const [k,v]of Object.entries(catalog.vehicles.fields))if(!['company_id','plate'].includes(k))f['vehicle_'+k]={...v,label:'Kartoteka: '+v.label};
  for(const k of ['invoice_number','invoice_date','status','paid_at'])f['invoice_'+k]={...catalog.invoices.fields[k],label:'Faktura: '+catalog.invoices.fields[k].label};
  f.has_invoice={label:'Przypisano fakturę',type:'boolean'};f.completed={label:'Pranie wykonane',type:'boolean'};
 }
 if(['invoice_items','wash_change_requests','wash_record_photos'].includes(source))for(const k of ['company_id','plate','type','performed_by','wash_date'])f['wash_'+k]={...catalog.wash_records.fields[k],label:'Pranie: '+catalog.wash_records.fields[k].label};
 if(source==='invoice_items')f.invoice_number={label:'Numer faktury',type:'text'};
 return f;
}
function enrich(source,data){const companies=new Map((data.companies||[]).map(c=>[c.id,c]));const vehicles=new Map((data.vehicles||[]).map(v=>[key(v),v]));const invoices=new Map((data.invoices||[]).map(i=>[i.id,i]));const items=new Map((data.invoice_items||[]).map(i=>[i.wash_record_id,i]));const washes=new Map((data.wash_records||[]).map(w=>[w.id,w]));
 return (data[source]||[]).map(raw=>{const r={...raw};if('company_id'in r){const c=companies.get(r.company_id);r.company_name=c?.short_name||c?.name||r.company_id||null;}
 if(source==='wash_records'){const v=vehicles.get(key(r));for(const k of Object.keys(catalog.vehicles.fields))if(!['company_id','plate'].includes(k))r['vehicle_'+k]=v?.[k]??null;const i=invoices.get(items.get(r.id)?.invoice_id);r.has_invoice=!!i;r.completed=!!r.wash_date;for(const k of ['invoice_number','invoice_date','status','paid_at'])r['invoice_'+k]=i?.[k]??null;}
 if(['invoice_items','wash_change_requests','wash_record_photos'].includes(source)){const w=washes.get(r.wash_record_id);for(const k of ['company_id','plate','type','performed_by','wash_date'])r['wash_'+k]=w?.[k]??null;}
 if(source==='invoice_items')r.invoice_number=invoices.get(r.invoice_id)?.invoice_number??null;
 return r;});
}
function matches(r,f,defs){if(!defs[f.field])throw Error('Nieznane pole filtra: '+f.field);let v=r[f.field];let type=defs[f.field].type;if(f.op==='empty')return v==null||v==='';if(f.op==='notempty')return v!=null&&v!=='';
 if(f.op==='in')return (f.values||[]).some(x=>x===v||(x==null&&v==null));
 if(f.op==='contains')return text(v).toLocaleLowerCase('pl').includes(text(f.value).toLocaleLowerCase('pl'));
 if(type==='date'||type==='datetime')v=day(v,type);else if(type==='number')v=number(v);
 if(v==null||v==='')return false;
 if(f.op==='range')return (f.min===''||f.min==null||v>=(type==='number'?Number(f.min):f.min))&&(f.max===''||f.max==null||v<=(type==='number'?Number(f.max):f.max));
 if(f.op==='eq')return text(v)===text(f.value);if(f.op==='neq')return text(v)!==text(f.value);throw Error('Nieznany operator filtra');}
function filter(rows,cfg,defs){if(cfg.from&&cfg.to&&cfg.from>cfg.to)throw Error('Data od musi poprzedzać datę do.');return rows.filter(r=>{if(cfg.dateField&&(cfg.from||cfg.to)){const d=day(r[cfg.dateField],defs[cfg.dateField]?.type);if(!d||(cfg.from&&d<cfg.from)||(cfg.to&&d>cfg.to))return false;}return(cfg.filters||[]).every(f=>matches(r,f,defs));});}
function bucket(value,mode,type){const d=day(value,type);if(!d)return null;if(mode==='year')return d.slice(0,4);if(mode==='month')return d.slice(0,7);if(mode==='week'){const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return t.toISOString().slice(0,10)+' (pon.)';}return d;}
function groups(rows,cfg,defs){if(!(cfg.groups||[]).length)return [{label:'Wszystkie dane',rows}];const m=new Map();for(const r of rows){const values=cfg.groups.map(g=>{if(!defs[g.field])throw Error('Nieznane grupowanie');return ['date','datetime'].includes(defs[g.field].type)?bucket(r[g.field],g.bucket,defs[g.field].type):r[g.field]??null;});const k=JSON.stringify(cfg.groups.map((g,i)=>['company_name','plate','vehicle_plate'].includes(g.field)?[r.company_id,values[i]]:g.field==='wash_plate'?[r.wash_company_id,values[i]]:values[i]));if(!m.has(k))m.set(k,{label:values.map(v=>v==null||v===''?'Brak danych':v===true?'Tak':v===false?'Nie':text(v)).join(' · '),values,rows:[]});m.get(k).rows.push(r);}return [...m.values()].sort((a,b)=>a.label.localeCompare(b.label,'pl',{numeric:true}));}
function distinctVehicles(rows){const map=new Map();for(const r of rows){const plate=r.plate||r.vehicle_plate||r.wash_plate;if(!plate)continue;const company=r.company_id??r.wash_company_id??null;const k=JSON.stringify([company,plate]);if(!map.has(k))map.set(k,{company_id:company,plate,company_name:r.company_name??company,rows:[]});map.get(k).rows.push(r);}return [...map.values()];}
function metric(rows,m,cfg){let contributing=rows,value=null,pairs=null;const nums=()=>rows.filter(r=>number(r[m.field])!==null);const vals=rs=>rs.map(r=>number(r[m.field]));
 switch(m.kind){case'count':value=rows.length;break;
 case'completed':contributing=rows.filter(r=>!!r.wash_date);value=contributing.length;break;
 case'vehicles':contributing=rows.filter(r=>!!(r.plate||r.vehicle_plate||r.wash_plate));value=distinctVehicles(contributing).length;break;
 case'distinct':contributing=rows.filter(r=>r[m.field]!=null&&r[m.field]!=='');value=new Set(contributing.map(r=>text(r[m.field]))).size;break;
 case'sum':case'avg':case'min':case'max':contributing=nums();if(contributing.length){const v=vals(contributing);const total=m.money?sum(v):numericSum(v);value=m.kind==='sum'?total:m.kind==='avg'?total/v.length:m.kind==='min'?Math.min(...v):Math.max(...v);}break;
 case'frequency':contributing=rows.filter(r=>!!r.wash_date&&!!r.plate);{const n=distinctVehicles(contributing).length;value=n?contributing.length/n:null;}break;
 case'interval':{pairs=[];const complete=rows.filter(r=>r.wash_date&&r.plate);for(const v of distinctVehicles(complete)){const sorted=[...v.rows].sort((a,b)=>a.wash_date.localeCompare(b.wash_date)||text(a.id).localeCompare(text(b.id)));for(let i=1;i<sorted.length;i++){const days=(Date.parse(sorted[i].wash_date+'T00:00:00Z')-Date.parse(sorted[i-1].wash_date+'T00:00:00Z'))/86400000;if(Number.isFinite(days)&&days>=0)pairs.push({from:sorted[i-1],to:sorted[i],days});}}const set=new Set(pairs.flatMap(p=>[p.from,p.to]));contributing=rows.filter(r=>set.has(r));value=pairs.length?pairs.reduce((s,p)=>s+p.days,0)/pairs.length:null;break;}
 default:throw Error('Nieznana metryka');}return {value,rows:contributing,pairs};}
function metrics(source,cfg){const ds=[{id:'count',kind:'count',label:source==='wash_records'?'Liczba wpisów':source==='vehicles'?'Pojazdy w kartotece':'Liczba rekordów'}];const f=fields(source);if(f.plate||f.vehicle_plate||f.wash_plate)ds.push({id:'vehicles',kind:'vehicles',label:'Unikalne pojazdy'});if(source==='wash_records')ds.push({id:'completed',kind:'completed',label:'Wykonane prania'},{id:'frequency',kind:'frequency',label:'Prań na pojazd w wybranym zbiorze'},{id:'interval',kind:'interval',label:'Średni odstęp między praniami (dni)'});
 const field=cfg.amountField||catalog[source].money;if(field&&f[field]?.type==='number')for(const kind of ['sum','avg','min','max'])ds.push({id:kind,kind,field,money:/cost|amount|price/.test(field),label:({sum:'Suma',avg:'Średnia',min:'Minimum',max:'Maksimum'})[kind]+': '+f[field].label});if(cfg.distinctField&&f[cfg.distinctField])ds.push({id:'distinct',kind:'distinct',field:cfg.distinctField,label:'Unikalne: '+f[cfg.distinctField].label});return ds;}
function report(data,cfg){if(!catalog[cfg.source])throw Error('Nieznane źródło');const defs=fields(cfg.source);const rows=filter(enrich(cfg.source,data),cfg,defs);const ms=metrics(cfg.source,cfg);return {cfg:JSON.parse(JSON.stringify(cfg)),fields:defs,rows,metrics:ms.map(m=>({...m,...metric(rows,m,cfg)})),groups:groups(rows,cfg,defs).map(g=>({...g,metrics:ms.map(m=>({...m,...metric(g.rows,m,cfg)}))}))};}
const api={catalog,fields,enrich,filter,groups,metric,metrics,report,distinctVehicles,day,text,number,sum};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CFReportEngine=api;
})(globalThis);
