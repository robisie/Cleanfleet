(()=>{
'use strict';
let rows=[],companies=new Map(),weekStart=null,draggedId=null,loading=false;
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const mon=d=>{const x=new Date(d);x.setHours(12,0,0,0);const k=x.getDay()||7;x.setDate(x.getDate()-k+1);return x};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=m=>{try{if(typeof showToast==='function')showToast(m)}catch(_){}};
function adminVisible(){
  if(document.getElementById('cfCompanyUsersCard')) return true;
  try{return typeof cfIsAdmin==='function'&&cfIsAdmin()}catch(_){return false}
}
function ensureTile(){
  const grid=document.getElementById('cfCompanyGrid');
  if(!grid||!adminVisible())return false;
  let tile=document.getElementById('cfCalendarTile');
  if(tile)return true;
  tile=document.createElement('button');
  tile.type='button';
  tile.id='cfCalendarTile';
  tile.className='cf-company-card cf-company-utility-card cf-calendar-tile';
  tile.innerHTML='<div><strong>Kalendarz</strong><span>Plan pracy i terminy zleceń</span></div>';
  tile.addEventListener('click',openCalendar);
  const employees=document.getElementById('cfCompanyUsersCard');
  if(employees) grid.insertBefore(tile,employees);
  else grid.prepend(tile);
  return true;
}
function ensureModal(){
  let m=document.getElementById('cfCalendarModal1201');
  if(m)return m;
  m=document.createElement('div');
  m.id='cfCalendarModal1201';m.className='cf-cal-modal';
  m.innerHTML='<div class="cf-cal-panel"><div class="cf-cal-mhead"><div><div class="cf-cal-mtitle">Kalendarz pracy</div><div class="cf-cal-msub">Przeciągnij auto na inny dzień, aby zmienić termin tego samego wpisu.</div></div><button class="cf-cal-close" type="button">×</button></div><div class="cf-cal-toolbar"><div class="cf-cal-range"></div><div class="cf-cal-nav"><button data-prev>←</button><button data-today>Dziś</button><button data-next>→</button></div></div><div class="cf-cal-body"><div class="cf-cal-empty2">Ładowanie kalendarza…</div></div></div>';
  document.body.appendChild(m);
  m.querySelector('.cf-cal-close').onclick=()=>m.classList.remove('open');
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')});
  m.querySelector('[data-prev]').onclick=()=>{weekStart=add(weekStart||mon(new Date()),-7);render()};
  m.querySelector('[data-next]').onclick=()=>{weekStart=add(weekStart||mon(new Date()),7);render()};
  m.querySelector('[data-today]').onclick=()=>{weekStart=mon(new Date());render()};
  m.addEventListener('dragstart',e=>{const c=e.target.closest('[data-id]');if(!c)return;draggedId=c.dataset.id;c.classList.add('dragging');try{e.dataTransfer.setData('text/plain',draggedId);e.dataTransfer.effectAllowed='move'}catch(_){}});
  m.addEventListener('dragend',e=>{e.target.closest('[data-id]')?.classList.remove('dragging');draggedId=null;m.querySelectorAll('.over').forEach(x=>x.classList.remove('over'))});
  m.addEventListener('dragover',e=>{const z=e.target.closest('[data-date],[data-uns]');if(!z)return;e.preventDefault();m.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));z.classList.add('over')});
  m.addEventListener('drop',async e=>{const z=e.target.closest('[data-date],[data-uns]');if(!z)return;e.preventDefault();const id=draggedId||e.dataTransfer?.getData('text/plain');if(id)await moveRecord(id,z.dataset.uns!==undefined?'':z.dataset.date)});
  let pt=null;
  m.addEventListener('pointerdown',e=>{const c=e.target.closest('[data-id]');if(!c||e.pointerType==='mouse')return;pt={id:c.dataset.id,x:e.clientX,y:e.clientY,active:false};c.setPointerCapture?.(e.pointerId)});
  m.addEventListener('pointermove',e=>{if(!pt)return;const dist=Math.hypot(e.clientX-pt.x,e.clientY-pt.y);if(dist<10&&!pt.active)return;pt.active=true;e.preventDefault();m.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-date],[data-uns]')?.classList.add('over')},{passive:false});
  m.addEventListener('pointerup',async e=>{if(!pt)return;const p=pt;pt=null;if(!p.active)return;const z=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-date],[data-uns]');m.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));if(z)await moveRecord(p.id,z.dataset.uns!==undefined?'':z.dataset.date)});
  return m;
}
const recDate=r=>r.order_due_date||r.schedule_proposed_date||'';
function item(r){const c=companies.get(r.company_id);const cn=c?(c.short_name||c.name):'Firma';const meta=[r.type,r.brand].filter(Boolean).join(' · ');return `<div class="cf-cal-item" draggable="true" data-id="${esc(r.id)}"><div class="cf-cal-plate2">${esc(r.plate)}</div><div class="cf-cal-company2">${esc(cn)}</div>${meta?`<div class="cf-cal-meta2">${esc(meta)}</div>`:''}</div>`}
function render(){
  const m=ensureModal(),body=m.querySelector('.cf-cal-body'),start=weekStart||mon(new Date());weekStart=start;
  const today=ymd(new Date()),cols=[];
  for(let i=0;i<7;i++){
    const d=add(start,i),ds=ymd(d),list=rows.filter(r=>recDate(r)===ds);
    cols.push(`<section class="cf-cal-day2 ${ds===today?'today':''}" data-date="${ds}"><div class="cf-cal-dayhead"><div><div class="cf-cal-dayname">${d.toLocaleDateString('pl-PL',{weekday:'short'}).replace('.','').toUpperCase()}</div><div class="cf-cal-date">${d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})}</div></div><div class="cf-cal-count">${list.length}</div></div><div class="cf-cal-list">${list.map(item).join('')}</div></section>`)
  }
  const uns=rows.filter(r=>!recDate(r));
  body.innerHTML=`<div class="cf-cal-week">${cols.join('')}</div><div class="cf-cal-uns" data-uns><div class="cf-cal-uns-title">Bez terminu</div><div class="cf-cal-uns-list">${uns.length?uns.map(item).join(''):'<span style="font-size:10px;color:#777">Brak wpisów bez terminu</span>'}</div></div>`;
  m.querySelector('.cf-cal-range').textContent=`${start.toLocaleDateString('pl-PL')} – ${add(start,6).toLocaleDateString('pl-PL')}`;
}
async function load(){
  if(loading||typeof cfSupabase==='undefined'||!cfSupabase)return;loading=true;
  try{
    const [a,b]=await Promise.all([
      cfSupabase.from('companies').select('id,name,short_name').eq('active',true),
      cfSupabase.from('wash_records').select('id,company_id,plate,type,brand,order_due_date,schedule_proposed_date,wash_date,schedule_status').is('wash_date',null).order('created_at',{ascending:false})
    ]);
    if(a.error)throw a.error;if(b.error)throw b.error;
    companies=new Map((a.data||[]).map(x=>[x.id,x]));rows=(b.data||[]).filter(x=>x.company_id);render();
  }catch(e){console.error('CleanFleet calendar',e);ensureModal().querySelector('.cf-cal-body').innerHTML='<div class="cf-cal-empty2">Nie udało się pobrać kalendarza.</div>'}
  finally{loading=false}
}
async function moveRecord(id,date){
  const r=rows.find(x=>x.id===id);if(!r||typeof cfSupabase==='undefined')return;const old=recDate(r);if(old===date)return;
  try{
    if(date){const {error}=await cfSupabase.rpc('cf_admin_confirm_wash_schedule',{p_wash_record_id:id,p_confirmed_date:date,p_note:null});if(error)throw error;r.order_due_date=date;r.schedule_proposed_date=null;r.schedule_status='accepted'}
    else{const {error}=await cfSupabase.from('wash_records').update({order_due_date:null,schedule_proposed_date:null,schedule_status:null}).eq('id',id);if(error)throw error;r.order_due_date=null;r.schedule_proposed_date=null;r.schedule_status=null}
    render();toast(date?`Termin ${r.plate}: ${date}`:`${r.plate}: usunięto termin`)
  }catch(e){console.error(e);toast('Nie udało się zmienić terminu');await load()}
}
async function openCalendar(){const m=ensureModal();m.classList.add('open');await load()}
function hookRender(){
  if(typeof window.cfRenderCompanyChooser!=='function'||window.cfRenderCompanyChooser.__calendarHook)return;
  const original=window.cfRenderCompanyChooser;
  const wrapped=function(...args){const out=original.apply(this,args);setTimeout(ensureTile,0);return out};
  wrapped.__calendarHook=true;window.cfRenderCompanyChooser=wrapped;
}
function boot(){
  hookRender();ensureModal();ensureTile();
  [250,600,1200,2500,5000,9000].forEach(ms=>setTimeout(()=>{hookRender();ensureTile()},ms));
  window.addEventListener('focus',()=>setTimeout(ensureTile,0));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
