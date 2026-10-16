/* Robisię Pack: existing earnings UI and data, extracted without changing accounting. */
let cfEarningsUnlocked=false;

async function cfShowEarningsGate(){
 if(cfIsAdmin())window.CFFinance?.open();
}
window.cfFinanceEarningsBridge={
 async open(host,allowed){if(!cfIsAdmin()||!window.CFFinance?.isUnlocked()||!allowed())return;cfEarningsUnlocked=true;await cfShowEarnings(host,allowed);},
 lock(){cfEarningsUnlocked=false;}
};

function cfBuildEarningPreset(name,rows,rules){
  const key=String(name||'').trim().toLocaleLowerCase('pl');
  const matches=r=>String(r.contractor||'').trim().toLocaleLowerCase('pl')===key;
  const last=rows.filter(r=>matches(r)&&!r.source_wash_record_id)
    .sort((a,b)=>String(b.work_date||'').localeCompare(String(a.work_date||''))
      || String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];
  const rule=rules.find(matches);
  const total=last?Number(last.total_amount):null;
  const round=v=>Math.round((v+Number.EPSILON*Math.max(1,Math.abs(v)))*100)/100;
  const percent=rule?Number(rule.employee_percent):(total>0?Number(last.employee_amount||0)/total*100:0);
  const employee=total===null?0:round(total*percent/100);
  return {contractor:String(last?.contractor||rule?.contractor||name).trim(),description:last?.description||'',
    total_amount:total,my_amount:total===null?null:round(total-employee),employee_amount:employee,
    employee_name:last?.employee_name||'',employee_percent:percent,hasPrevious:!!last};
}

function cfEarningsMoney(v){
  return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(Number(v)||0);
}
function cfEarningsDate(iso){
  if(!iso) return '';
  const [y,m,d]=iso.split('-');
  return `${d}.${m}.${y}`;
}
function cfEarningsBounds(period){
  const now=new Date(),y=now.getFullYear(),m=now.getMonth();
  if(period==='month') return {from:new Date(y,m,1),to:new Date(y,m+1,0)};
  if(period==='quarter'){const q=Math.floor(m/3)*3;return {from:new Date(y,q,1),to:new Date(y,q+3,0)};}
  if(period==='year') return {from:new Date(y,0,1),to:new Date(y,11,31)};
  return {from:null,to:null};
}

