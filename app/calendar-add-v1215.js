(()=>{
  'use strict';

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let busy=false;

  function toast(msg){try{if(typeof showToast==='function')showToast(msg);}catch(_){}}

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function ensureStyles(){
    if(document.getElementById('cfCalAdd1215Styles'))return;
    const s=document.createElement('style');
    s.id='cfCalAdd1215Styles';
    s.textContent=`
      .cf-cal1215-pick{position:absolute;inset:0;z-index:80;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:18px}
      .cf-cal1215-box{width:min(430px,92vw);max-height:80vh;overflow:auto;background:#fff;border-radius:14px;padding:16px;box-shadow:0 14px 40px rgba(0,0,0,.24)}
      .cf-cal1215-title{font-size:16px;font-weight:900;margin-bottom:5px}
      .cf-cal1215-sub{font-size:11px;color:#777;margin-bottom:12px}
      .cf-cal1215-list{display:grid;gap:8px}
      .cf-cal1215-company{width:100%;text-align:left;border:1px solid #ddd;border-radius:10px;background:#fff;padding:12px;font-size:13px;font-weight:800;cursor:pointer;color:#16150f}
      .cf-cal1215-company:active{background:#f4f7e7}
      .cf-cal1215-cancel{width:100%;margin-top:10px;border:0;background:transparent;text-decoration:underline;color:#666;padding:9px;cursor:pointer}
      .cf-cal1215-status{font-size:11px;color:#666;margin-top:10px;min-height:16px}
    `;
    document.head.appendChild(s);
  }

  async function getCompanies(){
    if(typeof cfSupabase==='undefined')throw new Error('Brak połączenia z bazą');

    // Kalendarz globalny ma korzystać z tej samej pełnej listy firm co panel administratora.
    // Bez filtra active=true — firma zapisana w bazie ma być dostępna w wyborze.
    try{
      const admin=await cfSupabase.rpc('cf_admin_companies_list');
      if(!admin.error && Array.isArray(admin.data)){
        return [...admin.data].sort((a,b)=>String(a.short_name||a.name||'').localeCompare(String(b.short_name||b.name||''),'pl'));
      }
    }catch(_){}

    // Dla pracownika CleanFleet korzystamy z analogicznego RPC z jego zakresem dostępu.
    try{
      const staff=await cfSupabase.rpc('cf_staff_companies_list');
      if(!staff.error && Array.isArray(staff.data)){
        return [...staff.data].sort((a,b)=>String(a.short_name||a.name||'').localeCompare(String(b.short_name||b.name||''),'pl'));
      }
    }catch(_){}

    // Fallback: wszystkie firmy widoczne przez RLS, również nieaktywne.
    const {data,error}=await cfSupabase.from('companies').select('id,name,short_name,active').order('name');
    if(error)throw error;
    return data||[];
  }

  function setFormDate(date){
    let tries=0;
    const apply=()=>{
      const input=document.getElementById('f_data_prania');
      if(input){
        input.value=date;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return;
      }
      if(++tries<60)setTimeout(apply,50);
    };
    apply();
  }

  async function enterCompanyThroughNativeCard(companyId){
    const selector=`#cfCompanyGrid [data-company-id="${CSS.escape(String(companyId))}"]`;
    let card=document.querySelector(selector);
    if(!card){
      for(let i=0;i<30&&!card;i++){
        await sleep(50);
        card=document.querySelector(selector);
      }
    }
    if(!card)throw new Error('Nie znaleziono kafelka firmy');
    card.click();

    for(let i=0;i<80;i++){
      const active=typeof window.cfGetActiveCompanyId==='function' ? window.cfGetActiveCompanyId() : window.cfActiveCompanyId;
      if(String(active||'')===String(companyId))return;
      await sleep(50);
    }
    throw new Error('Nie udało się wejść do wybranej firmy');
  }

  async function openEntry(date,companyId,statusEl){
    if(busy)return;
    busy=true;
    try{
      if(statusEl)statusEl.textContent='Otwieranie firmy…';
      await enterCompanyThroughNativeCard(companyId);

      const cal=document.getElementById('cfCalMini');
      if(cal){cal.style.display='flex';cal.style.zIndex='15000';}

      if(statusEl)statusEl.textContent='Otwieranie formularza…';
      if(typeof window.openForm!=='function')throw new Error('Formularz wpisu nie jest dostępny');
      window.openForm(null);
      setFormDate(date);
      document.querySelector('#cfCalMini .cf-cal1215-pick')?.remove();
    }catch(err){
      console.error('CleanFleet calendar add v1.20.16:',err);
      if(statusEl)statusEl.textContent='Nie udało się otworzyć wpisu.';
      toast('Nie udało się otworzyć nowego wpisu.');
    }finally{busy=false;}
  }

  function showPicker(date,companies){
    const cal=document.getElementById('cfCalMini');
    const host=cal?.firstElementChild;
    if(!host)return;
    host.querySelector('.cf-cal1215-pick')?.remove();
    const p=document.createElement('div');
    p.className='cf-cal1215-pick';
    p.innerHTML=`<div class="cf-cal1215-box"><div class="cf-cal1215-title">Wybierz firmę</div><div class="cf-cal1215-sub">Nowy wpis na ${esc(date.split('-').reverse().join('.'))}</div><div class="cf-cal1215-list">${companies.map(c=>`<button type="button" class="cf-cal1215-company" data-cf1215-company="${esc(c.id)}">${esc(c.short_name||c.name||'Firma')}</button>`).join('')}</div><div class="cf-cal1215-status" data-cf1215-status></div><button type="button" class="cf-cal1215-cancel">Anuluj</button></div>`;
    host.appendChild(p);
    const status=p.querySelector('[data-cf1215-status]');
    p.querySelectorAll('[data-cf1215-company]').forEach(btn=>btn.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      openEntry(date,btn.dataset.cf1215Company,status);
    }));
    p.querySelector('.cf-cal1215-cancel')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();p.remove();});
    p.addEventListener('click',e=>{if(e.target===p)p.remove();});
  }

  async function handlePlus(date){
    try{
      const companies=await getCompanies();
      if(!companies.length){toast('Brak firm w bazie.');return;}
      showPicker(date,companies);
    }catch(err){
      console.error('CleanFleet calendar plus v1.20.16:',err);
      toast('Nie udało się pobrać listy firm.');
    }
  }

  function onClick(e){
    const btn=e.target?.closest?.('#cfCalMini .cf-cal-add');
    if(!btn)return;
    const date=btn.closest('[data-date]')?.dataset?.date;
    if(!date)return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handlePlus(date);
  }

  function start(){
    ensureStyles();
    document.addEventListener('click',onClick,true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
