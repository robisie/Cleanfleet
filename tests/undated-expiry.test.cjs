const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
const now=Date.parse('2026-10-09T12:00:00Z'),week=7*86400000;
class Clock extends Date{static now(){return now;}}
const ctx=vm.createContext({Date:Clock,fmtDate:x=>x,daysSinceLastWashForRecord:()=>null});
vm.runInContext(html.slice(html.indexOf('  function scheduleUndatedEligible'),html.indexOf('  function recordFleetBadge')),ctx);
const base={zlecone:true,created_at:now-week,schedule_status:''};
test('expires exactly at seven elapsed days, independent of description or timezone',()=>{
 assert.equal(ctx.scheduleIsUndatedExpired({...base,created_at:now-week+1}),false);
 assert.equal(ctx.scheduleNeedsDate({...base,created_at:now-week+1}),true);
 assert.equal(ctx.scheduleIsUndatedExpired(base),true);
 assert.equal(ctx.scheduleUndatedExpiryAt(base),now);
 assert.equal(ctx.scheduleIsUndatedExpired({...base,uwagi:'Edytowany opis'}),true);
 assert.equal(ctx.scheduleIsUndatedExpired({...base,created_at:'2026-10-02T14:00:00+02:00'}),true);
 assert.equal(ctx.scheduleStatusLabel(base),'PRZEDAWNIONY');
 assert.equal(ctx.scheduleNeedsDate(base),false);
});
test('only the expired category retains an archived entry; dated expiry retains existing behavior',()=>{
 for(const filter of ['all','ordered','todo','done','unapproved','unpaid','approved_paid','old']) assert.equal(ctx.scheduleMatchesMainFilter(base,filter),false,filter);
 assert.equal(ctx.scheduleMatchesMainFilter(base,'expired'),true);
 const fresh={...base,created_at:now};
 assert.equal(ctx.scheduleMatchesMainFilter(fresh,'all'),true);
 assert.equal(ctx.scheduleMatchesMainFilter(fresh,'todo'),true);
 const dated={...base,data_zlecenia_do:'2000-01-01'};
 assert.equal(ctx.scheduleMatchesMainFilter(dated,'all'),true);
 assert.equal(ctx.scheduleMatchesMainFilter(dated,'expired'),true);
 assert.equal(ctx.scheduleMatchesMainFilter(dated,'todo'),false);
});
test('established dates, completed work and approval proposals do not age; first expiry remains traceable after rescheduling',()=>{
 for(const patch of [{data_zlecenia_do:'2099-01-01'},{data_prania:'2026-10-08'},{zatwierdzone:true},{zlecone:false},...['pending_admin','pending_employee','rejected'].map(schedule_status=>({schedule_status}))]) assert.equal(ctx.scheduleIsUndatedExpired({...base,...patch}),false,JSON.stringify(patch));
 assert.equal(ctx.scheduleIsUndatedExpired({...base,created_at:'invalid'}),false);
 const rescheduled={...base,data_zlecenia_do:'2099-01-01',undated_expired_at:new Date(now).toISOString()};
 assert.equal(ctx.scheduleIsUndatedExpired(rescheduled),false);
 assert.equal(ctx.scheduleUndatedExpiryAt(rescheduled),now);
 assert.equal(ctx.scheduleMatchesMainFilter(rescheduled,'todo'),true);
});
test('all classic inline JavaScript parses',()=>{
 let n=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(/\bsrc=|type=["']module|application\/(?:json|ld\+json)/i.test(m[1])||!m[2].trim())continue;
  new vm.Script(m[2],{filename:'inline-'+(++n)});
 }assert.ok(n>0);
});
