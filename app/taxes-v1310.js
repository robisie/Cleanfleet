(()=>{
  'use strict';

  const TYPES=[
    {key:'cit',label:'CIT'},
    {key:'pit4',label:'PIT-4'},
    {key:'zus',label:'ZUS'},
    {key:'ppe',label:'PPE'}
  ];
  const MONTHS=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  const state={rows:[],year:new Date().getFullYear(),month:new Date().getMonth()+1,loading:false};

  const toast=msg=>{try{if(typeof showToast==='function')showToast(msg);else console.log('[CleanFleet taxes]',msg)}catch(_){console.log('[CleanFleet taxes]',msg)}};
  const esc=v=>{try{return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}catch(_){return String(v??'')}};
  const money=v=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(v)||0);
  const periodIndex=(y,m)=>Number(y)*12+(Number(m)-1);
  const monthLabel=(y,m)=>`${MONTHS[Math.max(0,Math.min(11,Number(m)-1))]} ${y}`;
  const todayKey=()=>{const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1}};

  function isAdmin(){
    try{return typeof cfIsAdmin==='function' ? !!cfIsAdmin() : document.body?.dataset?.cfRole==='admin'}catch(_){return false}
  }

  function injectStyle(){
    if(document.getElementById('cfTaxesV1310Style'))return;
    const s=document.createElement('style');
    s.id='cfTaxesV1310Style';
    s.textContent=`
      .cf-company-taxes-card{border-color:rgba(166,198,27,.42)!important;background:linear-gradient(145deg,rgba(166,198,27,.12),rgba(255,255,255,.98))!important}
      .cf-taxes-sheet{max-width:980px!important;width:min(96vw,980px)!important;max-height:92vh!important;overflow:auto!important}
      .cf-taxes-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:14px;padding-right:62px}
      .cf-taxes-head h2{margin:0 0 5px}
      .cf-taxes-year{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;flex:0 0 auto}
      .cf-taxes-year button{min-width:42px}
      .cf-taxes-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:14px 0}
      .cf-taxes-kpi{border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px;min-width:0}
      .cf-taxes-kpi span{display:block;color:var(--ink-soft);font-size:11px;margin-bottom:5px}
      .cf-taxes-kpi strong{display:block;font-size:18px;overflow-wrap:anywhere}
      .cf-taxes-kpi small{display:block;margin-top:4px;color:var(--ink-soft);font-size:10px;line-height:1.2}
      .cf-taxes-months{display:flex;gap:7px;overflow:auto;padding:2px 0 10px;margin-bottom:8px;scrollbar-width:thin}
      .cf-taxes-month-btn{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 11px;font:700 11px/1 system-ui,-apple-system,sans-serif;white-space:nowrap;cursor:pointer}
      .cf-taxes-month-btn.active{background:#16150f;color:#fff;border-color:#16150f}
      .cf-taxes-month-title{display:flex;align-items:end;justify-content:space-between;gap:10px;margin:8px 0 10px}
      .cf-taxes-month-title h3{margin:0}
      .cf-taxes-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .cf-tax-card{border:1px solid var(--line);border-radius:14px;background:#fff;padding:13px;min-width:0}
      .cf-tax-card.paid{background:rgba(144,214,99,.10);border-color:rgba(92,170,57,.35)}
      .cf-tax-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .cf-tax-card-head strong{font-size:15px}
      .cf-tax-status{font-size:10px;font-weight:800;border-radius:999px;padding:5px 8px;background:#f3f4f2;color:#5c625e}
      .cf-tax-status.paid{background:#dff3d3;color:#2f6d1d}
      .cf-tax-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .cf-tax-fields label{display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;color:var(--ink-soft);min-width:0}
      .cf-tax-fields input{width:100%;box-sizing:border-box;min-width:0;border:1px solid var(--line);border-radius:9px;padding:10px 11px;background:#fff;color:var(--ink);font:600 13px system-ui,-apple-system,sans-serif}
      .cf-tax-fields input[type=date]{width:calc(100% - 26px)}
      .cf-tax-hint{margin-top:7px;font-size:10px;line-height:1.35;color:var(--ink-soft);min-height:14px}
      .cf-tax-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
      .cf-tax-actions .btn{min-height:38px;padding:8px 12px}
      .cf-taxes-note{padding:10px 12px;border:1px solid rgba(166,198,27,.3);background:rgba(166,198,27,.07);border-radius:10px;font-size:11px;line-height:1.45;color:#555d57;margin-bottom:10px}
      @media(max-width:900px){.cf-taxes-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:700px){.cf-taxes-head{flex-direction:column;padding-right:54px}.cf-taxes-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.cf-taxes-grid{grid-template-columns:1fr}.cf-tax-fields{grid-template-columns:1fr}.cf-tax-fields input[type=date]{width:calc(100% - 22px)}}
    `;
    document.head.appendChild(s);
  }

  function ensureTile(){
    if(!isAdmin())return;
    const grid=document.getElementById('cfCompanyGrid');
    if(!grid || document.getElementById('cfCompanyTaxesCard'))return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.id='cfCompanyTaxesCard';
    btn.className='cf-company-card cf-company-utility-card cf-company-taxes-card';
    btn.innerHTML='<div><strong>ZUS i podatki</strong><span>Płatności, terminy i rozliczenia</span></div>';
    btn.addEventListener('click',openTaxes);
    const addCard=document.getElementById('cfCompanyAddCard');
    if(addCard?.parentNode===grid)grid.insertBefore(btn,addCard);else grid.appendChild(btn);
  }

  function rowFor(year,month,type){
    return state.rows.find(r=>Number(r.period_year)===Number(year)&&Number(r.period_month)===Number(month)&&r.tax_type===type)||null;
  }

  function previousRow(year,month,type){
    const target=periodIndex(year,month);
    return state.rows
      .filter(r=>r.tax_type===type && periodIndex(r.period_year,r.period_month)<target)
      .sort((a,b)=>periodIndex(b.period_year,b.period_month)-periodIndex(a.period_year,a.period_month))[0]||null;
  }

  function shiftDueDate(previous,year,month){
    if(!previous?.due_date)return '';
    const d=new Date(`${previous.due_date}T12:00:00`);
    if(Number.isNaN(d.getTime()))return '';
    const day=d.getDate();
    const last=new Date(Number(year),Number(month),0).getDate();
    return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
  }

  function suggestion(year,month,type){
    const p=previousRow(year,month,type);
    if(!p)return {amount:'',due:'',source:null};
    return {amount:p.amount??'',due:shiftDueDate(p,year,month),source:p};
  }

  async function loadRows(){
    state.loading=true;
    try{
      const {data,error}=await cfSupabase.from('cf_tax_payments').select('*').order('period_year',{ascending:true}).order('period_month',{ascending:true});
      if(error)throw error;
      state.rows=Array.isArray(data)?data:[];
    }finally{state.loading=false}
  }

  function statsForYear(year){
    const yr=state.rows.filter(r=>Number(r.period_year)===Number(year));
    const now=todayKey();
    const paid=yr.filter(r=>r.status==='paid').reduce((s,r)=>s+Number(r.amount||0),0);
    const thisMonth=yr.filter(r=>Number(year)===now.year&&Number(r.period_month)===now.month&&r.status!=='paid').reduce((s,r)=>s+Number(r.amount||0),0);
    const startMonth=Number(year)===now.year?now.month:1;
    const remaining=yr.filter(r=>r.status!=='paid'&&Number(r.period_month)>=startMonth).length;
    const today=new Date().toISOString().slice(0,10);
    const overdueRows=yr.filter(r=>r.status!=='paid'&&r.due_date&&String(r.due_date)<today);
    const overdueAmount=overdueRows.reduce((s,r)=>s+Number(r.amount||0),0);
    const next=yr.filter(r=>r.status!=='paid'&&r.due_date&&r.due_date>=today).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))[0]||null;
    return {paid,thisMonth,remaining,next,overdueAmount,overdueCount:overdueRows.length};
  }

  function render(){
    const overlay=document.getElementById('cfTaxesOverlay');
    if(!overlay)return;
    const s=statsForYear(state.year);
    const stats=document.getElementById('cfTaxesStats');
    if(stats){
      stats.innerHTML=`
        <div class="cf-taxes-kpi"><span>Zapłacono w ${state.year}</span><strong>${esc(money(s.paid))}</strong></div>
        <div class="cf-taxes-kpi"><span>Do zapłaty w tym miesiącu</span><strong>${esc(money(s.thisMonth))}</strong></div>
        <div class="cf-taxes-kpi"><span>Płatności do końca roku</span><strong>${s.remaining}</strong></div>
        <div class="cf-taxes-kpi"><span>Zaległe płatności</span><strong>${esc(money(s.overdueAmount))}</strong><small>${s.overdueCount ? `${s.overdueCount} ${s.overdueCount===1?'pozycja':'pozycje'}` : 'brak zaległości'}</small></div>
        <div class="cf-taxes-kpi"><span>Najbliższa płatność</span><strong>${s.next?`${esc(TYPES.find(t=>t.key===s.next.tax_type)?.label||s.next.tax_type)} · ${esc(money(s.next.amount))}`:'—'}</strong></div>`;
    }

    const yearLabel=document.getElementById('cfTaxesYearLabel');
    if(yearLabel)yearLabel.textContent=String(state.year);

    const months=document.getElementById('cfTaxesMonths');
    if(months){
      months.innerHTML=MONTHS.map((name,i)=>`<button type="button" class="cf-taxes-month-btn ${state.month===i+1?'active':''}" data-cf-tax-month="${i+1}">${esc(name.slice(0,3))}</button>`).join('');
      months.querySelectorAll('[data-cf-tax-month]').forEach(b=>b.addEventListener('click',()=>{state.month=Number(b.dataset.cfTaxMonth);render()}));
    }

    const content=document.getElementById('cfTaxesMonthContent');
    if(!content)return;
    content.innerHTML=`<div class="cf-taxes-month-title"><h3>${esc(monthLabel(state.year,state.month))}</h3><span class="confirm-text">Kwoty wpisujesz ręcznie.</span></div><div class="cf-taxes-grid">${TYPES.map(type=>taxCardHtml(type)).join('')}</div>`;

    TYPES.forEach(type=>bindTaxCard(type));
  }

  function taxCardHtml(type){
    const row=rowFor(state.year,state.month,type.key);
    const sug=row?{amount:'',due:'',source:null}:suggestion(state.year,state.month,type.key);
    const amount=row?.amount??sug.amount??'';
    const due=row?.due_date??sug.due??'';
    const paid=row?.status==='paid';
    const source=sug.source?`Podpowiedź z ${monthLabel(sug.source.period_year,sug.source.period_month)}.`:'';
    return `<section class="cf-tax-card ${paid?'paid':''}" data-cf-tax-type="${type.key}">
      <div class="cf-tax-card-head"><strong>${esc(type.label)}</strong><span class="cf-tax-status ${paid?'paid':''}">${paid?'Opłacone':row?'Do zapłaty':'Do uzupełnienia'}</span></div>
      <div class="cf-tax-fields">
        <label>Kwota<input data-cf-tax-amount type="number" min="0" step="0.01" inputmode="decimal" value="${esc(amount)}" placeholder="0,00"></label>
        <label>Termin płatności<input data-cf-tax-due type="date" value="${esc(due)}"></label>
      </div>
      <div class="cf-tax-hint">${row?'Zapisana pozycja. Zmiana kwoty lub terminu zaktualizuje też przypomnienie.':esc(source||'Brak wcześniejszej kwoty — wpisz ją ręcznie.')}</div>
      <div class="cf-tax-actions">
        <button type="button" class="btn btn-solid" data-cf-tax-save>${row?'Zapisz zmiany':'Zapisz'}</button>
        ${row?`<button type="button" class="btn btn-outline" data-cf-tax-paid>${paid?'Przywróć jako nieopłacone':'✓ Oznacz opłacone'}</button>`:''}
      </div>
    </section>`;
  }

  function bindTaxCard(type){
    const card=document.querySelector(`#cfTaxesMonthContent [data-cf-tax-type="${type.key}"]`);
    if(!card)return;
    const saved=rowFor(state.year,state.month,type.key);
    card.querySelector('[data-cf-tax-save]')?.addEventListener('click',async()=>{
      const amountRaw=card.querySelector('[data-cf-tax-amount]')?.value??'';
      const due=card.querySelector('[data-cf-tax-due]')?.value||'';
      const amount=Number(String(amountRaw).replace(',','.'));
      if(!Number.isFinite(amount)||amount<0){toast('Podaj prawidłową kwotę.');return}
      if(!due){toast('Wybierz termin płatności.');return}
      const btn=card.querySelector('[data-cf-tax-save]');
      if(btn)btn.disabled=true;
      try{
        const {error}=await cfSupabase.rpc('cf_tax_payment_upsert',{
          p_tax_type:type.key,
          p_period_year:state.year,
          p_period_month:state.month,
          p_amount:amount,
          p_due_date:due,
          p_note:null
        });
        if(error)throw error;
        await loadRows();
        render();
        try{if(typeof cfRefreshReminderTileCount==='function')cfRefreshReminderTileCount()}catch(_){}
        toast(`${type.label} zapisany. Przypomnienie zostało zsynchronizowane.`);
      }catch(e){console.error('CleanFleet taxes save:',e);toast('Nie udało się zapisać pozycji: '+(e?.message||'błąd'))}
      finally{if(btn)btn.disabled=false}
    });

    card.querySelector('[data-cf-tax-paid]')?.addEventListener('click',async()=>{
      if(!saved)return;
      const paid=saved.status!=='paid';
      const btn=card.querySelector('[data-cf-tax-paid]');
      if(btn)btn.disabled=true;
      try{
        const {error}=await cfSupabase.rpc('cf_tax_payment_set_paid',{p_id:saved.id,p_paid:paid});
        if(error)throw error;
        await loadRows();
        render();
        try{if(typeof cfRefreshReminderTileCount==='function')cfRefreshReminderTileCount()}catch(_){}
        toast(paid?'Oznaczono jako opłacone.':'Przywrócono jako nieopłacone.');
      }catch(e){console.error('CleanFleet taxes paid:',e);toast('Nie udało się zmienić statusu: '+(e?.message||'błąd'))}
      finally{if(btn)btn.disabled=false}
    });
  }

  async function openTaxes(){
    if(!isAdmin())return;
    injectStyle();
    const root=document.getElementById('modalRoot');
    if(!root)return;
    root.innerHTML=`<div class="overlay" id="cfTaxesOverlay">
      <div class="sheet cf-taxes-sheet">
        <button class="close" data-close type="button">&times;</button>
        <div class="cf-taxes-head">
          <div><h2>ZUS i podatki</h2><div class="confirm-text">Ręczne kwoty, automatyczne podpowiedzi z poprzedniego miesiąca i synchronizacja z przypomnieniami.</div></div>
          <div class="cf-taxes-year"><button type="button" class="btn btn-outline" id="cfTaxesPrevYear">‹</button><strong id="cfTaxesYearLabel"></strong><button type="button" class="btn btn-outline" id="cfTaxesNextYear">›</button></div>
        </div>
        <div class="cf-taxes-note">Aplikacja niczego nie wylicza. Jeśli miesiąc nie ma jeszcze wpisu, kwota i dzień terminu są tylko podpowiedzią z ostatniej zapisanej pozycji tego samego typu. Dopiero „Zapisz” tworzy zobowiązanie i przypomnienie.</div>
        <div class="cf-taxes-kpis" id="cfTaxesStats"></div>
        <div class="cf-taxes-months" id="cfTaxesMonths"></div>
        <div id="cfTaxesMonthContent"><div class="empty-state">Ładowanie…</div></div>
      </div>
    </div>`;
    const overlay=document.getElementById('cfTaxesOverlay');
    const close=()=>{root.innerHTML=''};
    overlay?.querySelector('[data-close]')?.addEventListener('click',close);
    overlay?.addEventListener('click',e=>{if(e.target===overlay)close()});
    document.getElementById('cfTaxesPrevYear')?.addEventListener('click',()=>{state.year--;render()});
    document.getElementById('cfTaxesNextYear')?.addEventListener('click',()=>{state.year++;render()});
    try{await loadRows();render()}catch(e){console.error('CleanFleet taxes load:',e);const box=document.getElementById('cfTaxesMonthContent');if(box)box.innerHTML=`<div class="empty-state">Nie udało się pobrać danych: ${esc(e?.message||e)}</div>`}
  }

  function boot(){
    injectStyle();
    ensureTile();
    new MutationObserver(()=>ensureTile()).observe(document.body,{childList:true,subtree:true});
    let tries=0;const t=setInterval(()=>{ensureTile();if(++tries>80)clearInterval(t)},250);
  }

  window.cfShowTaxes=openTaxes;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();