async function cfShowEarnings(host=null,allowed=()=>cfIsAdmin()&&Boolean(window.CFFinance?.isUnlocked())){
  if(!cfIsAdmin() || !cfEarningsUnlocked || !allowed()) return;
  const root=host||document.getElementById('modalRoot');
  root.innerHTML=`<div class="overlay" id="cfEarningsOverlay">
    <div class="sheet cf-earnings-sheet">
      <button class="close" data-close type="button">&times;</button>
      <div class="cf-earnings-head">
        <h2>Moje zarobki</h2>
        <div class="cf-earnings-head-actions">
          <button class="btn btn-outline" id="cfEarningSummaryBtn" type="button">Podsumowanie</button>
          <button class="btn btn-outline" id="cfEarningImportBtn" type="button">Importuj z XLSX</button>
          <button class="btn btn-outline" id="cfEarningRulesBtn" type="button" disabled>Reguły</button>
          <button class="btn btn-solid" id="cfEarningAddBtn" type="button" disabled>+ Dodaj zarobek</button>
        </div>
      </div>
      <input type="file" id="cfEarningImportFile" accept=".xlsx,.xls" style="display:none;">
      <div id="cfEarningImportStatus" class="cf-earning-import-status" hidden></div>

      <div class="cf-earning-filters">
        <select id="cfEarningPeriod">
          <option value="all">Cały okres</option>
          <option value="month" selected>Ten miesiąc</option>
          <option value="quarter">Ten kwartał</option>
          <option value="year">Ten rok</option>
          <option value="custom">Własny zakres</option>
        </select>
        <select id="cfEarningContractor"><option value="">Wszyscy kontrahenci</option></select>
        <select id="cfEarningPaid"><option value="">Wszystkie</option><option value="paid">Wypłacone pracownikowi</option><option value="unpaid">Niewypłacone pracownikowi</option></select>
        <input id="cfEarningFrom" type="date" style="display:none;">
        <input id="cfEarningTo" type="date" style="display:none;">
        <select id="cfEarningSort">
          <option value="date_desc">Najnowsze</option>
          <option value="date_asc">Najstarsze</option>
          <option value="amount_desc">Najwyższa kwota</option>
          <option value="amount_asc">Najniższa kwota</option>
          <option value="contractor">Kontrahent A–Z</option>
        </select>
      </div>

      <div class="cf-earning-summary">
        <div><span>Łączna kwota</span><strong id="cfEarningTotal">0,00 zł</strong></div>
        <div class="cf-earning-summary-mine"><span>Moja część</span><strong id="cfEarningMine">0,00 zł</strong></div>
        <div class="cf-earning-summary-employee"><span>Dla pracowników</span><strong id="cfEarningEmployees">0,00 zł</strong></div>
        <div><span>Do wypłaty</span><strong id="cfEarningUnpaid">0,00 zł</strong></div>
      </div>

      <div id="cfEarningsList" class="cf-earnings-list"></div>
    </div>
  </div>`;

  const overlay=document.getElementById('cfEarningsOverlay');
  const close=()=>{root.innerHTML='';};
  overlay.querySelector('[data-close]')?.addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay) close();});

  const state={rows:[],rules:[],contractors:[],presetRows:[]};

  async function loadRows(){
    if(!allowed())return;
    const [{data,error},{data:rules, error:rulesError}] = await Promise.all([
      cfSupabase.from('cf_earnings')
        .select('id,work_date,contractor,description,total_amount,my_amount,employee_amount,employee_name,employee_paid,note,created_at,source_wash_record_id')
        .order('work_date',{ascending:false}),
      cfSupabase.from('cf_earning_rules')
        .select('id,contractor,employee_percent')
        .order('contractor',{ascending:true})
    ]);
    if(!allowed())return;
    if(rulesError) throw rulesError;
    // Saved rules and contractor suggestions must not depend on EUR conversion.
    state.rules=rules||[];
    if(!error){
      state.contractors=(data||[]).map(r=>r.contractor);
      state.presetRows=(data||[]).filter(r=>!r.source_wash_record_id);
    }
    const contractors=cfEarningContractors();
    document.getElementById('cfEarningContractor').innerHTML='<option value="">Wszyscy kontrahenci</option>'+contractors.map(x=>`<option>${escapeHtml(x)}</option>`).join('');
    document.getElementById('cfEarningRulesBtn').disabled=false;
    document.getElementById('cfEarningAddBtn').disabled=false;
    if(error) throw error;
    await cfRefreshExchangeRate(false);
    const linkedIds=(data||[]).map(r=>r.source_wash_record_id).filter(Boolean);
    let linked=[];
    for(let offset=0;offset<linkedIds.length;offset+=200){
      const result=await cfSupabase.from('wash_records').select('id,cost,currency,paid,wash_date,pln_rate,pln_amount').in('id',linkedIds.slice(offset,offset+200));
      if(result.error)throw result.error;linked.push(...(result.data||[]));
    }
    if(!allowed())return;
    state.rows=(data||[]).map(r=>window.CFExchange.earnings(r,linked.find(w=>w.id===r.source_wash_record_id)));
    render();
  }

  function filtered(){
    const period=document.getElementById('cfEarningPeriod').value;
    const contractor=document.getElementById('cfEarningContractor').value;
    const paid=document.getElementById('cfEarningPaid').value;
    const sort=document.getElementById('cfEarningSort').value;
    let rows=[...state.rows];
    let from=null,to=null;
    if(period==='custom'){
      const f=document.getElementById('cfEarningFrom').value;
      const t=document.getElementById('cfEarningTo').value;
      from=f?new Date(f+'T00:00:00'):null;
      to=t?new Date(t+'T23:59:59'):null;
    }else if(period==='selected_month'){
      const b=document.getElementById('cfEarningPeriod')._cfMonthPicker.dates();from=b.from;to=b.to;
    }else if(period!=='all'){
      const b=cfEarningsBounds(period);from=b.from;to=b.to;
    }

    rows=rows.filter(r=>{
      const d=new Date(r.work_date+'T12:00:00');
      if(from&&d<from)return false;
      if(to&&d>to)return false;
      if(contractor&&r.contractor!==contractor)return false;
      if(paid==='paid'&&!r.employee_paid)return false;
      if(paid==='unpaid'&&(r.employee_paid||Number(r.employee_amount||0)<=0))return false;
      return true;
    });

    rows.sort((a,b)=>{
      if(sort==='date_asc')return String(a.work_date).localeCompare(String(b.work_date));
      if(sort==='amount_desc')return Number(b.total_amount)-Number(a.total_amount);
      if(sort==='amount_asc')return Number(a.total_amount)-Number(b.total_amount);
      if(sort==='contractor')return String(a.contractor||'').localeCompare(String(b.contractor||''),'pl');
      return String(b.work_date).localeCompare(String(a.work_date));
    });
    return rows;
  }

  function render(){
    if(!allowed()||!document.getElementById('cfEarningPeriod'))return;
    const custom=document.getElementById('cfEarningPeriod').value==='custom';
    document.getElementById('cfEarningFrom').style.display=custom?'block':'none';
    document.getElementById('cfEarningTo').style.display=custom?'block':'none';

    const rows=filtered();
    const total=rows.reduce((s,r)=>s+Number(r.total_amount||0),0);
    const mine=rows.reduce((s,r)=>s+Number(r.my_amount||0),0);
    const emp=rows.reduce((s,r)=>s+Number(r.employee_amount||0),0);
    const unpaid=rows.reduce((s,r)=>s+(!r.employee_paid?Number(r.employee_amount||0):0),0);

    document.getElementById('cfEarningTotal').textContent=cfEarningsMoney(total);
    document.getElementById('cfEarningMine').textContent=cfEarningsMoney(mine);
    document.getElementById('cfEarningEmployees').textContent=cfEarningsMoney(emp);
    document.getElementById('cfEarningUnpaid').textContent=cfEarningsMoney(unpaid);

    const list=document.getElementById('cfEarningsList');
    if(!rows.length){
      list.innerHTML='<div class="empty-state">Brak wpisów dla wybranych filtrów.</div>';
      return;
    }

    list.innerHTML=rows.map(r=>`<div class="cf-earning-row">
      <div class="cf-earning-main">
        <strong>${escapeHtml(r.contractor)} · ${cfEarningsMoney(r.total_amount)}</strong>
        <span>${cfEarningsDate(r.work_date)} · ${escapeHtml(r.description||'')}</span>
        <small>Moja część: ${cfEarningsMoney(r.my_amount)}${Number(r.employee_amount||0)>0?` · ${escapeHtml(r.employee_name||'Pracownik')}: ${cfEarningsMoney(r.employee_amount)}`:''}</small>
        ${r.note?`<small>${escapeHtml(r.note)}</small>`:''}
      </div>
      <div class="cf-earning-actions">
        ${Number(r.employee_amount||0)>0?`<label class="cf-earning-paid-check"><input type="checkbox" data-paid="${r.id}" ${r.employee_paid?'checked':''}><span>${r.employee_paid?'Wypłacone':'Do wypłaty'}</span></label>`:''}
        <button class="btn btn-outline" type="button" data-edit="${r.id}">Edytuj</button>
        <button class="btn btn-danger" type="button" data-delete="${r.id}">Usuń</button>
      </div>
    </div>`).join('');

    list.querySelectorAll('[data-paid]').forEach(cb=>cb.addEventListener('change',async()=>{
      if(!allowed())return;
      const {error}=await cfSupabase.from('cf_earnings').update({employee_paid:cb.checked}).eq('id',cb.dataset.paid);
      if(error){showToast(error.message);cb.checked=!cb.checked;return;}
      await loadRows();
    }));
    list.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=state.rows.find(x=>String(x.id)===String(btn.dataset.edit));
      if(row) openForm(row);
    }));
    list.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(!allowed())return;
      const row=state.rows.find(x=>String(x.id)===String(btn.dataset.delete));
      if(!row)return;
      if(!confirm(`Usunąć wpis "${row.contractor} — ${row.description}"?`))return;
      const {error}=await cfSupabase.from('cf_earnings').delete().eq('id',row.id);
      if(error){showToast(error.message);return;}
      await loadRows();
    }));
  }


  function cfEarningRuleFor(contractor){
    const key=String(contractor||'').trim().toLowerCase();
    return state.rules.find(r=>String(r.contractor||'').trim().toLowerCase()===key)||null;
  }

  function cfEarningContractors(){
    return [...new Set([
      ...state.contractors,
      ...state.rows.map(r=>r.contractor),
      ...state.rules.map(r=>r.contractor)
    ].filter(Boolean).map(x=>String(x).trim()))].sort((a,b)=>a.localeCompare(b,'pl'));
  }

  function cfOpenEarningRules(){
    if(!allowed())return;
    const wrap=document.createElement('div');
    wrap.className='overlay';
    wrap.id='cfEarningRulesOverlay';

    const contractors=cfEarningContractors();
    const rows=contractors.map(name=>{
      const rule=cfEarningRuleFor(name);
      return `<div class="cf-earning-rule-row">
        <input class="cf-rule-contractor" type="text" value="${escapeHtml(name)}" readonly>
        <div class="cf-rule-percent-wrap">
          <input class="cf-rule-percent" type="number" min="0" max="100" step="0.01" value="${rule?.employee_percent??0}" data-original="${rule?.employee_percent??0}">
          <span>%</span>
        </div>
      </div>`;
    }).join('');

    wrap.innerHTML=`<div class="sheet cf-earning-rules-sheet">
      <button class="close" data-close type="button">&times;</button>
      <h2>Reguły podziału</h2>
      <div class="confirm-text">Udział pracownika jest stosowany automatycznie jako podpowiedź przy nowych wpisach. W konkretnym zarobku możesz potem wpisać inne kwoty ręcznie.</div>
      <div class="cf-earning-rules-head"><span>Kontrahent</span><span>Udział pracownika</span></div>
      <div id="cfEarningRulesList" class="cf-earning-rules-list">
        ${rows || '<div class="empty-state">Nie masz jeszcze żadnych kontrahentów. Dodaj pierwszy zarobek, a kontrahent pojawi się tutaj.</div>'}
      </div>
      <div class="sheet-actions">
        <button class="btn btn-outline" type="button" data-close>Anuluj</button>
        <button class="btn btn-solid" type="button" id="cfEarningRulesSave" ${contractors.length?'':'disabled'}>Zapisz reguły</button>
      </div>
    </div>`;
    root.appendChild(wrap);
    const closeRules=()=>wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closeRules));
    wrap.addEventListener('click',e=>{if(e.target===wrap)closeRules();});

    wrap.querySelector('#cfEarningRulesSave')?.addEventListener('click',async()=>{
      if(!allowed())return;
      const items=[...wrap.querySelectorAll('.cf-earning-rule-row')].map(row=>({
        contractor:row.querySelector('.cf-rule-contractor').value.trim(),
        employee_percent:Number(row.querySelector('.cf-rule-percent').value)
      }));
      for(const item of items){
        if(!Number.isFinite(item.employee_percent)||item.employee_percent<0||item.employee_percent>100){
          showToast(`Nieprawidłowy procent dla ${item.contractor}.`);
          return;
        }
      }
      const btn=wrap.querySelector('#cfEarningRulesSave');
      btn.disabled=true;
      btn.textContent='Zapisuję…';
      try{
        for(const item of items){
          const existing=cfEarningRuleFor(item.contractor);
          if(existing){
            const {error}=await cfSupabase.from('cf_earning_rules')
              .update({employee_percent:item.employee_percent})
              .eq('id',existing.id);
            if(error) throw error;
          }else{
            const {error}=await cfSupabase.from('cf_earning_rules')
              .insert({contractor:item.contractor,employee_percent:item.employee_percent});
            if(error) throw error;
          }
        }
        closeRules();
        await loadRows();
        showToast('Reguły zostały zapisane.');
      }catch(e){
        console.error('CleanFleet earnings rules:',e);
        showToast(e?.message||'Nie udało się zapisać reguł.');
        btn.disabled=false;
        btn.textContent='Zapisz reguły';
      }
    });
  }

  function cfEarningHeaderKey(value){
    return String(value??'')
      .trim().toLowerCase()
      .replace(/ł/g,'l')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function cfEarningNum(v){
    if(v===null||v===undefined||v==='') return null;
    if(typeof v==='number'&&Number.isFinite(v)) return v;
    const s=String(v).replace(/\s/g,'').replace(/zł/gi,'').replace(',','.');
    const n=Number(s);
    return Number.isFinite(n)?n:null;
  }

  function cfEarningImportDate(v){
    if(v instanceof Date && !isNaN(v)){
      return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    }
    if(typeof v==='number' && typeof XLSX!=='undefined' && XLSX.SSF){
      const p=XLSX.SSF.parse_date_code(v);
      if(p) return `${String(p.y).padStart(4,'0')}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
    }
    const s=String(v??'').trim();
    let m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if(m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m=s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    return null;
  }

  function cfEarningPaidValue(v){
    if(v===true || v===1) return true;
    const s=String(v??'').trim().toLowerCase();
    return ['tak','true','1','x','✓','✔','zapłacone','zaplacone'].includes(s);
  }

  function cfParseEarningsExcel(raw){
    if(!Array.isArray(raw)||!raw.length){
      return {valid:[],invalid:[{row:0,error:'Brak danych w arkuszu.'}],fatal:true,rules:[]};
    }

    // Find the real header row instead of assuming row 1.
    let headerRowIndex=-1;
    for(let r=0;r<Math.min(raw.length,25);r++){
      const keys=(raw[r]||[]).map(cfEarningHeaderKey);
      const hasDate=keys.includes('data');
      const hasContractor=keys.includes('kontrahent')||keys.includes('klient');
      const hasDescription=keys.includes('opis');
      const hasAmount=keys.some(x=>['kwota','kwota zl','kwota z','kwota razem','suma'].includes(x));
      if(hasDate&&hasContractor&&hasDescription&&hasAmount){
        headerRowIndex=r;
        break;
      }
    }
    if(headerRowIndex<0){
      return {valid:[],invalid:[{row:1,error:'Nie znaleziono wiersza nagłówków z kolumnami Data, Kontrahent, Opis i Kwota.'}],fatal:true,rules:[]};
    }

    const h=(raw[headerRowIndex]||[]).map(cfEarningHeaderKey);
    const aliases={
      date:['data'],
      contractor:['kontrahent','klient'],
      description:['opis'],
      total:['kwota zl','kwota z','kwota','kwota razem','suma'],
      mine:['ja','moja czesc'],
      employee:['tata','pracownik','dla pracownika','czesc pracownika'],
      paid:['zaplacone','zapacone','wyplacone','wypacone'],
      employeeName:['pracownik nazwa','imie pracownika'],
      percent:['procent','udzial pracownika','procent pracownika','pracownik procent']
    };
    const col={};
    Object.entries(aliases).forEach(([k,names])=>{
      const i=h.findIndex(x=>names.includes(x));
      if(i>=0) col[k]=i;
    });

    // In the user's workbook the percentage column has an empty header
    // and sits between "Ja" and "Tata".
    if(col.percent===undefined && col.mine!==undefined && col.employee!==undefined && col.employee-col.mine===2){
      col.percent=col.mine+1;
    }

    const missing=[];
    if(col.date===undefined)missing.push('Data');
    if(col.contractor===undefined)missing.push('Kontrahent');
    if(col.description===undefined)missing.push('Opis');
    if(col.total===undefined)missing.push('Kwota');
    if(missing.length){
      return {valid:[],invalid:[{row:headerRowIndex+1,error:`Brak kolumn: ${missing.join(', ')}`}],fatal:true,rules:[]};
    }

    const sourceRows=[];
    const invalid=[];
    const learnedRuleSamples=new Map();

    function parsePercent(v){
      if(v===null||v===undefined||v==='') return null;
      if(typeof v==='number'&&Number.isFinite(v)){
        if(v>=0&&v<=1) return v*100;
        if(v>1&&v<=100) return v;
        return null;
      }
      const s=String(v).trim().toLowerCase().replace(/\s/g,'').replace('%','').replace(',','.');
      if(!s || s==='wpisz') return null;
      const n=Number(s);
      if(!Number.isFinite(n)) return null;
      if(n>=0&&n<=1) return n*100;
      if(n>1&&n<=100) return n;
      return null;
    }

    // First pass: read every data row and learn contractor percentages from the file.
    raw.slice(headerRowIndex+1).forEach((r,idx)=>{
      const rowNo=headerRowIndex+2+idx;
      if(!r||r.every(v=>String(v??'').trim()==='')) return;

      const work_date=cfEarningImportDate(r[col.date]);
      const contractor=String(r[col.contractor]??'').trim();
      const description=String(r[col.description]??'').trim();
      const total_amount=cfEarningNum(r[col.total]);
      const myRaw=col.mine===undefined?null:cfEarningNum(r[col.mine]);
      const employeeRaw=col.employee===undefined?null:cfEarningNum(r[col.employee]);
      const percentRaw=col.percent===undefined?null:parsePercent(r[col.percent]);
      const employee_paid=col.paid===undefined?false:cfEarningPaidValue(r[col.paid]);
      const employee_name=col.employeeName===undefined
        ? ((employeeRaw!==null&&employeeRaw>0)?'Tata':null)
        : (String(r[col.employeeName]??'').trim()||null);

      // Ignore summary / total rows and other non-transaction rows.
      if(!work_date && !contractor && (total_amount!==null || description)){
        return;
      }

      let error='';
      if(!work_date)error='nieprawidłowa lub pusta data';
      else if(!contractor)error='brak kontrahenta';
      else if(total_amount===null||total_amount<0)error='nieprawidłowa kwota';

      if(error){
        invalid.push({row:rowNo,error});
        return;
      }

      let inferredPercent=percentRaw;
      if(inferredPercent===null && total_amount>0 && employeeRaw!==null){
        const calc=employeeRaw/total_amount*100;
        if(Number.isFinite(calc)&&calc>=0&&calc<=100) inferredPercent=calc;
      }

      if(inferredPercent!==null){
        const key=contractor.toLowerCase();
        const arr=learnedRuleSamples.get(key)||[];
        arr.push(inferredPercent);
        learnedRuleSamples.set(key,arr);
      }

      sourceRows.push({
        rowNo,work_date,contractor,description,total_amount,
        myRaw,employeeRaw,percentRaw,employee_name,employee_paid,note:null
      });
    });

    // Build learned rules: most common percentage for each contractor in this file.
    const learnedRules=new Map();
    for(const [key,samples] of learnedRuleSamples.entries()){
      const buckets=new Map();
      for(const p of samples){
        const rounded=Math.round(p*100)/100;
        const k=String(rounded);
        buckets.set(k,(buckets.get(k)||0)+1);
      }
      let best=null,bestCount=-1;
      for(const [k,count] of buckets.entries()){
        if(count>bestCount){best=Number(k);bestCount=count;}
      }
      if(best!==null) learnedRules.set(key,best);
    }

    const valid=[];
    for(const x of sourceRows){
      let my_amount=x.myRaw;
      let employee_amount=x.employeeRaw;

      // Explicit spreadsheet values always win.
      if(my_amount===null && employee_amount!==null){
        my_amount=Math.round((x.total_amount-employee_amount)*100)/100;
      }else if(employee_amount===null && my_amount!==null){
        employee_amount=Math.round((x.total_amount-my_amount)*100)/100;
      }else if(my_amount===null && employee_amount===null){
        // Then use row percentage, learned percentage from other rows in this same file,
        // or finally the saved app rule.
        let pct=x.percentRaw;
        if(pct===null) pct=learnedRules.get(x.contractor.toLowerCase());
        if(pct===undefined || pct===null){
          const saved=cfEarningRuleFor(x.contractor);
          pct=saved?Number(saved.employee_percent):0;
        }
        employee_amount=Math.round(x.total_amount*pct)/100;
        my_amount=Math.round((x.total_amount-employee_amount)*100)/100;
      }

      if(my_amount<0||employee_amount<0){
        invalid.push({row:x.rowNo,error:'podział kwoty jest nieprawidłowy'});
        continue;
      }

      valid.push({
        work_date:x.work_date,
        contractor:x.contractor,
        description:x.description,
        total_amount:x.total_amount,
        my_amount,
        employee_amount,
        employee_name:x.employee_name || (employee_amount>0?'Tata':null),
        employee_paid:x.employee_paid,
        note:x.note
      });
    }

    const rules=[...learnedRules.entries()].map(([key,employee_percent])=>{
      const source=sourceRows.find(x=>x.contractor.toLowerCase()===key);
      return {contractor:source?.contractor||key,employee_percent};
    });

    return {valid,invalid,fatal:false,rules,headerRow:headerRowIndex+1};
  }

  async function cfHandleEarningsImport(file){
    if(typeof XLSX==='undefined') throw new Error('Moduł Excel nie został załadowany.');
    const ext=String(file.name||'').split('.').pop().toLowerCase();
    if(!['xlsx','xls'].includes(ext)) throw new Error('Wybierz plik XLS lub XLSX.');

    let buffer;
    if(typeof file.arrayBuffer==='function'){
      buffer=await file.arrayBuffer();
    }else{
      buffer=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(new Error('Nie udało się odczytać pliku z urządzenia.'));
        reader.readAsArrayBuffer(file);
      });
    }

    const wb=XLSX.read(buffer,{type:'array',cellDates:true,cellFormula:true});
    if(!wb.SheetNames?.length) throw new Error('Brak arkuszy w pliku.');

    const preferred=wb.SheetNames.find(n=>String(n).trim()==='2026');
    const candidates=preferred ? [preferred,...wb.SheetNames.filter(n=>n!==preferred)] : [...wb.SheetNames];

    let best=null;
    for(const name of candidates){
      const ws=wb.Sheets[name];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:false});
      if(!raw.length) continue;
      const parsed=cfParseEarningsExcel(raw);
      if(!parsed.fatal){
        parsed.sheetName=name;
        best=parsed;
        break;
      }
    }

    if(!best) throw new Error('Nie znaleziono arkusza z tabelą zarobków.');
    return best;
  }

  function cfShowEarningsImportPreview(parsed){
    if(!allowed())return;
    const wrap=document.createElement('div');
    wrap.className='overlay';
    wrap.id='cfEarningImportPreviewOverlay';
    wrap.innerHTML=`<div class="sheet cf-earning-import-sheet">
      <button class="close" data-close type="button">&times;</button>
      <h2>Podgląd importu zarobków</h2>
      <div class="confirm-text">Arkusz: <strong>${escapeHtml(parsed.sheetName||'—')}</strong>${parsed.rules?.length?` · Rozpoznane reguły z pliku: ${parsed.rules.map(r=>`${escapeHtml(r.contractor)} ${Number(r.employee_percent).toFixed(0)}%`).join(', ')}`:''}</div>
      <div class="cf-earning-summary">
        <div><span>Poprawne</span><strong>${parsed.valid.length}</strong></div>
        <div><span>Błędne</span><strong>${parsed.invalid.length}</strong></div>
        <div><span>Łączna kwota</span><strong>${cfEarningsMoney(parsed.valid.reduce((s,r)=>s+r.total_amount,0))}</strong></div>
        <div><span>Moja część</span><strong>${cfEarningsMoney(parsed.valid.reduce((s,r)=>s+r.my_amount,0))}</strong></div>
      </div>
      ${parsed.invalid.length?`<div class="cf-earning-import-errors">${parsed.invalid.slice(0,15).map(x=>`<div>Wiersz ${x.row}: ${escapeHtml(x.error)}</div>`).join('')}</div>`:''}
      <div class="cf-earning-import-list">
        ${parsed.valid.slice(0,12).map(r=>`<div><strong>${escapeHtml(r.contractor)} · ${cfEarningsMoney(r.total_amount)}</strong><span>${cfEarningsDate(r.work_date)} · ${escapeHtml(r.description)} · Ja ${cfEarningsMoney(r.my_amount)} · Pracownik ${cfEarningsMoney(r.employee_amount)}</span></div>`).join('')}
      </div>
      <div class="sheet-actions">
        <button class="btn btn-outline" type="button" data-close>Anuluj</button>
        <button class="btn btn-solid" type="button" id="cfEarningImportConfirm">Importuj ${parsed.valid.length}</button>
      </div>
    </div>`;
    root.appendChild(wrap);
    const closePreview=()=>wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closePreview));
    wrap.addEventListener('click',e=>{if(e.target===wrap)closePreview();});
    wrap.querySelector('#cfEarningImportConfirm')?.addEventListener('click',async()=>{
      if(!allowed())return;
      const btn=wrap.querySelector('#cfEarningImportConfirm');
      btn.disabled=true;btn.textContent='Importuję…';
      const {error}=await cfSupabase.from('cf_earnings').insert(parsed.valid);
      if(error){showToast(error.message);btn.disabled=false;return;}

      if(Array.isArray(parsed.rules)){
        for(const rule of parsed.rules){
          const existing=cfEarningRuleFor(rule.contractor);
          if(!existing){
            const {error:ruleError}=await cfSupabase.from('cf_earning_rules').insert({
              contractor:rule.contractor,
              employee_percent:rule.employee_percent
            });
            if(ruleError && !String(ruleError.message||'').toLowerCase().includes('duplicate')){
              console.warn('CleanFleet earning rule import:',ruleError);
            }
          }
        }
      }

      closePreview();
      await loadRows();
      showToast(`Zaimportowano ${parsed.valid.length} wpisów z arkusza ${parsed.sheetName||''}.`);
    });
  }


  function cfOpenEarningsSummary(){
    if(!allowed())return;
    const allRows=[...state.rows].filter(r=>r.work_date);
    const now=new Date();
    const thisYear=now.getFullYear();

    const monthLabel=key=>{
      const [y,m]=String(key).split('-');
      const names=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
      const idx=Math.max(0,Math.min(11,Number(m)-1));
      return `${names[idx]} ${y}`;
    };

    const byContractor=new Map();
    const byMonth=new Map();

    for(const r of allRows){
      const c=r.contractor||'—';
      if(!byContractor.has(c)) byContractor.set(c,{total:0,mine:0,employee:0,unpaid:0,count:0});
      const cc=byContractor.get(c);
      cc.total+=Number(r.total_amount||0);
      cc.mine+=Number(r.my_amount||0);
      cc.employee+=Number(r.employee_amount||0);
      cc.unpaid+=r.employee_paid?0:Number(r.employee_amount||0);
      cc.count++;

      const month=String(r.work_date).slice(0,7);
      if(!byMonth.has(month)) byMonth.set(month,{total:0,mine:0,employee:0,unpaid:0,count:0});
      const mm=byMonth.get(month);
      mm.total+=Number(r.total_amount||0);
      mm.mine+=Number(r.my_amount||0);
      mm.employee+=Number(r.employee_amount||0);
      mm.unpaid+=r.employee_paid?0:Number(r.employee_amount||0);
      mm.count++;
    }

    const total=allRows.reduce((s,r)=>s+Number(r.total_amount||0),0);
    const mine=allRows.reduce((s,r)=>s+Number(r.my_amount||0),0);
    const employee=allRows.reduce((s,r)=>s+Number(r.employee_amount||0),0);
    const unpaid=allRows.reduce((s,r)=>s+(r.employee_paid?0:Number(r.employee_amount||0)),0);

    const contractorRank=[...byContractor.entries()].sort((a,b)=>b[1].total-a[1].total);
    const monthRank=[...byMonth.entries()].sort((a,b)=>b[1].total-a[1].total);
    const mineMonthRank=[...byMonth.entries()].sort((a,b)=>b[1].mine-a[1].mine);
    const largest=[...allRows].sort((a,b)=>Number(b.total_amount||0)-Number(a.total_amount||0))[0]||null;

    const bestContractor=contractorRank[0]||null;
    const bestMonth=monthRank[0]||null;
    const bestMineMonth=mineMonthRank[0]||null;

    const monthly=[...byMonth.entries()]
      .sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
      .slice(-12);
    const maxMonth=Math.max(1,...monthly.map(([,v])=>v.total));
    const maxMine=Math.max(1,...monthly.map(([,v])=>v.mine));

    const topContractors=contractorRank.slice(0,8);
    const maxContractor=Math.max(1,...topContractors.map(([,v])=>v.total));

    const currentYearRows=allRows.filter(r=>String(r.work_date).startsWith(String(thisYear)+'-'));
    const currentYearTotal=currentYearRows.reduce((s,r)=>s+Number(r.total_amount||0),0);
    const currentYearMine=currentYearRows.reduce((s,r)=>s+Number(r.my_amount||0),0);

    const prevYearRows=allRows.filter(r=>String(r.work_date).startsWith(String(thisYear-1)+'-'));
    const prevYearTotal=prevYearRows.reduce((s,r)=>s+Number(r.total_amount||0),0);

    let yearChange=null;
    if(prevYearTotal>0) yearChange=((currentYearTotal-prevYearTotal)/prevYearTotal)*100;

    const wrap=document.createElement('div');
    wrap.className='overlay';
    wrap.id='cfEarningSummaryOverlay';
    wrap.innerHTML=`<div class="sheet cf-earning-summary-sheet">
      <button class="close" data-close type="button">&times;</button>
      <h2>Podsumowanie zarobków</h2>
      <div class="confirm-text">Pełna analiza wszystkich zapisanych zarobków.</div>

      <div class="cf-earning-analytics-kpis">
        <div><span>Łączne zarobki</span><strong>${cfEarningsMoney(total)}</strong><small>${allRows.length} wpisów</small></div>
        <div class="cf-earning-summary-mine"><span>Moja część</span><strong>${cfEarningsMoney(mine)}</strong><small>${total>0?`${Math.round(mine/total*100)}% całości`:'—'}</small></div>
        <div class="cf-earning-summary-employee"><span>Dla pracowników</span><strong>${cfEarningsMoney(employee)}</strong><small>Do wypłaty: ${cfEarningsMoney(unpaid)}</small></div>
        <div><span>Ten rok</span><strong>${cfEarningsMoney(currentYearTotal)}</strong><small>Moja część: ${cfEarningsMoney(currentYearMine)}</small></div>
      </div>

      <div class="cf-earning-highlight-grid">
        <div>
          <span>Najlepszy kontrahent</span>
          <strong>${bestContractor?escapeHtml(bestContractor[0]):'—'}</strong>
          <small>${bestContractor?`${cfEarningsMoney(bestContractor[1].total)} · ${bestContractor[1].count} wpisów`:'Brak danych'}</small>
        </div>
        <div>
          <span>Najlepszy miesiąc</span>
          <strong>${bestMonth?escapeHtml(monthLabel(bestMonth[0])):'—'}</strong>
          <small>${bestMonth?cfEarningsMoney(bestMonth[1].total):'Brak danych'}</small>
        </div>
        <div>
          <span>Najwyższa miesięczna moja część</span>
          <strong>${bestMineMonth?cfEarningsMoney(bestMineMonth[1].mine):'—'}</strong>
          <small>${bestMineMonth?escapeHtml(monthLabel(bestMineMonth[0])):'Brak danych'}</small>
        </div>
        <div>
          <span>Największy pojedynczy zarobek</span>
          <strong>${largest?cfEarningsMoney(largest.total_amount):'—'}</strong>
          <small>${largest?`${escapeHtml(largest.contractor||'—')} · ${escapeHtml(largest.description||'')}`:'Brak danych'}</small>
        </div>
        <div>
          <span>Zmiana rok do roku</span>
          <strong>${yearChange===null?'—':`${yearChange>=0?'+':''}${yearChange.toFixed(1)}%`}</strong>
          <small>${thisYear-1}: ${cfEarningsMoney(prevYearTotal)}</small>
        </div>
        <div>
          <span>Średni zarobek miesięczny</span>
          <strong>${byMonth.size?cfEarningsMoney(total/byMonth.size):'—'}</strong>
          <small>średnia z miesięcy z zapisanymi zarobkami</small>
        </div>
      </div>

      <div class="cf-earning-chart-grid">
        <div class="cf-earning-chart-card">
          <div class="cf-earning-chart-title"><strong>Zarobki miesiąc po miesiącu</strong><span>ostatnie 12 miesięcy z danymi</span></div>
          <div class="cf-earning-month-chart">
            ${monthly.length?monthly.map(([month,v])=>`
              <div class="cf-earning-month-bar">
                <div class="cf-earning-bar-values">
                  <span>${cfEarningsMoney(v.total)}</span>
                  <small>Ja ${cfEarningsMoney(v.mine)}</small>
                </div>
                <div class="cf-earning-bar-track">
                  <div class="cf-earning-bar-fill total" style="height:${Math.max(3,(v.total/maxMonth)*100)}%"></div>
                  <div class="cf-earning-bar-fill mine" style="height:${Math.max(3,(v.mine/maxMine)*100)}%"></div>
                </div>
                <small class="cf-earning-bar-label">${escapeHtml(monthLabel(month).replace(/^(\S{3}).*\s(\d{4})$/, '$1 $2'))}</small>
              </div>`).join(''):'<div class="empty-state">Brak danych.</div>'}
          </div>
          <div class="cf-earning-chart-legend"><span><i class="total"></i> Razem</span><span><i class="mine"></i> Moja część</span></div>
        </div>

        <div class="cf-earning-chart-card">
          <div class="cf-earning-chart-title"><strong>Najlepsi kontrahenci</strong><span>według łącznego zarobku</span></div>
          <div class="cf-earning-contractor-chart">
            ${topContractors.length?topContractors.map(([name,v],i)=>`
              <div class="cf-earning-contractor-row">
                <div class="cf-earning-contractor-name"><span>${i+1}.</span><strong>${escapeHtml(name)}</strong></div>
                <div class="cf-earning-horizontal-track"><div style="width:${Math.max(3,(v.total/maxContractor)*100)}%"></div></div>
                <div class="cf-earning-contractor-value">${cfEarningsMoney(v.total)}</div>
              </div>`).join(''):'<div class="empty-state">Brak danych.</div>'}
          </div>
        </div>
      </div>

      <h3>Według kontrahenta</h3>
      <div class="cf-earning-summary-table">
        <div class="cf-earning-summary-row head"><span>Kontrahent</span><span>Wpisy</span><span>Razem</span><span>Moja część</span><span>Pracownicy</span><span>Do wypłaty</span></div>
        ${contractorRank.map(([name,v])=>`
          <div class="cf-earning-summary-row">
            <span>${escapeHtml(name)}</span>
            <span>${v.count}</span>
            <span>${cfEarningsMoney(v.total)}</span>
            <span>${cfEarningsMoney(v.mine)}</span>
            <span>${cfEarningsMoney(v.employee)}</span>
            <span>${cfEarningsMoney(v.unpaid)}</span>
          </div>`).join('') || '<div class="empty-state">Brak danych.</div>'}
      </div>

      <h3>Według miesiąca</h3>
      <div class="cf-earning-summary-table">
        <div class="cf-earning-summary-row head"><span>Miesiąc</span><span>Wpisy</span><span>Razem</span><span>Moja część</span><span>Pracownicy</span><span>Do wypłaty</span></div>
        ${[...byMonth.entries()].sort((a,b)=>String(b[0]).localeCompare(String(a[0]))).map(([month,v])=>`
          <div class="cf-earning-summary-row">
            <span>${escapeHtml(monthLabel(month))}</span>
            <span>${v.count}</span>
            <span>${cfEarningsMoney(v.total)}</span>
            <span>${cfEarningsMoney(v.mine)}</span>
            <span>${cfEarningsMoney(v.employee)}</span>
            <span>${cfEarningsMoney(v.unpaid)}</span>
          </div>`).join('') || '<div class="empty-state">Brak danych.</div>'}
      </div>
    </div>`;
    root.appendChild(wrap);
    const closeSummary=()=>wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closeSummary));
    wrap.addEventListener('click',e=>{if(e.target===wrap)closeSummary();});
  }

  function openForm(row=null){
    if(!allowed())return;
    const edit=!!row;
    const presets=['Browar','TVM','Parysiewicz','Dawid'].map(name=>cfBuildEarningPreset(name,state.presetRows,state.rules));
    const wrap=document.createElement('div');
    wrap.className='overlay';
    wrap.id='cfEarningFormOverlay';
    wrap.innerHTML=`<div class="sheet cf-earning-form-sheet">
      <button class="close" data-close type="button">&times;</button>
      <h2>${edit?'Edytuj zarobek':'Dodaj zarobek'}</h2>
      ${!edit?`<section class="cf-earning-presets" aria-label="Gotowe kombinacje zarobków">
        <div class="cf-earning-presets-title">Szybkie uzupełnienie</div>
        <div class="cf-earning-presets-buttons">${presets.map((p,i)=>`<button class="btn btn-outline cf-earning-preset" type="button" data-earning-preset="${i}" aria-pressed="false"><strong>${escapeHtml(p.contractor)}</strong><small>${p.total_amount===null?'Wybierz kontrahenta':escapeHtml(cfEarningsMoney(p.total_amount))+' · pracownik '+Number(p.employee_percent.toFixed(2))+'%'}</small></button>`).join('')}</div>
        <div class="cf-earning-presets-hint" role="status" aria-live="polite">Opis i kwota z ostatniego ręcznego wpisu. Wszystkie pola możesz zmienić.</div>
      </section>`:''}
      <div class="cf-earning-form-grid">
        <label class="field"><span>Data</span><input id="cfEarnDate" type="date" value="${row?.work_date||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)}"></label>
        <label class="field"><span>Kontrahent</span><input id="cfEarnContractor" type="text" list="cfEarnContractorsList" autocomplete="off" value="${escapeHtml(row?.contractor||'')}" placeholder="np. TVM, Browar, Aga"><datalist id="cfEarnContractorsList">${cfEarningContractors().map(x=>`<option value="${escapeHtml(x)}"></option>`).join('')}</datalist></label>
        <label class="field field-full"><span>Opis</span><textarea id="cfEarnDescription" class="cf-autogrow-textarea" rows="3" placeholder="np. Sprzątanie, 2× zestaw">${escapeHtml(row?.description||'')}</textarea></label>
        <label class="field"><span>Kwota razem</span><input id="cfEarnTotal" type="number" step="0.01" min="0" inputmode="decimal" value="${row?.total_amount??''}" placeholder="0,00"></label>
        <label class="field"><span>Moja część</span><input id="cfEarnMine" type="number" step="0.01" min="0" inputmode="decimal" value="${row?.my_amount??''}" placeholder="0,00"></label>
        <label class="field"><span>Dla pracownika</span><input id="cfEarnEmployee" type="number" step="0.01" min="0" inputmode="decimal" value="${row?.employee_amount??0}" placeholder="0,00"></label>
        <label class="field"><span>Pracownik</span><input id="cfEarnEmployeeName" type="text" value="${escapeHtml(row?.employee_name||'')}" placeholder="opcjonalnie"></label>
        <label class="field field-full cf-earning-check"><input id="cfEarnPaid" type="checkbox" ${row?.employee_paid?'checked':''}><span>Wypłacone pracownikowi</span></label>
        <label class="field field-full"><span>Notatka</span><textarea id="cfEarnNote" rows="3" placeholder="opcjonalnie"></textarea></label>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-outline" type="button" data-close>Anuluj</button>
        <button class="btn btn-solid" type="button" id="cfEarnSave">Zapisz</button>
      </div>
    </div>`;
    root.appendChild(wrap);
    wrap.querySelector('#cfEarnNote').value=row?.note||'';

    const contractorInput=wrap.querySelector('#cfEarnContractor');
    const totalInput=wrap.querySelector('#cfEarnTotal');
    const mineInput=wrap.querySelector('#cfEarnMine');
    const empInput=wrap.querySelector('#cfEarnEmployee');
    let splitDriver='rule';

    const num=v=>{
      const n=Number(String(v??'').replace(',','.'));
      return Number.isFinite(n)?n:null;
    };
    const round2=v=>{const n=Number(v)||0;return Math.round((n+Number.EPSILON*Math.max(1,Math.abs(n)))*100)/100;};

    function applyRule(){
      const total=num(totalInput.value);
      if(total===null)return;
      const rule=cfEarningRuleFor(contractorInput.value);
      const pct=Number(rule?.employee_percent||0);
      const emp=round2(total*pct/100);
      empInput.value=emp.toFixed(2);
      mineInput.value=round2(total-emp).toFixed(2);
    }
    function recalcFromMine(){
      const total=num(totalInput.value), mine=num(mineInput.value);
      if(total===null||mine===null)return;
      empInput.value=round2(total-mine).toFixed(2);
    }
    function recalcFromEmployee(){
      const total=num(totalInput.value), emp=num(empInput.value);
      if(total===null||emp===null)return;
      mineInput.value=round2(total-emp).toFixed(2);
    }

    wrap.querySelectorAll('[data-earning-preset]').forEach(button=>button.addEventListener('click',()=>{
      const preset=presets[Number(button.dataset.earningPreset)];
      if(!preset)return;
      contractorInput.value=preset.contractor;
      const descriptionInput=wrap.querySelector('#cfEarnDescription');
      descriptionInput.value=preset.description;
      descriptionInput.dispatchEvent(new Event('input',{bubbles:true}));
      totalInput.value=preset.total_amount??'';
      mineInput.value=preset.my_amount===null?'':preset.my_amount.toFixed(2);
      empInput.value=preset.employee_amount.toFixed(2);
      wrap.querySelector('#cfEarnEmployeeName').value=preset.employee_name;
      wrap.querySelector('#cfEarnPaid').checked=false;
      wrap.querySelector('#cfEarnNote').value='';
      // Keep the selected date and use today's saved split rule for amount edits.
      splitDriver=cfEarningRuleFor(preset.contractor)?'rule':'preset';
      wrap.querySelectorAll('[data-earning-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      wrap.querySelector('.cf-earning-presets-hint').textContent=preset.hasPrevious
        ? 'Uzupełniono '+preset.contractor+'. Sprawdź opis, kwotę i pracownika przed zapisaniem.'
        : 'Wybrano '+preset.contractor+'. Uzupełnij opis i kwotę.';
    }));

    contractorInput.addEventListener('change',()=>{splitDriver='rule';applyRule();});
    contractorInput.addEventListener('blur',()=>{if(splitDriver==='rule')applyRule();});
    totalInput.addEventListener('input',()=>{
      if(splitDriver==='mine')recalcFromMine();
      else if(splitDriver==='employee')recalcFromEmployee();
      else if(splitDriver==='preset'){
        const preset=presets.find(p=>p.contractor===contractorInput.value);
        const total=num(totalInput.value)||0;
        empInput.value=round2(total*(preset?.employee_percent||0)/100).toFixed(2);
        mineInput.value=round2(total-Number(empInput.value)).toFixed(2);
      }
      else applyRule();
    });
    mineInput.addEventListener('input',()=>{splitDriver='mine';recalcFromMine();});
    empInput.addEventListener('input',()=>{splitDriver='employee';recalcFromEmployee();});

    if(!edit){
      splitDriver='rule';
    }

    const closeForm=()=>wrap.remove();
    wrap.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',closeForm));
    wrap.addEventListener('click',e=>{if(e.target===wrap)closeForm();});

    wrap.querySelector('#cfEarnSave')?.addEventListener('click',async()=>{
      if(!allowed())return;
      const work_date=wrap.querySelector('#cfEarnDate').value;
      const contractor=wrap.querySelector('#cfEarnContractor').value.trim();
      const description=wrap.querySelector('#cfEarnDescription').value.trim();
      const total_amount=Number(String(wrap.querySelector('#cfEarnTotal').value).replace(',','.'));
      const my_amount=Number(String(wrap.querySelector('#cfEarnMine').value).replace(',','.'));
      const employee_amount=Number(String(wrap.querySelector('#cfEarnEmployee').value||0).replace(',','.'));
      const employee_name=wrap.querySelector('#cfEarnEmployeeName').value.trim()||null;
      const employee_paid=wrap.querySelector('#cfEarnPaid').checked;
      const note=wrap.querySelector('#cfEarnNote').value.trim()||null;

      if(!work_date){showToast('Podaj datę.');return;}
      if(!contractor){showToast('Podaj kontrahenta.');return;}
      if(!Number.isFinite(total_amount)||total_amount<0){showToast('Podaj prawidłową kwotę razem.');return;}
      if(!Number.isFinite(my_amount)||my_amount<0){showToast('Podaj prawidłową moją część.');return;}
      if(!Number.isFinite(employee_amount)||employee_amount<0){showToast('Podaj prawidłową kwotę dla pracownika.');return;}

      const payload={work_date,contractor,description,total_amount,my_amount,employee_amount,employee_name,employee_paid,note};
      const res=edit
        ? await cfSupabase.from('cf_earnings').update(payload).eq('id',row.id)
        : await cfSupabase.from('cf_earnings').insert(payload);
      if(res.error){showToast(res.error.message);return;}
      closeForm();
      await loadRows();
      showToast(edit?'Wpis został zaktualizowany.':'Zarobek został dodany.');
    });
  }

  document.getElementById('cfEarningSummaryBtn')?.addEventListener('click',cfOpenEarningsSummary);
  document.getElementById('cfEarningRulesBtn')?.addEventListener('click',cfOpenEarningRules);
  document.getElementById('cfEarningImportBtn')?.addEventListener('click',()=>{
    const input=document.getElementById('cfEarningImportFile');
    if(!input){showToast('Nie znaleziono pola importu.');return;}
    input.value='';
    input.click();
  });
  document.getElementById('cfEarningImportFile')?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file)return;

    const status=document.getElementById('cfEarningImportStatus');
    const importBtn=document.getElementById('cfEarningImportBtn');
    if(status){
      status.hidden=false;
      status.className='cf-earning-import-status';
      status.textContent=`Odczytuję plik: ${file.name}…`;
    }
    if(importBtn){
      importBtn.disabled=true;
      importBtn.textContent='Odczytuję…';
    }

    try{
      const parsed=await cfHandleEarningsImport(file);
      if(!allowed())return;

      if(parsed.fatal){
        const msg=parsed.invalid?.[0]?.error||'Nieprawidłowy plik.';
        if(status){
          status.className='cf-earning-import-status error';
          status.textContent=msg;
        }
        showToast(msg);
        return;
      }

      if(!parsed.valid.length){
        const msg=parsed.invalid?.[0]?.error||'Brak poprawnych wpisów.';
        if(status){
          status.className='cf-earning-import-status error';
          status.textContent=msg;
        }
        showToast(msg);
        return;
      }

      if(status){
        status.className='cf-earning-import-status success';
        status.textContent=`Plik odczytany: ${parsed.valid.length} poprawnych wpisów${parsed.invalid.length?`, ${parsed.invalid.length} z błędami`:''}.`;
      }

      cfShowEarningsImportPreview(parsed);
    }catch(err){
      console.error('CleanFleet earnings import:',err);
      const msg=err?.message||'Nie udało się odczytać pliku.';
      if(status){
        status.className='cf-earning-import-status error';
        status.textContent=msg;
      }
      showToast(msg);
    }finally{
      e.target.value='';
      if(importBtn){
        importBtn.disabled=false;
        importBtn.textContent='Importuj z XLSX';
      }
    }
  });
  document.getElementById('cfEarningAddBtn')?.addEventListener('click',()=>openForm());
  window.CFPeriods.attach(document.getElementById('cfEarningPeriod'));
  ['cfEarningPeriod','cfEarningContractor','cfEarningPaid','cfEarningFrom','cfEarningTo','cfEarningSort'].forEach(id=>{
    document.getElementById(id)?.addEventListener('change',render);
  });

  const fetchRows=loadRows;
  loadRows=async()=>{
    try{await fetchRows();}
    catch(e){
      console.error('CleanFleet earnings:',e);
      if(!allowed()||!document.getElementById('cfEarningsList'))return;
      document.getElementById('cfEarningsList').innerHTML=`<div class="empty-state">Nie udało się wczytać historii: ${escapeHtml(e?.message||'błąd')}<br><button type="button" class="btn btn-outline" id="cfEarningsRetry">Spróbuj ponownie</button></div>`;
      document.getElementById('cfEarningsRetry')?.addEventListener('click',()=>loadRows());
    }
  };
  await loadRows();
}

