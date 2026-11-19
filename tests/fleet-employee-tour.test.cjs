const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../app/fleet-employee-tour.js'),'utf8');
function setup(role){
  const appended=[],handlers=new Map(),fields=new Map();
  const body={dataset:{cfRole:role},append(node){appended.push(node);}};
  const document={
    body,head:{append(){}},
    createElement:()=>({
      addEventListener(){},remove(){},
      querySelector(selector){
        if(!fields.has(selector))fields.set(selector,{textContent:'',addEventListener(){},focus(){}});
        return fields.get(selector);
      }
    }),
    addEventListener(name,fn){handlers.set(name,fn);},
    removeEventListener(){},
    querySelector(){return null}
  };
  const window={};
  vm.runInNewContext(source,{document,window,MutationObserver:class{observe(){}},getComputedStyle(){}});
  return {appended,handlers,fields,window};
}
test('CleanFleet employee does not see fleet tour settings',()=>{
  const app=setup('cleanfleet_employee');
  app.handlers.get('click')({target:{closest:()=>true}});
  app.window.cfFleetEmployeeTour.start();
  assert.equal(app.appended.length,0);
});
test('administrator can open the same employee tour in preview mode',()=>{
  const app=setup('admin');
  app.handlers.get('click')({target:{closest:()=>true}});
  assert.equal(app.appended.length,1);
  assert.match(app.fields.get('p').textContent,/te same kroki i opisy, co pracownik floty/);
  assert.equal(app.fields.get('[data-tour-start]').textContent,'Zobacz samouczek pracownika');
});
test('employee retains the ordinary tour entry',()=>{
  const app=setup('fleet_employee');
  app.handlers.get('click')({target:{closest:()=>true}});
  assert.equal(app.fields.get('[data-tour-start]').textContent,'Uruchom samouczek');
});
