import {compactMetadata,today} from './accountant-core.js?v=6';
async function pages(db,table,select,order,filter=q=>q){const all=[];for(let offset=0;;offset+=500){const result=await filter(db.from(table).select(select).order(order).range(offset,offset+499));if(result.error)throw result.error;all.push(...(result.data||[]));if((result.data||[]).length<500)return all;}}
async function readBills(db){const r=await db.functions.invoke('cleanfleet-bill',{body:{action:'search',q:''}});if(r.error||r.data?.error)throw Error(r.data?.error||r.error?.message||'Nie można odczytać faktur Bill.');if(!Array.isArray(r.data)||r.data.length>=1000)throw Error('Historia Bill osiągnęła limit odczytu. Zestawienie wymaga rozszerzenia stronicowania, aby nie pominąć faktur.');return r.data;}
export async function readData(db,owner){const [settings,bills,purchases,costs]=await Promise.all([
 db.from('rs_settings').select('owner_id,payload,revision').eq('owner_id',owner).maybeSingle(),
 readBills(db),
 pages(db,'rs_ksef_documents','ksef_number,metadata,preview','ksef_number',q=>q.eq('owner_id',owner)),
 pages(db,'cf_ksef_costs','ksef_number,invoice_number,supplier,purchase_date,preview','ksef_number')]);
 if(settings.error)throw settings.error;return {settings:settings.data||{revision:0,payload:{}},bills,purchases,costs};}
export async function syncYear(db,year,{progress=()=>{},signal,asOf=today()}={}){
 const result={sales:[],purchases:[],syncedAt:'',complete:false},check=()=>{if(signal?.aborted)throw Error('Synchronizacja anulowana. Zachowano poprzednie dane.');};let ticket='';
 for(const kind of ['sales','purchases'])for(let quarter=1;quarter<=4;quarter++){
  const from=`${year}-${String((quarter-1)*3+1).padStart(2,'0')}-01`,to=[new Date(Date.UTC(Number(year),quarter*3,0)).toISOString().slice(0,10),asOf].sort()[0];if(from>to)continue;
  for(let page=0;page<40;page++){
   check();progress(`${kind==='sales'?'Sprzedaż':'Zakupy'} · ${from} – ${to} · strona ${page+1}`);
   const response=await db.functions.invoke('cleanfleet-bill',{body:{action:'ksef-list',kind,from,to,dateType:'Issue',sort:'Asc',page,...(ticket?{ticket}:{})},signal});check();
   if(response.error||response.data?.error)throw Error(response.data?.error||response.error?.message||'Nie udało się pobrać KSeF.');
   const data=response.data;if(!Array.isArray(data?.invoices)||data.partial||data.isTruncated)throw Error('KSeF zwrócił niepełne dane. Zachowano poprzednie zestawienie. Spróbuj ponownie.');
   ticket=data.ticket||ticket;result[kind].push(...data.invoices.map(compactMetadata));if(!data.hasMore)break;if(page===39)throw Error('Przekroczono limit stron KSeF.');
  }
 }
 for(const kind of ['sales','purchases'])result[kind]=[...new Map(result[kind].map(m=>[String(m.ksefNumber).toUpperCase(),m])).values()];
 result.syncedAt=new Date().toISOString();result.complete=true;return result;
}
