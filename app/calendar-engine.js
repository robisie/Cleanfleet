(()=>{
  'use strict';

  const SUPABASE_URL='https://nxmrobbhfqijmbjjzbof.supabase.co';
  const SUPABASE_KEY='sb_publishable_9lz7NUv2-MloX7MEcH2-vQ_AZS8IIHz';
  let client=null;

  const upper=v=>String(v||'').trim().toUpperCase();
  const isoDay=v=>{
    if(!v)return'';
    const s=String(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
    const d=new Date(s);
    if(Number.isNaN(d.getTime()))return'';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  async function loadSupabase(){
    if(client)return client;
    if(!window.supabase?.createClient)throw new Error('Biblioteka Supabase nie jest dostępna.');
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const {data:{session}}=await client.auth.getSession();
    if(!session)throw new Error('Brak aktywnej sesji CleanFleet. Otwórz najpierw główną aplikację.');
    return client;
  }

  async function companies(){
    const s=await loadSupabase();
    for(const rpc of ['cf_admin_companies_list','cf_staff_companies_list']){
      try{
        const {data,error}=await s.rpc(rpc);
        if(!error&&Array.isArray(data)&&data.length)return data;
      }catch(_){}
    }
    const {data,error}=await s.from('companies').select('id,name,short_name,active').order('name');
    if(error)throw error;
    return data||[];
  }

  async function loadAll(){
    const s=await loadSupabase();
    const [c,w,v,r]=await Promise.all([
      companies(),
      s.from('wash_records').select('id,company_id,plate,type,order_due_date,schedule_proposed_date,wash_date,performed_by,cost,approved,paid,created_at').order('created_at',{ascending:false}),
      s.from('vehicles').select('company_id,plate,type'),
      s.from('cf_reminders').select('*').order('remind_at',{ascending:true})
    ]);
    if(w.error||v.error||r.error)throw w.error||v.error||r.error;

    const companyMap=new Map((c||[]).map(x=>[String(x.id),x]));
    const vehicleMap=new Map((v.data||[]).map(x=>[`${x.company_id}|${upper(x.plate)}`,x]));
    const washes=w.data||[];
    const planned=washes.filter(x=>!x.wash_date&&(x.order_due_date||x.schedule_proposed_date)).map(x=>({
      ...x,
      date:isoDay(x.order_due_date||x.schedule_proposed_date),
      company:companyMap.get(String(x.company_id))||null
    }));

    const latestByVehicle=new Map();
    for(const row of washes){
      if(!row.wash_date)continue;
      const key=`${row.company_id}|${upper(row.plate)}`;
      const prev=latestByVehicle.get(key);
      if(!prev||String(row.wash_date)>String(prev.wash_date))latestByVehicle.set(key,row);
    }
    const today=new Date();today.setHours(0,0,0,0);
    const ageing=[];
    for(const [key,row] of latestByVehicle){
      const vehicle=vehicleMap.get(key)||{};
      const type=upper(row.type||vehicle.type);
      if(type==='BUS')continue;
      const last=new Date(`${isoDay(row.wash_date)}T00:00:00`);
      if(Number.isNaN(last.getTime()))continue;
      const days=Math.floor((today-last)/86400000);
      const due=183-days;
      ageing.push({
        company_id:row.company_id,
        company:companyMap.get(String(row.company_id))||null,
        plate:row.plate,
        type,
        lastWash:isoDay(row.wash_date),
        days,
        daysToLimit:due,
        status:days>=183?'overdue':(due<=14?'soon':'ok')
      });
    }

    return{
      companies:c||[],companyMap,
      planned,
      reminders:r.data||[],
      ageing:ageing.sort((a,b)=>b.days-a.days),
      washes
    };
  }

  async function moveWash(id,date){
    const s=await loadSupabase();
    const {error}=await s.rpc('cf_admin_confirm_wash_schedule',{p_wash_record_id:id,p_confirmed_date:date,p_note:null});
    if(error)throw error;
  }

  async function saveReminder(payload,id=null){
    const s=await loadSupabase();
    const {data:{user}}=await s.auth.getUser();
    const row={...payload};
    if(!id&&user?.id)row.user_id=user.id;
    const q=id?s.from('cf_reminders').update(row).eq('id',id):s.from('cf_reminders').insert(row);
    const {error}=await q;
    if(error)throw error;
  }

  async function setReminderStatus(id,status){
    const s=await loadSupabase();
    const patch={status,snoozed_until:null};
    if(status==='done')patch.completed_at=new Date().toISOString();
    const {error}=await s.from('cf_reminders').update(patch).eq('id',id);
    if(error)throw error;
  }

  async function snoozeReminder(id,hours=24){
    const s=await loadSupabase();
    const until=new Date(Date.now()+hours*3600000).toISOString();
    const {error}=await s.from('cf_reminders').update({status:'snoozed',snoozed_until:until,push_sent_at:null}).eq('id',id);
    if(error)throw error;
  }

  async function deleteReminder(id){
    const s=await loadSupabase();
    const {error}=await s.from('cf_reminders').delete().eq('id',id);
    if(error)throw error;
  }

  window.CFCalendarEngine={loadSupabase,loadAll,moveWash,saveReminder,setReminderStatus,snoozeReminder,deleteReminder,isoDay};
})();
