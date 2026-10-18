const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const P=require('../app/priv/engine.js'),ui=fs.readFileSync(require('node:path').join(__dirname,'../app/priv/ui.js'),'utf8');
const credit={date:'2026-01-10',recipient:'Nadawca',title:'Zapłata',account:'',amount:10000,currency:'PLN',id:'i1'};
const imp=(from,to,extra={})=>({from,to,complete:true,incomeVersion:1,currency:'PLN',...extra});
test('credits are separate from debits, opening/closing balances and foreign description prices',()=>{
 const p=P.parsePages([['Okres: 01.01.2026 - 31.01.2026','Waluta rachunku PLN','Saldo początkowe 500,00','10.01.2026 PRZELEW PRZYCHODZĄCY +100,00 -50,00','NADAWCA: Firma testowa','TYTUŁ: Zapłata','11.01.2026 PRZELEW WYCHODZĄCY -20,00 -70,00','ODBIORCA: ZUS','12.01.2026 ZWROT +5,00 -65,00','NADAWCA: Sklep','Cena pierwotna 2,00 EUR','Saldo końcowe -65,00']]);
 assert.equal(p.incomes.length,2);assert.equal(p.incomes[0].amount,10000);assert.equal(p.incomes[0].recipient,'Firma testowa');assert.equal(p.incomes[0].title,'Zapłata');assert.equal(p.incomes[1].currency,'PLN');assert.equal(p.transactions.length,1);assert.equal(p.transactions[0].amount,2000);assert.equal(p.warnings.length,0);
});
test('income-only PDF and split mBank credit cells read the amount column, not negative balance',()=>{
 const row=(...items)=>({text:items.map(i=>i[0]).join(' '),items:items.map(([text,x])=>({text,x}))});
 const p=P.parsePages([[row(['Data operacji',60],['Opis',118],['Kwota',407],['Saldo',470]),row(['10-01-2026',60],['PRZELEW WEWNĘTRZNY PRZYCHODZĄCY',118]),row(['1 234,56',445],['-50,00',516]),row(['10-01-2026',60],['NADAWCA: Firma testowa',118])]]);
 assert.equal(p.incomes.length,1);assert.equal(p.incomes[0].amount,123456);assert.equal(p.incomes[0].recipient,'Firma testowa');assert.equal(p.transactions.length,0);
});
test('unread credit blocks completeness without becoming an outgoing contractor',()=>{
 const p=P.parsePages([['10.01.2026 PRZELEW PRZYCHODZĄCY','NADAWCA: Nieznany']]);assert.equal(p.incomes.length,0);assert.equal(p.warnings.length,1);assert.equal(p.unreadIncomes.length,1);assert.equal(p.unread.length,0);
});
test('average includes complete zero-income months, excludes gaps, current month, legacy imports and other currencies',()=>{
 const s={imports:[imp('2026-01-01','2026-01-31'),imp('2026-02-01','2026-02-28'),imp('2026-03-01','2026-03-31',{incomeVersion:undefined}),imp('2026-04-02','2026-04-30'),imp('2026-05-01','2026-05-31')],incomes:[credit,{...credit,date:'2026-03-10',amount:20000},{...credit,date:'2026-05-10',amount:30000},{...credit,amount:990000,currency:'EUR'},{...credit,amount:5000,excluded:true}]};
 const a=P.incomeSummary(s,2026,'PLN','2026-05-16');assert.equal(a.average,5000);assert.equal(a.fullMonths,2);assert.equal(a.total,60000);assert.equal(a.months[1].complete,true);assert.equal(a.months[1].total,0);assert.equal(a.months[2].complete,false);assert.equal(a.months[3].complete,false);assert.equal(a.months[4].finished,false);assert.equal(a.months[0].excluded,1);
});
test('leap-year full coverage joins intervals, exclusion changes average and unknown months have no average',()=>{
 const s={imports:[imp('2028-02-01','2028-02-14'),imp('2028-02-15','2028-02-29')],incomes:[{...credit,date:'2028-02-29',excluded:true}]};let a=P.incomeSummary(s,2028,'PLN','2028-03-01');assert.equal(a.fullMonths,1);assert.equal(a.average,0);s.incomes[0].excluded=false;a=P.incomeSummary(s,2028,'PLN','2028-03-01');assert.equal(a.average,10000);assert.equal(P.incomeSummary({imports:[],incomes:[]},2026,'PLN','2026-10-16').average,null);
});
function importContext(batches,complete=true){
 const sections=batches.map((_,i)=>({dataset:{batch:String(i)},querySelector:()=>({checked:complete})}));let id=0;
 const c=vm.createContext({P,id:()=>String(++id),$:()=>({querySelectorAll:()=>sections})});
 vm.runInContext(ui.slice(ui.indexOf('function importProblems('),ui.indexOf('\nasync function preview(')),c);return c;
}
test('imports keep all credits without rules, deduplicate overlapping PDFs and retain manual exclusions on re-import',()=>{
 const batches=[{hash:'a',name:'a.pdf',currency:'PLN',range:{from:'2026-01-01',to:'2026-01-31'},warnings:[],transactions:[],incomes:[credit,{...credit,id:'i2'}]},{hash:'b',name:'b.pdf',currency:'PLN',range:{from:'2026-01-01',to:'2026-01-31'},warnings:[],transactions:[],incomes:[credit]}];
 const s={rules:[],transactions:[],imports:[{hash:'a',complete:true}],incomes:[]},c=importContext(batches);c.appendImport(s,batches,[]);assert.equal(s.incomes.length,2);assert.equal(s.imports.length,2);assert.equal(s.imports[0].incomeVersion,1);s.incomes[0].excluded=true;c.appendImport(s,batches,[]);assert.equal(s.incomes.length,2);assert.equal(s.incomes[0].excluded,true);assert.equal(s.transactions.length,0);
});
test('out-of-range credit saves safely without full-month confirmation',()=>{const b={hash:'a',range:{from:'2026-02-01',to:'2026-02-28'},warnings:[],transactions:[],incomes:[credit]},c=importContext([b]),s={imports:[],incomes:[],transactions:[],rules:[]};c.appendImport(s,[b],[]);assert.equal(s.imports[0].complete,false);assert.equal(s.incomes.length,1);assert.match(c.importProblems(b)[0],/2026-01-10.*2026-02-01/);});
test('legacy vaults migrate safely; income and exclusions survive encryption, backup, and PIN change',async()=>{
 const {validateCash}=await import('../app/priv/cash.js'),v=await import('../app/priv/vault.js');
 const c=vm.createContext({P,validateCash});vm.runInContext(ui.slice(ui.indexOf('function validate(s)'),ui.indexOf('\nfunction notice(')),c);
 const old={version:1,rules:[],transactions:[],imports:[]};c.validate(old);assert.equal(old.incomes.length,0);assert.equal(old.cash.length,0);
 const state={...old,incomes:[{...credit,excluded:true}]},salt=v.newSalt(),key=await v.keyFor('test-income-pin',salt),encrypted=await v.seal(c.validate(state),key,salt);assert(!JSON.stringify(encrypted).includes('Nadawca'));
 const restored=c.validate(await v.open(JSON.parse(JSON.stringify(encrypted)),key));assert.deepEqual(restored.incomes,state.incomes);
 const salt2=v.newSalt(),key2=await v.keyFor('changed-test-pin',salt2);assert.deepEqual((await v.open(await v.seal(restored,key2,salt2),key2)).incomes,state.incomes);
 assert.throws(()=>c.validate({...old,incomes:[{...credit,amount:-1}]}),/nieprawidłowe przelewy/);
});
test('income section renders months and exclusions save immediately through existing encrypted persistence',async()=>{
 const elements={year:{value:'2026'},incomeCurrency:{value:'PLN'},incomeUpload:{},incomeSummary:{innerHTML:'',querySelectorAll:()=>[]},modalBody:{querySelectorAll:selector=>selector==='[data-income-id]'?[box]:[]}};
 const box={dataset:{incomeId:'i1'},checked:true,disabled:false};let saved,modalBody='',mode;
 const state={imports:[imp('2026-01-01','2026-01-31')],incomes:[credit]},c=vm.createContext({state,P,$:id=>elements[id],today:()=> '2026-10-16',monthNames:Array.from({length:12},(_,i)=>String(i+1)),escape:s=>s,money:n=>(n/100).toFixed(2),importInFlight:false,structuredClone,generation:1,key:{},choosePdf:m=>{mode=m;},modal:(_title,body)=>{modalBody=body;},action:fn=>fn(),persist:async next=>{saved=next;c.state=next;}});
 vm.runInContext(ui.slice(ui.indexOf("let incomeCurrency='PLN';"),ui.indexOf('function showCash(')),c);c.renderIncome();assert.match(elements.incomeSummary.innerHTML,/Wszystkie wpływy na konto/);assert.match(elements.incomeSummary.innerHTML,/Średnia miesięczna · 1 pełnych/);assert.equal((elements.incomeSummary.innerHTML.match(/data-income-month=/g)||[]).length,12);
 elements.incomeUpload.onclick();assert.equal(mode,'income');c.showIncomeMonth('2026-01');assert.match(modalBody,/Nadawca/);box.checked=false;await box.onchange();assert.equal(saved.incomes[0].excluded,true);assert.match(modalBody,/Suma uwzględniona: <strong>0.00/);
});
test('same-file income backfill does not duplicate existing watched outgoing payments',()=>{
 const expense={...credit,id:'e1',recipient:'ZUS',sourceHash:'a'},rule={id:'r1',recipient:'ZUS',currency:'PLN'},b={hash:'a',name:'a.pdf',range:{from:'2026-01-01',to:'2026-01-31'},warnings:[],transactions:[expense],incomes:[credit]};
 const s={rules:[rule],transactions:[expense],imports:[{hash:'a',complete:true}],incomes:[]},c=importContext([b]);c.appendImport(s,[b],[expense]);c.appendImport(s,[b],[expense]);assert.equal(s.transactions.length,1);assert.equal(s.incomes.length,1);assert.equal(s.imports.length,1);
});

