import test from 'node:test';import assert from 'node:assert/strict';
import {matchReceiptEvidence,conversionPlan,createQuoteReader,hydrateCurrencies} from '../pack/accountant-currency.js';
import * as C from '../pack/accountant-core.js';
const today='2026-11-01',base={key:'sales:EUR',kind:'sales',number:'A3/9/2026',type:'Vat',currency:'EUR',native:10000,gross:10000,issueDate:'2026-09-26'};
const state=()=>{const s=C.defaults();s.years['2026']={regime:'classic',rate:9,vat:'exempt',loss:0,adjustment:0,complete:false};return s;};
const invoice=(id,extra={})=>({id,number:id,status:'accepted',ksef_number:id,payload:{issueDate:'2026-09-26',saleDate:'2026-09-20',currency:'EUR',buyer:{name:'TVM'},lines:[{price:'100',qty:'1',vatRate:'zw'}],...extra}});
const quote=async(currency,at)=>({currency,requestedDate:at,date:at,rate:at==='2026-10-20'?4.5:4,table:'A/NBP',source:'NBP'});
test('matches one exact invoice reference only, keeps dates and amounts without leaking bank data',()=>{
 const income={id:'credit',date:'2026-10-20',amount:45000,currency:'PLN',title:'Zapłata A3/9/2026',sourceName:'mBiznes konto.pdf',account:'private-account',recipient:'private-party'};
 const evidence=matchReceiptEvidence([base],[income,{...income},{...income,id:'wrong',title:'Zapłata KA3/9/2026'},{...income,id:'excluded',excluded:true},{...income,id:'future',date:'2027-01-01'}],today);
 assert.equal(evidence.length,1);assert.equal(evidence[0].key,base.key);assert.equal(evidence[0].date,'2026-10-20');assert.equal(evidence[0].currency,'PLN');assert(!('title'in evidence[0]));assert(!('account'in evidence[0]));assert(!('recipient'in evidence[0]));
 assert.equal(matchReceiptEvidence([base,{...base,key:'duplicate'}],[income],today).length,0);
});
test('receipt date wins, no confirmed date falls back to issue date rather than sale date',()=>{
 assert.deepEqual(conversionPlan({...base,date:'2026-09-20',manual_paid:true},[],today),[{date:'2026-09-26',basis:'issue',native:10000}]);
 const crossCurrency=[{key:base.key,date:'2026-10-20',amountCents:45000,currency:'PLN'}];assert.deepEqual(conversionPlan(base,crossCurrency,today),[{date:'2026-10-20',basis:'receipt-date',native:10000}]);
 const paid={...base,paid:{amount:'100',date:'2026-10-20'}};assert.deepEqual(conversionPlan(paid,[],today),[{date:'2026-10-20',basis:'receipt',native:10000}]);
});
test('partial payments use their own dates, preserve exact sum and do not duplicate invoice upfront evidence',()=>{
 const row={...base,paid:{amount:'50',date:'2026-10-20'}},payments=[{key:base.key,date:'2026-10-20',amountCents:5000,currency:'EUR'}];
 const legs=conversionPlan(row,payments,today);assert.equal(legs.length,2);assert.equal(legs[0].native,5000);assert.equal(legs[1].native,5000);assert.equal(legs[1].date,base.issueDate);assert.equal(legs.reduce((n,l)=>n+l.native,0),base.native);
 const tiny=conversionPlan({...base,native:1},payments,today);assert.equal(tiny.reduce((n,l)=>n+l.native,0),1);
});
test('NBP reader requests historical range, uses last rate not after requested day and caches duplicate requests',async()=>{
 let calls=0;const reader=createQuoteReader({asOf:()=>today,fetchImpl:async url=>{calls++;assert.match(url,/EUR\/2026-09-12\/2026-09-26/);return {ok:true,status:200,json:async()=>({code:'EUR',table:'A',rates:[{no:'A1',effectiveDate:'2026-09-25',mid:4.2},{no:'future',effectiveDate:'2026-09-28',mid:4.8}]})};}});
 const [a,b]=await Promise.all([reader.read('EUR','2026-09-26'),reader.read('EUR','2026-09-26')]);assert.equal(calls,1);assert.equal(a.rate,4.2);assert.equal(a.date,'2026-09-25');assert.equal(a.requestedDate,'2026-09-26');assert.equal(a,b);await assert.rejects(reader.read('EUR','2027-01-01'),/historycznej/);
});
test('NBP table B fallback and failed responses never invent a rate',async()=>{
 const reader=createQuoteReader({asOf:()=>today,fetchImpl:async url=>url.includes('/A/')?{status:404,ok:false}:{status:200,ok:true,json:async()=>({code:'EUR',table:'B',rates:[{no:'B1',effectiveDate:'2026-09-24',mid:4.1}]})}});assert.equal((await reader.read('EUR','2026-09-26')).rate,4.1);
 const invalid=createQuoteReader({asOf:()=>today,fetchImpl:async()=>({status:200,ok:true,json:async()=>({code:'USD',table:'A',rates:[]})})});await assert.rejects(invalid.read('EUR','2026-09-26'),/odpowiedź/);
});
test('automatic conversion is integrated into results, keeps exact partial totals and honors manual PLN overrides',async()=>{
 const s=state(),data={bills:[invoice('EUR')]};data.fx=await hydrateCurrencies(data,s,{quote,getReceiptEvidence:()=>[{key:'sales:EUR',date:'2026-10-20',amountCents:5000,currency:'EUR'}],asOf:today});
 let row=C.documents(data,s)[0];assert.equal(row.issueDate,'2026-09-26');assert.equal(row.base,42500);assert.equal(row.status,'include');assert.equal(row.issues.length,0);assert.equal(row.fx.legs.length,2);
 assert.match(C.csv([row]),/2026-10-20/);s.overrides['sales:EUR']={pln:42000,date:'2026-09-20',percent:100,status:'include'};data.fx=await hydrateCurrencies(data,s,{quote:()=>{throw Error('should not call')},asOf:today});row=C.documents(data,s)[0];assert.equal(row.base,42000);assert.equal(row.fx,null);
});
test('unpaid invoice uses issue-day quote, new receipt updates conversion, zero corrections require no quote',async()=>{
 const s=state(),data={bills:[invoice('EUR'),invoice('ZERO',{correction:{before:invoice('BEFORE').payload}})]};let count=0;const tracked=async(...args)=>{count++;return quote(...args);};
 data.fx=await hydrateCurrencies(data,s,{quote:tracked,asOf:today});assert.equal(C.documents(data,s).find(r=>r.number==='EUR').base,40000);assert.equal(count,1);assert.equal(C.documents(data,s).find(r=>r.number==='ZERO').base,0);
 data.fx=await hydrateCurrencies(data,s,{quote:tracked,getReceiptEvidence:()=>[{key:'sales:EUR',date:'2026-10-20',amountCents:45000,currency:'PLN'}],asOf:today});assert.equal(C.documents(data,s).find(r=>r.number==='EUR').base,45000);
});
test('provider failure preserves missing conversion and gives an actionable message',async()=>{
 const s=state(),data={bills:[invoice('EUR')]};data.fx=await hydrateCurrencies(data,s,{quote:async()=>{throw Error('NBP niedostępny — odśwież dane.');},asOf:today});const row=C.documents(data,s)[0];assert.equal(row.base,null);assert.equal(row.status,'pending');assert.match(row.issues[0],/NBP niedostępny/);
});
test('private receipt bridge exposes company income only while the private frame is unlocked',async()=>{
 const fs=await import('node:fs/promises'),vm=await import('node:vm'),source=await fs.readFile(new URL('../app/priv/ui.js',import.meta.url),'utf8'),engine=await fs.readFile(new URL('../app/priv/engine.js',import.meta.url),'utf8');
 const context=vm.createContext({window:{},console,matchReceiptEvidence,today:()=>today,key:null,user:null,state:null,busy:false,importInFlight:false,activity(){},lock(){},cashBalance:()=>0});vm.runInContext(engine,context);context.P=context.Payments;
 vm.runInContext(source.slice(source.indexOf('window.CFPrivateFinance={'),source.indexOf('if(financeEmbedded){document.documentElement')),context);
 const api=context.window.CFPrivateFinance;assert.equal(api.invoiceReceipts([base]).length,0);
 context.key={};context.user={id:'owner'};context.state={imports:[],incomes:[{id:'b',date:'2026-10-20',amount:45000,currency:'PLN',title:'A3/9/2026',sourceName:'mBiznes konto.pdf'},{id:'p',date:'2026-10-21',amount:45000,currency:'PLN',title:'A3/9/2026',sourceName:'eKonto.pdf'},{id:'unknown',date:'2026-10-22',amount:45000,currency:'PLN',title:'A3/9/2026',sourceName:'nieznane.pdf'}]};
 const result=api.invoiceReceipts([base]);assert.equal(result.length,1);assert.equal(result[0].date,'2026-10-20');context.key=null;assert.equal(api.invoiceReceipts([base]).length,0);
});
