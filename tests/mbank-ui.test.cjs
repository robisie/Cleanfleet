const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const bank=require('../app/mbank-mt940.js');
const text=['mBank S.A. Bankowość Detaliczna;','#Za okres:;','01.08.2026;31.08.2026;','#Waluta;','PLN;','#Numer rachunku;','50114020040000360276034397;','#Saldo początkowe;0,00 PLN;','#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji;','2026-08-02;2026-08-02;PRZELEW;"Zapłata";"Firma";\'\';10,00;10,00;',';;;;;;#Saldo końcowe;10,00 PLN;'].join('\r\n');
test('bank UI downloads only a complete valid batch and cancels stale conversions',async()=>{
  const elements=new Map();
  function element(){return {value:'',dataset:{},disabled:false,children:[],replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);}};}
  for(const id of ['cfAccountingMonth','cfAccountingBankNumber','cfAccountingBankEncoding','cfAccountingBankInput','cfAccountingBankConvert','cfAccountingBankStatus','cfAccountingBankResults'])elements.set(id,element());
  elements.get('cfAccountingMonth').value='2026-08';elements.get('cfAccountingBankNumber').value='8';elements.get('cfAccountingBankEncoding').value='utf-8';
  const context={window:{CFMBankMT940:bank,cfBackupBridge:{isAdmin:()=>true}},document:{readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id),createElement:element}};
  vm.createContext(context);
  const source=fs.readFileSync('app/accounting-documents-v1510.js','utf8').replace(/\}\)\(\);\s*$/,'globalThis.harness={convertBank,resetBank,setFiles:files=>{bankFiles=files;},results:()=>bankResults};})();');
  vm.runInContext(source,context);
  const file={name:'account.csv',size:text.length,arrayBuffer:async()=>bank.encode(text,'utf-8').buffer};
  context.harness.setFiles([file]);await context.harness.convertBank();
  assert.match(elements.get('cfAccountingBankStatus').textContent,/Gotowe/);assert.equal(context.harness.results().length,1);
  assert.equal(new TextDecoder().decode(context.harness.results()[0].bytes),bank.build(bank.parse(text,'2026-08'),8));
  assert.equal(elements.get('cfAccountingBankResults').children.length,1);
  context.harness.setFiles([file,file]);await context.harness.convertBank();
  assert.equal(context.harness.results().length,0);assert.match(elements.get('cfAccountingBankStatus').textContent,/tego samego rachunku/);
  assert.equal(elements.get('cfAccountingBankResults').children.length,0);
  let release;context.harness.setFiles([{...file,arrayBuffer:()=>new Promise(resolve=>{release=resolve;})}]);
  const pending=context.harness.convertBank();context.harness.resetBank();elements.get('cfAccountingMonth').value='2026-09';release(bank.encode(text,'utf-8').buffer);await pending;
  assert.equal(context.harness.results().length,0);
});
