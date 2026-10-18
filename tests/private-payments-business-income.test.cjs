const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../app/priv/engine.js');
const imp=(hash,name,from,to)=>({hash,name,from,to,complete:true,currency:'PLN',incomeVersion:1});
const row=(id,sourceHash,amount,date='2026-01-10')=>({id,sourceHash,amount,date,currency:'PLN',title:'Przelew'});
test('m/mBiznes statements are business, E/eKonto are private, unknown filenames are not counted',()=>{
 for(const name of ['mBiznes konto p nr _123 za 2026-01.pdf','mBiznes konto S.pdf','M.pdf','m wyciąg.pdf'])assert.equal(P.statementKind(name),'business');
 for(const name of ['eKonto nr _123.pdf','E.pdf','E styczeń.pdf'])assert.equal(P.statementKind(name),'personal');
 for(const name of [undefined,'wyciąg.pdf','mój wyciąg.pdf','bank mBank.pdf'])assert.equal(P.statementKind(name),'unknown');
});
test('company totals, details and coverage omit private/unknown sources without mutating state or salary',()=>{
 const state={imports:[imp('m','mBiznes konto.pdf','2026-01-01','2026-02-28'),imp('e','eKonto.pdf','2026-01-01','2026-03-31'),imp('u','wyciąg.pdf','2026-04-01','2026-04-30')],incomes:[row('m','m',100000),{...row('m2','m',20000),excluded:true},row('e','e',900000),row('e3','e',50000,'2026-03-10'),row('u','u',70000,'2026-04-10')]};
 const before=JSON.stringify(state),scope=P.businessIncomeState(state),s=P.businessIncomeSummary(state,2026,'PLN','2026-10-18');
 assert.deepEqual(scope.incomes.map(t=>t.id),['m','m2']);assert.equal(scope.imports.length,1);assert.equal(s.total,100000);assert.equal(s.average,50000);assert.equal(s.fullMonths,2);assert.equal(s.months[0].excluded,1);assert.equal(s.months[2].hasData,false);assert.equal(s.months[2].complete,false);assert.equal(s.months[3].hasData,false);
 assert.equal(JSON.stringify(state),before);
 assert.equal(P.incomeSummary(state,2026,'PLN','2026-10-18').total,1120000);
});
test('import hash is authoritative; source-name fallback supports existing rows and does not include unknowns',()=>{
 const s={imports:[imp('e','eKonto.pdf','2026-01-01','2026-01-31')],incomes:[{...row('wrong','e',100),sourceName:'mBiznes.pdf'},{...row('old','missing',200),sourceName:'mBiznes konto.pdf'},row('unknown','missing',300),{...row('personal','missing',400),sourceName:'eKonto.pdf'}]};
 assert.deepEqual(P.businessIncomeState(s).incomes.map(t=>t.id),['old']);assert.equal(P.businessIncomeSummary(s,2026,'PLN','2026-10-18').total,200);assert.equal(P.businessIncomeSummary(s,2026,'PLN','2026-10-18').average,null);
});
