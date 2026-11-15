const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fx=require('../app/exchange-rate.js'),engine=require('../app/reports-engine.js');
function render(rows,exchange=fx){
 const pane={innerHTML:'',querySelectorAll:()=>[]};
 const root={CFReportEngine:engine,CFExchange:exchange};
 const source=fs.readFileSync(require.resolve('../app/reports-ui.js'),'utf8').replace(/root\.CFReports=\{[^\n]+?\};/,'root.renderTest=(r,h)=>{result=r;host=h;renderRows();};');
 vm.runInNewContext(source,{window:root});
 root.renderTest({rows,cfg:{columns:['plate','cost']},fields:{plate:{label:'Rejestracja'},cost:{label:'Kwota usługi'}}},{querySelector:()=>pane});
 return pane.innerHTML.replace(/\s/g,' ');
}
test('source table labels EUR and PLN and displays converted amount for DTV572',()=>{
 fx.set({rate:4.2454});
 const html=render([{plate:'DTV572',cost:125,currency:'EUR',paid:false,wash_date:'2026-09-25'},{plate:'ST7192X',cost:150}]);
 assert.match(html,/125,00 EUR \/ ≈530,68 PLN/);
 assert.match(html,/<td>150,00 PLN<\/td>/);
});
test('source table retains paid snapshot while other EUR rows change with quote',()=>{
 fx.set({rate:4.5});
 const html=render([{plate:'PAID',cost:125,currency:'EUR',paid:true,wash_date:'2026-09-25',pln_rate:4.2454,pln_amount:530.68},{plate:'UNPAID',cost:125,currency:'EUR'}]);
 assert.match(html,/125,00 EUR \/ 530,68 PLN/);
 assert.match(html,/125,00 EUR \/ ≈562,50 PLN/);
});
test('source table keeps currency visible when conversion module is unavailable',()=>{
 const html=render([{cost:125,currency:'EUR'},{cost:150,currency:'PLN'}],null);
 assert.match(html,/125,00 EUR \/ brak kursu PLN/);
 assert.match(html,/150,00 PLN/);
});

test('quick report separates wash, named extra and total in both preview values and PDF rows',()=>{
 const root={CFReportEngine:engine},source=fs.readFileSync(require.resolve('../app/reports-ui.js'),'utf8').replace('root.CFReports={','root.quickTest={quickServiceRows,cell,adminPdfSourceTable};root.CFReports={');vm.runInNewContext(source,{window:root});
 const original={id:'one',plate:'WGM6784A',approved:true,cost:500,wash_base_cost:400,currency:'PLN',order_cost:400,order_currency:'PLN',completion_notes:'Pranie wnętrza',additional_services:[{name:'Demontaż i pranie zasłon',price:100}]};
 const h=root.quickTest,rows=h.quickServiceRows([original]);assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>h.cell(r,'final_cost')),['400,00 PLN','100,00 PLN','500,00 PLN']);assert.equal(h.cell(rows[1],'completion_notes'),'Usługa dodatkowa — Demontaż i pranie zasłon');assert.equal(h.cell(rows[1],'plate'),'');assert.equal(rows.reduce((s,r)=>s+r.cost,0),500);assert.equal(original.cost,500);
 let body;const doc={internal:{pageSize:{getWidth:()=>297}},setTextColor(){},setFontSize(){},text(){},autoTable(options){body=options.body;this.lastAutoTable={finalY:70};}};
 h.adminPdfSourceTable(doc,{rows,sourceRowCount:1,cfg:{columns:['completion_notes','final_cost']},fields:{completion_notes:{label:'Opis'},final_cost:{label:'Kwota'}}},30,null);
 assert.deepEqual(Array.from(body,row=>typeof row[1]==='object'?row[1].content:row[1]),['400,00 PLN','100,00 PLN','500,00 PLN']);assert.equal(body[1][0],'Usługa dodatkowa — Demontaż i pranie zasłon');
});
