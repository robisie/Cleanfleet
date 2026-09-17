(()=>{
  'use strict';

  const pad=n=>String(n).padStart(2,'0');
  const localDay=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const cap=s=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
  let lastCount=null,gridObserver=null,bodyObserver=null,refreshTimer=null;

  function ensureStyle(){
    if(document.getElementById('cfCalendarTodayTile1262Style'))return;
    const s=document.createElement('style');
    s.id='cfCalendarTodayTile1262Style';
    s.textContent=`
      #cfCompanyCalendarCard{position:relative;overflow:hidden}
      #cfCompanyCalendarCard .cf-cal-today{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:.03em;padding:2.5% 3%}
      #cfCompanyCalendarCard .cf-cal-weekday{font-size:clamp(.62rem,.78vw,1rem)!important;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#6d756f;margin:0}
      #cfCompanyCalendarCard .cf-cal-number{font-size:clamp(62px,7.4vw,96px)!important;line-height:.72!important;font-weight:950!important;letter-spacing:-.075em;color:#111611;margin:.02em 0 0!important}
      #cfCompanyCalendarCard .cf-cal-month{font-size:clamp(.76rem,1vw,1.28rem)!important;font-weight:850;color:#111611;margin:.18em 0 0}
      #cfCompanyCalendarCard .cf-cal-count{font-size:clamp(.56rem,.66vw,.84rem)!important;font-weight:750;color:#777f79;margin:.48em 0 0;line-height:1.08}
      #cfCompanyCalendarCard .cf-cal-count strong{display:inline;font-size:inherit;color:#6f7f16}
    `;
    document.head.appendChild(s);
  }

  function paint(count=lastCount){
    const tile=document.getElementById('cfCompanyCalendarCard');
    if(!tile)return false;
    const now=new Date();
    const weekday=cap(now.toLocaleDateString('pl-PL',{weekday:'long'}));
    const month=cap(now.toLocaleDateString('pl-PL',{month:'long'}));
    let summary='Plan dnia';
    if(Number.isFinite(count)) summary=count===0?'Brak pozycji na dziś':`${count} ${count===1?'pozycja':(count>=2&&count<=4?'pozycje':'pozycji')} na dziś`;
    if(!tile.querySelector('.cf-cal-today')||tile.querySelector('.cf-cal-number')?.textContent!==String(now.getDate())){
      tile.innerHTML=`<div class="cf-cal-today"><span class="cf-cal-weekday">${weekday}</span><strong class="cf-cal-number">${now.getDate()}</strong><span class="cf-cal-month">${month}</span><span class="cf-cal-count">${summary}</span></div>`;
    }else{
      const countEl=tile.querySelector('.cf-cal-count');if(countEl)countEl.textContent=summary;
    }
    tile.setAttribute('aria-label',`Kalendarz. ${weekday}, ${now.getDate()} ${month}. ${summary}`);
    return true;
  }

  async function countToday(){
    try{
      if(typeof cfSupabase==='undefined'||!cfSupabase)return;
      const today=localDay(new Date());
      const [w,r]=await Promise.all([
        cfSupabase.from('wash_records').select('order_due_date,schedule_proposed_date,wash_date').is('wash_date',null),
        cfSupabase.from('cf_reminders').select('start_at,due_at,remind_at,status')
      ]);
      if(w.error||r.error)return;
      const washCount=(w.data||[]).filter(x=>localDayValue(x.order_due_date||x.schedule_proposed_date)===today).length;
      const reminderCount=(r.data||[]).filter(x=>!['done','cancelled'].includes(String(x.status||''))&&localDayValue(x.start_at||x.due_at||x.remind_at)===today).length;
      lastCount=washCount+reminderCount;paint(lastCount);
    }catch(e){console.warn('CleanFleet today tile:',e)}
  }

  function localDayValue(v){
    if(!v)return'';
    const s=String(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    const d=new Date(s);
    return Number.isNaN(d.getTime())?'':localDay(d);
  }

  function refresh(){if(paint())countToday()}
  function schedulePaint(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(paint())countToday()},40)}
  function bindGrid(){
    const g=document.getElementById('cfCompanyGrid');if(!g)return false;
    if(gridObserver?.__cfGrid===g)return true;
    gridObserver?.disconnect();gridObserver=new MutationObserver(schedulePaint);gridObserver.__cfGrid=g;gridObserver.observe(g,{childList:true});schedulePaint();return true;
  }
  function boot(){
    ensureStyle();bindGrid();
    bodyObserver=new MutationObserver(()=>bindGrid());bodyObserver.observe(document.body,{childList:true,subtree:true});
    let tries=0;const t=setInterval(()=>{tries++;if(paint()){clearInterval(t);countToday()}else if(tries>150)clearInterval(t)},100);
    setInterval(()=>refresh(),60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){bindGrid();refresh()}},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
