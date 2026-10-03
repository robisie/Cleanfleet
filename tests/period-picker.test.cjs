const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const periods=require('../app/period-picker.js');
test('month bounds include leap days, whole last day, and December rollover',()=>{
 assert.deepEqual(periods.bounds('2024-02'),{from:'2024-02-01',to:'2024-02-29',next:'2024-03-01'});
 assert.equal(periods.bounds('2025-02').to,'2025-02-28');
 assert.deepEqual(periods.bounds('2025-12'),{from:'2025-12-01',to:'2025-12-31',next:'2026-01-01'});
 const b=periods.dates('2024-02');assert.equal(b.to.getHours(),23);assert.equal(b.to.getMilliseconds(),999);
 assert.throws(()=>periods.bounds('2026-13'));
});
class Node{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.style={};this.listeners={};this.value='';}
 get options(){return this.children;}
 get nextSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null;}
 appendChild(n){this.children.push(n);n.parentElement=this;return n;}
 insertBefore(n,next){const i=this.children.indexOf(next);this.children.splice(i<0?this.children.length:i,0,n);n.parentElement=this;}
 insertAdjacentElement(_,n){this.parentElement.insertBefore(n,this.nextSibling);}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,f){(this.listeners[k]||=[]).push(f);}
 dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e);}
}
test('month and year selections update filter and switching to custom hides picker without resetting it',()=>{
 const doc={createElement:tag=>new Node(tag,doc)},host=new Node('div',doc),select=new Node('select',doc);host.appendChild(select);
 const o=new Node('option',doc);o.value='month';select.appendChild(o);select.value='month';
 let updates=0;const picker=periods.attach(select,()=>updates++,'2024-02'),wrap=host.children[1];
 assert.equal(select.options.filter(x=>x.value==='selected_month').length,1);assert.equal(wrap.style.display,'none');
 select.value='selected_month';select.dispatchEvent(new Event('change'));assert.equal(wrap.style.display,'flex');
 wrap.children[0].value='12';wrap.children[1].value='2025';wrap.children[1].dispatchEvent(new Event('change'));
 assert.equal(picker.value(),'2025-12');assert.equal(updates,2);
 select.value='custom';select.dispatchEvent(new Event('change'));assert.equal(wrap.style.display,'none');assert.equal(picker.value(),'2025-12');
 assert.equal(periods.attach(select),picker);
});
const html=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
test('universal reports apply selected month, current month and all dates, and allow custom dates afterwards',()=>{
 const doc={createElement:tag=>new Node(tag,doc)},host=new Node('div',doc),fields={};
 for(const id of ['#rPeriod','#rFrom','#rTo']){fields[id]=new Node(id==='#rPeriod'?'select':'input',doc);host.appendChild(fields[id]);}
 fields['#rPeriod'].value='all';
 const source=fs.readFileSync(require.resolve('../app/reports-ui.js'),'utf8');
 const controller=source.slice(source.indexOf('function bindPeriod(){'),source.indexOf('function bind(){'));
 const context={root:{CFPeriods:periods},cfg:{selectedMonth:'2024-02'},$:id=>fields[id],readConfig:()=>{},dirty:()=>{}};
 vm.createContext(context);vm.runInContext(controller+';bindPeriod();',context);
 const select=fields['#rPeriod'];select.value='selected_month';select.dispatchEvent(new Event('change'));
 assert.equal(fields['#rFrom'].value,'2024-02-01');assert.equal(fields['#rTo'].value,'2024-02-29');
 select.value='month';select.dispatchEvent(new Event('change'));assert.equal(fields['#rFrom'].value,periods.current()+'-01');
 select.value='all';select.dispatchEvent(new Event('change'));assert.equal(fields['#rFrom'].value,'');assert.equal(fields['#rTo'].value,'');
 fields['#rFrom'].value='2025-12-15';fields['#rFrom'].dispatchEvent(new Event('change'));assert.equal(select.value,'custom');
});
test('purchase and earnings filters include both month boundaries and preserve other filters',()=>{
 for(const [name,end,prefix,dateField] of [['filteredRows','cfRowsInRange','cfPurchase','purchase_date'],['filtered','render','cfEarning','work_date']]){
  const section=html.slice(html.indexOf('  function '+name+'(){'),html.indexOf('  function '+end+'(){',html.indexOf('  function '+name+'(){')));
  // Purchases helper has arguments; delimit its declaration instead.
  const source=name==='filteredRows'?html.slice(html.indexOf('  function filteredRows(){'),html.indexOf('  function cfRowsInRange(')):section;
  const fields={};for(const key of ['Period','CategoryFilter','CompanyFilter','Contractor','Paid','From','To','Sort'])fields[prefix+key]={value:''};
  fields[prefix+'Period']={value:'selected_month',_cfMonthPicker:{dates:()=>periods.dates('2024-02')}};
  const state={rows:['2024-01-31','2024-02-01','2024-02-29','2024-03-01'].map((date,i)=>({id:i,[dateField]:date,category:'A',contractor:'A'}))};
  const context={state,document:{getElementById:id=>fields[id]}};vm.createContext(context);vm.runInContext(source+';this.run='+name,context);
  assert.deepEqual(Array.from(context.run(),r=>r.id).sort(),[1,2]);
  state.rows[2].category='B';state.rows[2].contractor='B';fields[prefix+(prefix==='cfPurchase'?'CategoryFilter':'Contractor')].value='A';
  assert.deepEqual(Array.from(context.run(),r=>r.id),[1]);
 }
});
