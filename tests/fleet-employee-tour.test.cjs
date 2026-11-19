const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('tour cannot open for administrator or CleanFleet employee',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../app/fleet-employee-tour.js'),'utf8');
  for(const role of ['admin','cleanfleet_employee','']){
    const appended=[];
    const body={dataset:{cfRole:role},append(node){appended.push(node);}};
    const document={body,head:{append(){}},createElement:()=>({}),addEventListener(){}};
    const window={};
    vm.runInNewContext(source,{document,window,MutationObserver:class{observe(){}},getComputedStyle(){}});
    window.cfFleetEmployeeTour.start();
    assert.equal(appended.length,0,role);
  }
});
