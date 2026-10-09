const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
const body=html.slice(html.indexOf('  async function loadRows(){',html.indexOf('async function cfShowEarnings(')),html.indexOf('\n  function filtered(){',html.indexOf('async function cfShowEarnings(')));
const contractors=html.slice(html.indexOf('  function cfEarningContractors(){'),html.indexOf('\n  function cfOpenEarningRules(){'));
function setup({conversionError=false,linkedError=false,earningError=false,ruleError=false,locked=false}={}){
 const elements=Object.fromEntries(['cfEarningContractor','cfEarningRulesBtn','cfEarningAddBtn'].map(id=>[id,{disabled:true,innerHTML:''}]));
 const state={rows:[],rules:[],contractors:[]};let renderCount=0;
 const c=vm.createContext({state,document:{getElementById:id=>elements[id]},allowed:()=>!locked,escapeHtml:s=>s,render:()=>renderCount++,cfRefreshExchangeRate:async()=>null,window:{CFExchange:{earnings:r=>{if(conversionError)throw Error('Brak kursu');return r;}}},cfSupabase:{from:name=>({select:()=>({order:async()=>name==='cf_earning_rules'?{data:[{id:'r1',contractor:'Aga',employee_percent:30}],error:ruleError?Error('reguły niedostępne'):null}:{data:[{contractor:'TVM',source_wash_record_id:'wash1'}],error:earningError?Error('historia niedostępna'):null},in:async()=>({data:[{id:'wash1',currency:'EUR'}],error:linkedError?Error('pranie niedostępne'):null})})})}});
 vm.runInContext(body+contractors,c);return {c,state,elements,renderCount:()=>renderCount};
}
for(const failure of ['conversionError','linkedError','earningError'])test(`rules and suggestions survive ${failure}`,async()=>{
 const s=setup({[failure]:true});await assert.rejects(s.c.loadRows());assert.equal(s.state.rules[0].employee_percent,30);assert.equal(s.elements.cfEarningRulesBtn.disabled,false);assert.equal(s.elements.cfEarningAddBtn.disabled,false);const names=Array.from(s.c.cfEarningContractors());assert(names.includes('Aga'));if(failure!=='earningError')assert(names.includes('TVM'));assert.equal(s.renderCount(),0);
});
test('normal read retains history and suggestions from rules and old earnings',async()=>{const s=setup();await s.c.loadRows();assert.equal(s.state.rows.length,1);assert.deepEqual(Array.from(s.c.cfEarningContractors()),['Aga','TVM']);assert.equal(s.renderCount(),1);});
test('failed rule read never enables actions with an empty list',async()=>{const s=setup({ruleError:true});await assert.rejects(s.c.loadRows());assert.equal(s.elements.cfEarningRulesBtn.disabled,true);assert.equal(s.elements.cfEarningAddBtn.disabled,true);});
test('locked finance pane never loads private metadata',async()=>{const s=setup({locked:true});await s.c.loadRows();assert.equal(s.state.rules.length,0);assert.equal(s.elements.cfEarningAddBtn.disabled,true);});
