const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const P=require('../app/priv/engine.js');
const imp=(from,to,extra={})=>({from,to,complete:true,incomeVersion:1,currency:'PLN',...extra});
const credit={id:'s1',date:'2026-01-10',amount:300000,currency:'PLN',title:'Wynagrodzenie z umowy spółki',recipient:'Firma'};
test('salary is title based, accent insensitive, includes BLIK/internal credits and honors explicit overrides',()=>{
 for(const title of ['WYNAGRODZENIE z umowy spółki','Wynagrodzenia — wrzesień','wynagr. 10/2026','Pensja','BLIK wypłata wynagrodzenia'])assert(P.isSalary({...credit,title}),title);
 for(const title of ['Zwrot kosztów','Zapłata za fakturę','Przelew wewnętrzny','BLIK od kolegi'])assert(!P.isSalary({...credit,title}),title);
 assert(!P.isSalary({...credit,salary:false}));assert(P.isSalary({...credit,title:'Umowa spółki',salary:true}));
 const parsed=P.parsePages([['Okres: 01.01.2026 - 31.01.2026','10.01.2026 PRZELEW WEWNĘTRZNY PRZYCHODZĄCY +3000,00 4000,00','NADAWCA: Firma','TYTUŁ: Wynagrodzenie z umowy spółki','11.01.2026 BLIK P2P PRZYCHODZĄCY +100,00 4100,00','NADAWCA: Firma','TYTUŁ: Wynagr.','12.01.2026 PRZELEW WYCHODZĄCY -100,00 4000,00','TYTUŁ: Wynagrodzenie']]);
 assert.equal(parsed.incomes.length,2);assert.equal(parsed.incomes.filter(P.isSalary).length,2);assert.equal(parsed.transactions.length,1);
});
test('salary averages zero-payment covered months, separates currencies, never confuses gaps and current/partial months',()=>{
 const state={imports:[imp('2026-01-01','2026-02-28'),imp('2026-04-02','2026-04-30'),imp('2026-10-01','2026-10-31')],incomes:[{...credit,excluded:true},{...credit,id:'a',salary:false},{...credit,id:'b',date:'2026-04-20',amount:200000},{...credit,id:'c',date:'2026-10-15'},{...credit,id:'d',currency:'EUR'}]};
 const s=P.salarySummary(state,2026,'PLN','2026-10-18');assert.equal(s.average,150000);assert.equal(s.fullMonths,2);assert.equal(s.total,800000);assert.equal(s.months[0].count,1);assert.equal(s.months[1].count,0);assert(s.months[1].complete);assert(!s.months[2].hasData);assert(!s.months[3].complete);assert(!s.months[9].finished);
 assert.equal(P.incomeSummary(state,2026,'PLN','2026-10-18').months[0].total,300000);
 assert.equal(P.salarySummary(state,2026,'EUR','2026-10-18').average,null);
});
test('manual overrides survive duplicate statement merge and encrypted backup/account reopen',async()=>{
 const v=await import('../app/priv/vault.js');const existing=[{...credit,salary:false,excluded:true}],rows=P.mergeTransactions(existing,[{...credit,id:'reimport'}]);assert.equal(rows.length,1);assert.equal(rows[0].salary,false);
 const state={version:1,rules:[],transactions:[],imports:[],cash:[],incomes:rows},envelope=await v.accountEnvelope(state),copy=JSON.parse(JSON.stringify(envelope));assert.deepEqual((await v.openAccount(copy)).state,state);assert(!JSON.stringify(copy).includes(credit.title));
});
test('salary selection saves immediately, auto clears override, failed persistence restores prior selection',async()=>{
 const source=fs.readFileSync('app/priv/ui.js','utf8');let saved,fail=false;
 const select={dataset:{salaryId:'s1'},value:'no'},els={modalBody:{querySelectorAll:s=>s==='[data-salary-id]'?[select]:[]}};
 const c=vm.createContext({state:{incomes:[credit]},P,$:id=>els[id],structuredClone,generation:1,key:{},money:n=>n,escape:s=>s,modal(){},action:fn=>fn(),persist:async s=>{if(fail)throw Error('conflict');saved=s;c.state=s;}});
 vm.runInContext("let incomeCurrency='PLN';"+source.slice(source.indexOf('function showIncomeMonth('),source.indexOf('function showCash(')),c);
 c.showIncomeMonth('2026-01',true);await select.onchange();assert.equal(saved.incomes[0].salary,false);
 select.value='auto';await select.onchange();assert(!('salary' in saved.incomes[0]));
 fail=true;select.value='yes';await assert.rejects(select.onchange(),/conflict/);assert.equal(select.value,'auto');assert.equal(select.disabled,false);
});
