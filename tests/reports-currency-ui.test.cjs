const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fx=require('../app/exchange-rate.js'),engine=require('../app/reports-engine.js');
function render(rows,exchange=fx){
 const pane={innerHTML:'',querySelectorAll:()=>[]};
 const root={CFReportEngine:engine,CFExchange:exchange};
 const source=fs.readFileSync(require.resolve('../app/reports-ui.js'),'utf8').replace('root.CFReports={open,reset,vehicleReportPreview,vehiclePDF,vehicleModel,vehicleReportPDF};','root.renderTest=(r,h)=>{result=r;host=h;renderRows();};');
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
