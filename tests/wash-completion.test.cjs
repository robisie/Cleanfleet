const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/wash-completion-v13072.js'),'utf8');
const context=vm.createContext({window:{},document:{addEventListener(){}}});
vm.runInContext(source.replace('  window.cfOpenWashCompletion=openCompletion;','  window.helpers={parseDuration,hoursLabel,durationMinutes,applyServiceSelection};\n  window.cfOpenWashCompletion=openCompletion;'),context);
const {parseDuration,hoursLabel,durationMinutes,applyServiceSelection}=context.window.helpers;
test('duration supports hours with a Polish decimal comma and hours:minutes',()=>{
 for(const value of ['1,5','1.5','1:30',' 1:30 '])assert.equal(parseDuration(value),1.5);
 assert.equal(parseDuration('0:45'),0.75);
 assert.equal(parseDuration(''),null);
 for(const value of ['1:75','abc','-1','Infinity'])assert(Number.isNaN(parseDuration(value)));
});
test('clock intervals include midnight and distinguish omitted time from zero',()=>{
 assert.equal(durationMinutes('08:00','12:00'),240);
 assert.equal(durationMinutes('23:00','01:00'),120);
 assert.equal(durationMinutes('08:00','08:00'),0);
 assert.equal(durationMinutes('',''),null);
 assert.equal(durationMinutes('08:00',''),null);
});
test('allocation preview retains seconds instead of rounding down to whole minutes',()=>{
 assert.equal(hoursLabel(4/4),'1 godz.');
 assert.equal(hoursLabel(1/8),'7 min 30 s');
 assert.equal(hoursLabel(1.5),'1 godz. 30 min');
 assert.equal(hoursLabel(null),'—');
});
test('additional service keeps comprehensive service and adds its priceable selection',()=>{
 const full={checked:true,dataset:{exclusive:'1'}},extra={checked:true,dataset:{exclusive:'0'}},secondFull={checked:false,dataset:{exclusive:'1'}};
 applyServiceSelection([full,extra],extra,false);
 assert.equal(full.checked,false);
 full.checked=true;
 applyServiceSelection([full,extra],extra,true);
 assert.equal(full.checked,true);
 secondFull.checked=true;
 applyServiceSelection([full,extra,secondFull],secondFull,true);
 assert.equal(full.checked,false);
 assert.equal(extra.checked,true);
});
