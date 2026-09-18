(() => {
  'use strict';

  const PHOTO_BUCKET='zdjecia';
  const CAL_DAYS=7;
  let calendarWeekStart=null;
  let calendarRows=[];
  let calendarCompanies=new Map();
  let calendarLoading=false;
  let photoState=null;

  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  const localYmd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
  const parseYmd=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3],12,0,0):null;};
  const mondayOf=d=>{const x=new Date(d);x.setHours(12,0,0,0);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);return x;};
  const fmtShort=d=>d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});
  const fmtLong=d=>d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
  const dayName=d=>d.toLocaleDateString('pl-PL',{weekday:'short'}).replace('.','').toUpperCase();
  const toast=msg=>{try{if(typeof showToast==='function')showToast(msg);else console.info(msg);}catch(_){console.info(msg);}};
  const dbReady=()=>typeof cfSupabase!=='undefined'&&cfSupabase;
  const isAdmin=()=>{try{return typeof cfIsAdmin==='function'&&cfIsAdmin();}catch(_){return false;}};

  function slug(v,fallback='inne'){
    const s=String(v||fallback).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    return s||fallback;
  }
  function plateSlug(v){return String(v||'BEZ-TABLICY').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'BEZ-TABLICY';}

  function ensureStyles(){
    if(document.getElementById('cfOps1200Styles'))return;
    const s=document.createElement('style');
    s.id='cfOps1200Styles';
    s.textContent=`
      .cf-cal{margin:18px 0 20px;border:1px solid var(--line,#ddd);border-radius:14px;background:#fff;overflow:hidden}
      .cf-cal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line,#ddd)}
      .cf-cal-title{font-size:15px;font-weight:800}.cf-cal-sub{font-size:10px;color:var(--ink-soft,#777);margin-top:2px}
      .cf-cal-nav{display:flex;align-items:center;gap:6px}.cf-cal-nav button{border:1px solid var(--line-strong,#ccc);background:#fff;border-radius:8px;padding:7px 9px;font:700 11px/1 system-ui;cursor:pointer;color:var(--ink,#111)}
      .cf-cal-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .cf-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));min-width:910px}
      .cf-cal-day{min-height:150px;border-right:1px solid var(--line,#eee);background:#fff}.cf-cal-day:last-child{border-right:0}
      .cf-cal-day.is-today{background:#fbfcfa}.cf-cal-day.is-over{outline:2px solid #48a868;outline-offset:-2px}
      .cf-cal-day-head{position:sticky;top:0;z-index:1;background:inherit;padding:8px 9px 7px;border-bottom:1px solid var(--line,#eee);display:flex;align-items:center;justify-content:space-between;gap:5px}
      .cf-cal-day-name{font-size:10px;font-weight:900}.cf-cal-day-date{font-size:10px;color:var(--ink-soft,#777)}.cf-cal-count{font-size:9px;color:var(--ink-soft,#777)}
      .cf-cal-items{padding:7px;display:flex;flex-direction:column;gap:6px;min-height:105px}
      .cf-cal-card{border:1px solid #dfe5e1;border-left:4px solid #48a868;border-radius:9px;background:#fff;padding:7px 7px 7px 8px;box-shadow:0 2px 8px rgba(0,0,0,.035);cursor:grab;touch-action:pan-y;user-select:none}
      .cf-cal-card:active{cursor:grabbing}.cf-cal-card.dragging{opacity:.45}.cf-cal-plate{font-size:11px;font-weight:900;letter-spacing:.02em}.cf-cal-company{font-size:9px;color:var(--ink-soft,#777);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cf-cal-meta{font-size:9px;color:var(--ink-soft,#777);margin-top:3px}
      .cf-cal-unscheduled{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-top:1px solid var(--line,#eee);background:#fafafa}.cf-cal-unscheduled-label{font-size:10px;font-weight:800;min-width:82px;padding-top:6px}.cf-cal-unscheduled-items{display:flex;gap:7px;overflow-x:auto;flex:1;min-height:40px}.cf-cal-unscheduled .cf-cal-card{min-width:125px;max-width:180px}.cf-cal-unscheduled.is-over{outline:2px solid #48a868;outline-offset:-2px}
      .cf-cal-empty{padding:18px;text-align:center;color:var(--ink-soft,#777);font-size:11px}
      .cf-cal-ghost{position:fixed;z-index:100000;pointer-events:none;transform:translate(-50%,-50%) rotate(1deg);width:150px;opacity:.92;box-shadow:0 10px 30px rgba(0,0,0,.2)}
      .cf-photo-btn{margin-left:6px;border:0;background:transparent;padding:2px 4px;font:700 10px/1.2 system-ui;color:var(--ink-soft,#666);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .cf-photo-overlay{position:fixed;inset:0;z-index:120000;background:rgba(0,0,0,.42);display:none;align-items:center;justify-content:center;padding:18px}.cf-photo-overlay.open{display:flex}
      .cf-photo-modal{width:min(720px,100%);max-height:min(88vh,820px);overflow:auto;background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,.15);box-shadow:0 18px 55px rgba(0,0,0,.28)}
      .cf-photo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 16px 12px;border-bottom:1px solid var(--line,#eee)}.cf-photo-title{font-size:17px;font-weight:900}.cf-photo-sub{font-size:10px;color:var(--ink-soft,#777);margin-top:3px}.cf-photo-close{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;padding:2px 5px}
      .cf-photo-body{padding:14px 16px 16px}.cf-photo-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.cf-photo-tab{border:1px solid var(--line-strong,#ccc);background:#fff;border-radius:9px;padding:10px;font-weight:900;font-size:12px;cursor:pointer}.cf-photo-tab.active{background:#16150f;color:#fff;border-color:#16150f}
      .cf-photo-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.cf-photo-actions button{border:1px solid var(--line-strong,#ccc);background:#fff;border-radius:9px;padding:10px 12px;font-weight:800;font-size:11px;cursor:pointer}.cf-photo-actions .primary{background:#48a868;border-color:#48a868;color:#fff}.cf-photo-actions button:disabled{opacity:.5;cursor:default}
      .cf-photo-section-title{font-size:10px;font-weight:900;color:var(--ink-soft,#777);margin:12px 0 7px;text-transform:uppercase;letter-spacing:.05em}
      .cf-photo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cf-photo-thumb{position:relative;aspect-ratio:1/1;border-radius:9px;overflow:hidden;background:#eee;border:1px solid #e1e1dd}.cf-photo-thumb img{width:100%;height:100%;object-fit:cover;display:block}.cf-photo-remove{position:absolute;right:5px;top:5px;width:25px;height:25px;border-radius:50%;border:0;background:rgba(0,0,0,.72);color:#fff;font-size:15px;cursor:pointer}.cf-photo-saved a{display:block;width:100%;height:100%}.cf-photo-note{font-size:10px;color:var(--ink-soft,#777);line-height:1.4;margin-top:10px}.cf-photo-status{font-size:11px;font-weight:700;margin:8px 0;color:var(--ink-soft,#777)}
      @media(max-width:620px){.cf-photo-overlay{padding:8px}.cf-photo-modal{max-height:94vh;border-radius:14px}.cf-photo-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cf-cal{margin-top:14px}.cf-cal-head{padding:10px 11px}.cf-cal-grid{grid-template-columns:repeat(7,minmax(112px,1fr));min-width:784px}}
    `;
    document.head.appendChild(s);
  }

  function ensureCalendar(){
    const shell=document.querySelector('#cfCompanyOverlay .cf-company-shell');
    if(!shell)return null;
    let root=document.getElementById('cfAdminCalendar');
    if(root)return root;
    root=document.createElement('section');
    root.id='cfAdminCalendar';
    root.className='cf-cal';
    root.innerHTML=`<div class="cf-cal-head"><div><div class="cf-cal-title">Plan pracy</div><div class="cf-cal-sub">Przeciągnij wpis na inny dzień, aby zmienić termin w firmie.</div></div><div class="cf-cal-nav"><button type="button" data-cal-prev>←</button><button type="button" data-cal-today>Dziś</button><button type="button" data-cal-next>→</button></div></div><div data-cal-body><div class="cf-cal-empty">Ładowanie kalendarza…</div></div>`;
    const anchor=shell.querySelector('.cf-company-search-box')||shell.querySelector('#cfCompanyGrid');
    if(anchor)anchor.insertAdjacentElement('beforebegin',root);else shell.appendChild(root);
    root.querySelector('[data-cal-prev]')?.addEventListener('click',()=>{calendarWeekStart=addDays(calendarWeekStart||mondayOf(new Date()),-7);renderCalendar();});
    root.querySelector('[data-cal-next]')?.addEventListener('click',()=>{calendarWeekStart=addDays(calendarWeekStart||mondayOf(new Date()),7);renderCalendar();});
    root.querySelector('[data-cal-today]')?.addEventListener('click',()=>{calendarWeekStart=mondayOf(new Date());renderCalendar();});
    root.addEventListener('dragstart',onCalendarDragStart);
    root.addEventListener('dragend',onCalendarDragEnd);
    root.addEventListener('dragover',onCalendarDragOver);
    root.addEventListener('dragleave',onCalendarDragLeave);
    root.addEventListener('drop',onCalendarDrop);
    root.addEventListener('pointerdown',onPointerDragStart);
    return root;
  }

  function recordDate(r){return r.order_due_date||r.schedule_proposed_date||'';}
  function companyName(id){const c=calendarCompanies.get(id);return c?(c.short_name||c.name||'Firma'):'Firma';}
  function calendarCard(r){
    const meta=[r.type||'',r.brand||''].filter(Boolean).join(' · ');
    return `<div class="cf-cal-card" draggable="true" data-cal-record="${esc(r.id)}" title="Przeciągnij, aby zmienić termin"><div class="cf-cal-plate">${esc(r.plate)}</div><div class="cf-cal-company">${esc(companyName(r.company_id))}</div>${meta?`<div class="cf-cal-meta">${esc(meta)}</div>`:''}</div>`;
  }
  function renderCalendar(){
    const root=ensureCalendar();if(!root)return;
    if(!isAdmin()){root.remove();return;}
    const body=root.querySelector('[data-cal-body]');if(!body)return;
    const start=calendarWeekStart||mondayOf(new Date());calendarWeekStart=start;
    const today=localYmd(new Date());
    const cols=[];
    for(let i=0;i<CAL_DAYS;i++){
      const d=addDays(start,i),ymd=localYmd(d);
      const items=calendarRows.filter(r=>recordDate(r)===ymd);
      cols.push(`<section class="cf-cal-day ${ymd===today?'is-today':''}" data-cal-date="${ymd}"><div class="cf-cal-day-head"><div><div class="cf-cal-day-name">${dayName(d)}</div><div class="cf-cal-day-date">${fmtShort(d)}</div></div><div class="cf-cal-count">${items.length}</div></div><div class="cf-cal-items">${items.map(calendarCard).join('')}</div></section>`);
    }
    const unscheduled=calendarRows.filter(r=>!recordDate(r));
    body.innerHTML=`<div class="cf-cal-scroll"><div class="cf-cal-grid">${cols.join('')}</div></div><div class="cf-cal-unscheduled" data-cal-unscheduled><div class="cf-cal-unscheduled-label">Bez terminu</div><div class="cf-cal-unscheduled-items">${unscheduled.length?unscheduled.map(calendarCard).join(''):'<span class="cf-cal-sub" style="padding:7px 0">Brak wpisów bez terminu</span>'}</div></div>`;
    const end=addDays(start,6);
    const sub=root.querySelector('.cf-cal-sub');
    if(sub)sub.textContent=`${fmtLong(start)} – ${fmtLong(end)} · przeciągnięcie wpisu zmienia termin w firmie`;
  }

  async function refreshCalendar(){
    if(calendarLoading||!isAdmin()||!dbReady())return;
    calendarLoading=true;
    const root=ensureCalendar();
    try{
      const [cr,rr]=await Promise.all([
        cfSupabase.from('companies').select('id,name,short_name').eq('active',true).order('name'),
        cfSupabase.from('wash_records').select('id,company_id,plate,type,brand,order_date,order_due_date,wash_date,approved,paid,schedule_status,schedule_proposed_date,priority').is('wash_date',null).order('created_at',{ascending:false})
      ]);
      if(cr.error)throw cr.error;if(rr.error)throw rr.error;
      calendarCompanies=new Map((cr.data||[]).map(c=>[c.id,c]));
      calendarRows=(rr.data||[]).filter(r=>r.company_id);
      renderCalendar();
    }catch(e){console.error('CleanFleet calendar',e);if(root){const b=root.querySelector('[data-cal-body]');if(b)b.innerHTML='<div class="cf-cal-empty">Nie udało się pobrać kalendarza.</div>';}}
    finally{calendarLoading=false;}
  }

  let nativeDraggedId=null;
  function onCalendarDragStart(e){const card=e.target.closest('[data-cal-record]');if(!card)return;nativeDraggedId=card.dataset.calRecord;card.classList.add('dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',nativeDraggedId);}catch(_){}}
  function onCalendarDragEnd(e){e.target.closest('[data-cal-record]')?.classList.remove('dragging');nativeDraggedId=null;document.querySelectorAll('.cf-cal-day.is-over,.cf-cal-unscheduled.is-over').forEach(x=>x.classList.remove('is-over'));}
  function targetZone(el){return el?.closest?.('[data-cal-date],[data-cal-unscheduled]')||null;}
  function onCalendarDragOver(e){const z=targetZone(e.target);if(!z)return;e.preventDefault();document.querySelectorAll('.cf-cal-day.is-over,.cf-cal-unscheduled.is-over').forEach(x=>x.classList.remove('is-over'));z.classList.add('is-over');}
  function onCalendarDragLeave(e){const z=targetZone(e.target);if(z&&!z.contains(e.relatedTarget))z.classList.remove('is-over');}
  async function onCalendarDrop(e){const z=targetZone(e.target);if(!z)return;e.preventDefault();z.classList.remove('is-over');let id=nativeDraggedId;try{id=e.dataTransfer.getData('text/plain')||id;}catch(_){}if(!id)return;await moveCalendarRecord(id,z.dataset.calDate||'');}

  let pointerDrag=null;
  function onPointerDragStart(e){
    if(e.pointerType==='mouse')return;
    const card=e.target.closest('[data-cal-record]');if(!card)return;
    pointerDrag={id:card.dataset.calRecord,startX:e.clientX,startY:e.clientY,active:false,card,ghost:null,zone:null,pointerId:e.pointerId};
    card.setPointerCapture?.(e.pointerId);
    const move=ev=>{
      if(!pointerDrag||ev.pointerId!==pointerDrag.pointerId)return;
      const dx=ev.clientX-pointerDrag.startX,dy=ev.clientY-pointerDrag.startY;
      if(!pointerDrag.active&&Math.hypot(dx,dy)<10)return;
      if(!pointerDrag.active){pointerDrag.active=true;pointerDrag.card.classList.add('dragging');const g=pointerDrag.card.cloneNode(true);g.classList.add('cf-cal-ghost');g.removeAttribute('draggable');document.body.appendChild(g);pointerDrag.ghost=g;}
      ev.preventDefault();
      pointerDrag.ghost.style.left=ev.clientX+'px';pointerDrag.ghost.style.top=ev.clientY+'px';
      pointerDrag.ghost.style.display='none';const under=document.elementFromPoint(ev.clientX,ev.clientY);pointerDrag.ghost.style.display='';
      const z=targetZone(under);if(pointerDrag.zone!==z){pointerDrag.zone?.classList.remove('is-over');pointerDrag.zone=z;z?.classList.add('is-over');}
    };
    const up=async ev=>{
      if(!pointerDrag||ev.pointerId!==pointerDrag.pointerId)return;
      document.removeEventListener('pointermove',move,{capture:true});document.removeEventListener('pointerup',up,{capture:true});document.removeEventListener('pointercancel',up,{capture:true});
      const d=pointerDrag;pointerDrag=null;d.card.classList.remove('dragging');d.ghost?.remove();d.zone?.classList.remove('is-over');
      if(d.active&&d.zone)await moveCalendarRecord(d.id,d.zone.dataset.calDate||'');
    };
    document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,{capture:true});document.addEventListener('pointercancel',up,{capture:true});
  }

  async function moveCalendarRecord(id,date){
    const rec=calendarRows.find(r=>r.id===id);if(!rec||!dbReady())return;
    const old=recordDate(rec);if(old===date)return;
    const optimistic={...rec,order_due_date:date||null,schedule_proposed_date:null,schedule_status:date?'accepted':null};
    calendarRows=calendarRows.map(r=>r.id===id?optimistic:r);renderCalendar();
    try{
      if(date){
        const {error}=await cfSupabase.rpc('cf_admin_confirm_wash_schedule',{p_wash_record_id:id,p_confirmed_date:date,p_note:'Termin ustawiony w kalendarzu administratora'});
        if(error)throw error;
        toast(`Termin ${rec.plate}: ${fmtLong(parseYmd(date))}`);
      }else{
        const {error}=await cfSupabase.from('wash_records').update({order_due_date:null,schedule_status:null,schedule_proposed_date:null,schedule_proposed_by:null,schedule_proposed_at:null,schedule_confirmed_by:null,schedule_confirmed_at:null}).eq('id',id);
        if(error)throw error;toast(`Usunięto termin ${rec.plate}`);
      }
      await refreshCalendar();
    }catch(e){console.error('CleanFleet calendar move',e);calendarRows=calendarRows.map(r=>r.id===id?rec:r);renderCalendar();toast('Nie udało się zmienić terminu.');}
  }

  function ensurePhotoModal(){
    let o=document.getElementById('cfPhotoOverlay');if(o)return o;
    o=document.createElement('div');o.id='cfPhotoOverlay';o.className='cf-photo-overlay';o.setAttribute('aria-hidden','true');
    o.innerHTML=`<div class="cf-photo-modal" role="dialog" aria-modal="true" aria-label="Zdjęcia wpisu"><div class="cf-photo-head"><div><div class="cf-photo-title" id="cfPhotoTitle">Zdjęcia</div><div class="cf-photo-sub" id="cfPhotoSub"></div></div><button type="button" class="cf-photo-close" data-photo-close aria-label="Zamknij">×</button></div><div class="cf-photo-body"><div class="cf-photo-tabs"><button type="button" class="cf-photo-tab active" data-photo-kind="przed">PRZED</button><button type="button" class="cf-photo-tab" data-photo-kind="po">PO</button></div><div class="cf-photo-actions"><button type="button" data-photo-add>📷 Dodaj zdjęcie</button><button type="button" class="primary" data-photo-save>Zapisz zdjęcia</button><input type="file" data-photo-input accept="image/*" multiple hidden></div><div class="cf-photo-status" data-photo-status></div><div class="cf-photo-section-title">Nowe zdjęcia przed zapisem</div><div class="cf-photo-grid" data-photo-pending></div><div class="cf-photo-section-title">Zapisane zdjęcia</div><div class="cf-photo-grid cf-photo-saved" data-photo-saved></div><div class="cf-photo-note">Zdjęcia są zapisane tylko na tym urządzeniu. ZIP zawiera foldery <strong>typ / data / tablica / przed|po</strong>.</div></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click',e=>{if(e.target===o||e.target.closest('[data-photo-close]'))closePhotoModal();});
    o.querySelectorAll('[data-photo-kind]').forEach(b=>b.addEventListener('click',()=>{if(!photoState||photoState.busy)return;photoState.kind=b.dataset.photoKind;renderPhotoModal();}));
    o.querySelector('[data-photo-add]')?.addEventListener('click',()=>o.querySelector('[data-photo-input]')?.click());
    o.querySelector('[data-photo-input]')?.addEventListener('change',onPhotoFiles);
    o.querySelector('[data-photo-save]')?.addEventListener('click',savePendingPhotos);
    o.querySelector('[data-photo-pending]')?.addEventListener('click',e=>{const b=e.target.closest('[data-photo-remove]');if(!b||!photoState||photoState.busy)return;const arr=photoState.pending[photoState.kind];const idx=Number(b.dataset.photoRemove);if(arr[idx])URL.revokeObjectURL(arr[idx].url);arr.splice(idx,1);renderPhotoModal();});
    return o;
  }

  async function openPhotos(recordId){
    if(!isAdmin())return;
    if(photoState?.busy)return;
    const overlay=ensurePhotoModal();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    photoState={record:{id:recordId,plate:'',type:'',brand:''},kind:'przed',existing:[],pending:{przed:[],po:[]},signed:new Map(),busy:false};
    renderPhotoModal();
    document.dispatchEvent(new CustomEvent('cf:photos-open',{detail:{recordId}}));
    const status=overlay.querySelector('[data-photo-status]');
    if(status)status.textContent='Zdjęcia są zapisywane lokalnie na tym urządzeniu.';
    if(!dbReady())return;
    try{
      const {data:rec,error}=await cfSupabase.from('wash_records').select('id,company_id,plate,type,brand,order_date,order_due_date,wash_date,schedule_proposed_date').eq('id',recordId).maybeSingle();
      if(error)throw error;
      if(rec&&photoState&&String(photoState.record?.id)===String(recordId)){
        photoState.record=rec;
        renderPhotoModal();
        if(status)status.textContent='Zdjęcia są zapisywane lokalnie na tym urządzeniu.';
      }
    }catch(e){
      console.warn('CleanFleet local photo metadata',e);
      if(status)status.textContent='Zdjęcia są zapisywane lokalnie na tym urządzeniu.';
    }
  }
  function closePhotoModal(){if(photoState?.busy)return;const o=document.getElementById('cfPhotoOverlay');if(o){o.classList.remove('open');o.setAttribute('aria-hidden','true');}if(photoState){Object.values(photoState.pending).flat().forEach(x=>URL.revokeObjectURL(x.url));}photoState=null;}
  async function loadSignedUrls(){
    if(!photoState)return;
    const missing=photoState.existing.filter(r=>!photoState.signed.has(r.storage_path));
    await Promise.all(missing.map(async r=>{const {data,error}=await cfSupabase.storage.from(PHOTO_BUCKET).createSignedUrl(r.storage_path,3600);if(!error&&data?.signedUrl)photoState.signed.set(r.storage_path,data.signedUrl);}));
  }
  function renderPhotoModal(){
    const o=ensurePhotoModal(),s=photoState;if(!s)return;
    o.querySelector('#cfPhotoTitle').textContent=`Zdjęcia · ${s.record.plate}`;
    o.querySelector('#cfPhotoSub').textContent=[s.record.type,s.record.brand].filter(Boolean).join(' · ');
    o.querySelectorAll('[data-photo-kind]').forEach(b=>b.classList.toggle('active',b.dataset.photoKind===s.kind));
    const arr=s.pending[s.kind];
    o.querySelector('[data-photo-pending]').innerHTML=arr.length?arr.map((x,i)=>`<div class="cf-photo-thumb"><img src="${esc(x.url)}" alt="Nowe zdjęcie"><button type="button" class="cf-photo-remove" data-photo-remove="${i}" aria-label="Usuń">×</button></div>`).join(''):'<div class="cf-photo-sub">Brak nowych zdjęć.</div>';
    const saved=s.existing.filter(r=>r.kind===s.kind);
    o.querySelector('[data-photo-saved]').innerHTML=saved.length?saved.map(r=>{const u=s.signed.get(r.storage_path);return u?`<div class="cf-photo-thumb"><a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Zapisane zdjęcie"></a></div>`:'';}).join(''):'<div class="cf-photo-sub">Brak zapisanych zdjęć.</div>';
    const save=o.querySelector('[data-photo-save]');save.disabled=s.busy||!arr.length;save.textContent=s.busy?'Zapisywanie…':'Zapisz zdjęcia';
    o.querySelector('[data-photo-add]').disabled=s.busy;
    o.querySelector('[data-photo-status]').textContent=s.busy?'Zapisywanie lokalnie…':'Zdjęcia są zapisywane lokalnie na tym urządzeniu.';
    document.dispatchEvent(new CustomEvent('cf:photos-render'));
  }
  function addPhotoFiles(files){
    if(!photoState||photoState.busy)return false;
    [...files].forEach(file=>photoState.pending[photoState.kind].push({file,url:URL.createObjectURL(file)}));
    renderPhotoModal();return true;
  }
  function onPhotoFiles(e){addPhotoFiles(e.target.files||[]);e.target.value='';}

  // One pending queue shared by the camera, preview and local persistence.
  window.cfPhotoSession={
    get:()=>photoState,
    addFiles:addPhotoFiles,
    setBusy(value){if(photoState){photoState.busy=value;renderPhotoModal();}},
    committed(recordId,kind,items){
      if(!photoState||String(photoState.record.id)!==String(recordId))return;
      photoState.pending[kind]=photoState.pending[kind].filter(item=>{
        if(!items.includes(item))return true;
        URL.revokeObjectURL(item.url);return false;
      });
      renderPhotoModal();
    }
  };

  async function jpegBlob(file){
    if(file.type==='image/jpeg'&&file.size<=3500000)return file;
    let bitmap=null;
    try{bitmap=await createImageBitmap(file);}catch(_){return file;}
    const max=2000,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bitmap,0,0,w,h);bitmap.close?.();
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Konwersja zdjęcia nie powiodła się')),'image/jpeg',.86));return blob;
  }
  function photoBasePath(){
    const s=photoState;if(!s)return'';
    const first=s.existing[0]?.storage_path;if(first){const parts=first.split('/');if(parts.length>=4)return parts.slice(0,3).join('/');}
    const r=s.record,date=r.wash_date||r.order_due_date||r.schedule_proposed_date||r.order_date||localYmd(new Date());
    return `${slug(r.type)}/${date}/${plateSlug(r.plate)}`;
  }
  async function savePendingPhotos(){
    // Never fall back to server uploads when the local module fails to load.
    toast('Moduł zapisu lokalnego nie jest gotowy. Odśwież aplikację.');
  }

  function bindPhotoButton(b,id){
    if(!b||!id||b.dataset.cfPhotoBound==='1')return;
    b.dataset.cfPhotoBound='1';
    b.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openPhotos(id);
    });
  }

  function augmentPhotoButtons(){
    const list=document.getElementById('recordsList');if(!list)return;
    const admin=isAdmin()||document.body?.dataset?.cfRole==='admin';
    if(!admin){
      list.querySelectorAll('[data-cf-photos]').forEach(b=>b.remove());
      return;
    }
    list.querySelectorAll('.record-card').forEach(card=>{
      const opener=card.querySelector('[data-open]');if(!opener)return;
      const id=opener.dataset.open;
      if(!id)return;

      const existing=card.querySelector('[data-cf-photos]');
      if(existing){
        bindPhotoButton(existing,id);
        return;
      }

      const line=card.querySelector('.record-plate-line')||opener;
      const b=document.createElement('button');
      b.type='button';
      b.className='cf-photo-btn';
      b.dataset.cfPhotos=id;
      b.textContent='📷';
      b.title='Zdjęcia PRZED / PO';
      b.setAttribute('aria-label','Zdjęcia PRZED / PO');
      bindPhotoButton(b,id);
      line.appendChild(b);
    });
  }
  function initPhotoButtons(){
    let observedList=null;
    let listObserver=null;
    const attach=()=>{
      const list=document.getElementById('recordsList');
      if(!list)return false;
      augmentPhotoButtons();
      if(list!==observedList){
        try{listObserver?.disconnect()}catch(_){}
        listObserver=new MutationObserver(()=>augmentPhotoButtons());
        listObserver.observe(list,{childList:true,subtree:true});
        observedList=list;
      }
      return true;
    };
    attach();
    const bodyObserver=new MutationObserver(()=>attach());
    bodyObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-cf-role']});
    window.cfOpenPhotos=openPhotos;
  }

  function initCalendarObserver(){
    const overlay=document.getElementById('cfCompanyOverlay');if(!overlay)return;
    const maybe=()=>{if(overlay.classList.contains('open')&&isAdmin())refreshCalendar();};
    new MutationObserver(maybe).observe(overlay,{attributes:true,attributeFilter:['class']});
    maybe();setTimeout(maybe,1000);setTimeout(maybe,3000);
  }

  function start(){ensureStyles();ensurePhotoModal();initPhotoButtons();initCalendarObserver();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