test('one problematic statement never blocks a mixed batch or inherits false completeness',()=>{
 const good={hash:'good',name:'good.pdf',range:{from:'2026-01-01',to:'2026-01-31'},warnings:[],transactions:[],incomes:[credit]},bad={...good,hash:'bad',warnings:['Nie rozpoznano kwoty operacji z 2026-01-12'],incomes:[{...credit,amount:20000}]};
 const c=importContext([good,bad]),state={rules:[],transactions:[],imports:[{hash:'bad',complete:true}],incomes:[]};c.appendImport(state,[good,bad],[]);assert.equal(state.incomes.length,2);assert.equal(state.imports.find(i=>i.hash==='good').complete,true);assert.equal(state.imports.find(i=>i.hash==='bad').complete,false);assert.equal(P.incomeSummary({imports:state.imports.filter(i=>i.hash==='bad'),incomes:state.incomes},2026,'PLN','2026-10-16').fullMonths,0);
});
test('preview explains date and unread problems and only disables invalid completeness checkboxes',()=>{
 const good={name:'good',range:{from:'2026-01-01',to:'2026-01-31'},warnings:[],transactions:[],incomes:[credit]},bad={...good,name:'bad',range:{from:'2026-02-01',to:'2026-02-28'}},c=importContext([good,bad]);c.escape=s=>s;const html=c.importOptions([good,bad]);assert.equal((html.match(/data-complete disabled/g)||[]).length,1);assert.match(html,/Operacja 2026-01-10/);assert.match(html,/Odczytane operacje można zapisać/);
});
