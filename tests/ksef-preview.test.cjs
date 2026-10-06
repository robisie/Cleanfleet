const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context={Intl};vm.createContext(context);vm.runInContext(fs.readFileSync('app/ksef-preview.js','utf8'),context);const totals=invoices=>JSON.parse(JSON.stringify(context.CFKsefPreview.totals(invoices)));
test('invoice totals are exact to cents, include negative corrections and keep currencies separate',()=>{
 const rows=[{gross:'0.10',currency:'PLN'},{gross:'0.20',currency:'PLN'},{gross:'-0.03',currency:'PLN'},{gross:'1234.56',currency:'EUR'},{gross:'-10.00',currency:'EUR'}];const result=totals(rows);assert.equal(result.missing,0);assert.equal(result.amounts[0].replace(/\s/g,''),'1224,56EUR');assert.equal(result.amounts[1],'0,27 PLN');assert.equal(totals([{gross:0,currency:'PLN'}]).amounts[0],'0,00 PLN');assert.equal(totals([{gross:'-123.45',currency:'PLN'}]).amounts[0],'-123,45 PLN');
});
test('missing or malformed amounts never become zero in a complete-looking total',()=>{
 const result=totals([{gross:'',currency:'PLN'},{gross:null,currency:'PLN'},{gross:'x',currency:'PLN'},{gross:'10.555',currency:'PLN'},{gross:'10.00',currency:''},{gross:'2.00',currency:'PLN'}]);assert.equal(result.missing,5);assert.deepEqual(result.amounts,['2,00 PLN']);assert.deepEqual(totals([]),{amounts:[],missing:0});
});
