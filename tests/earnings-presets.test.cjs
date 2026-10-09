const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function cfBuildEarningPreset('),html.indexOf('function cfEarningsMoney(')),ctx);
test('latest manual entry supplies preset; automatic wash earnings never replace it',()=>{
 const rows=[{contractor:'TVM',description:'old',total_amount:200,employee_amount:60,work_date:'2026-09-01'},
 {contractor:' TVM ',description:'Zestaw',total_amount:400,employee_name:'Jan',employee_amount:120,work_date:'2026-10-01',created_at:'2026-10-01T12:00:00Z'},
 {contractor:'TVM',description:'automatic',total_amount:999,work_date:'2026-10-09',source_wash_record_id:'wash1'}];
 const copy=JSON.stringify(rows),p=ctx.cfBuildEarningPreset('tvm',rows,[{contractor:'TVM',employee_percent:35}]);
 assert.equal(p.description,'Zestaw');assert.equal(p.total_amount,400);assert.equal(p.my_amount,260);assert.equal(p.employee_amount,140);assert.equal(p.employee_name,'Jan');assert.equal(JSON.stringify(rows),copy);
 assert.equal(p.work_date,undefined);assert.equal(p.employee_paid,undefined);assert.equal(p.note,undefined);assert.equal(p.source_wash_record_id,undefined);
});
test('missing history leaves amount blank; saved rule and contractor still suggested',()=>{
 const p=ctx.cfBuildEarningPreset('Dawid',[],[{contractor:'Dawid',employee_percent:30}]);
 assert.equal(p.contractor,'Dawid');assert.equal(p.total_amount,null);assert.equal(p.my_amount,null);assert.equal(p.description,'');assert.equal(p.employee_percent,30);assert.equal(p.hasPrevious,false);
});
test('missing rule preserves previous split; ties use creation time and rounding keeps total intact',()=>{
 const rows=[{contractor:'Browar',total_amount:200,employee_amount:100,work_date:'2026-10-01',created_at:'2026-10-01T08:00:00Z'},
 {contractor:'Browar',total_amount:123.45,employee_amount:37.04,description:'new',work_date:'2026-10-01',created_at:'2026-10-01T09:00:00Z'}];
 const p=ctx.cfBuildEarningPreset('Browar',rows,[]);assert.equal(p.description,'new');assert.equal(p.employee_amount,37.04);assert.equal(p.my_amount,86.41);
 const q=ctx.cfBuildEarningPreset('Browar',rows,[{contractor:'Browar',employee_percent:30}]);assert.equal(q.employee_amount,37.04);assert.equal(q.my_amount,86.41);
});
