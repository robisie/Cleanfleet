import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const {Window}=await import(process.env.SHOPPING_DOM_MODULE||'happy-dom');
async function form(reminder){
 const window=new Window({url:'https://cleanfleet.pl/pack/'}),document=window.document,writes=[],calls=[];
 const query={insert(p){writes.push(p);return this;},update(p){writes.push(p);return this;},eq(){return this;},select(){return this;},single:async()=>({data:{id:'r'},error:null})};
 const client={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>query,functions:{invoke:async(name,args)=>{calls.push({name,...args});return {data:{status:'waiting'},error:null};}}};
 const context=vm.createContext({window,document,cfSupabase:client,cfCompanies:[],showToast(){},console,Date,Intl});
 vm.runInContext(await readFile(new URL('../app/reminder-form-v1251.js',import.meta.url),'utf8'),context);
 await window.CFReminderForm.open(reminder);const host=document.querySelector('#cfReminderRangeOverlay'),get=id=>host.querySelector('#'+id);
 return {window,document,host,get,writes,calls};
}
test('choosing KSeF saves one source and never starts the mailbox scanner',async()=>{
 const t=await form();try{
  t.get('cfrTitle').value='Leasing';t.get('cfrPayment').checked=true;t.get('cfrPayment').onchange();
  t.get('cfrInvoiceSource').value='ksef';t.get('cfrInvoiceSource').onchange();
  t.get('cfrKsefNip').value='6351861297';t.get('cfrMailFolder').value='';
  assert.equal(t.get('cfrMailFields').style.display,'none');assert.equal(t.get('cfrMailEnabled').checked,false);
  await t.host.querySelector('[data-save]').onclick();
  assert.equal(t.writes.length,1);assert.equal(t.writes[0].invoice_source,'ksef');assert.equal(t.writes[0].mail_invoice_enabled,false);assert.equal(t.writes[0].ksef_scan_status,'waiting');
  assert.equal(t.calls.length,1);assert.equal(t.calls[0].name,'cleanfleet-reminder-ksef');
 }finally{await t.window.happyDOM.abort()}
});
test('existing e-mail rules stay selected and continue using their existing scanner',async()=>{
 const t=await form({id:'r',title:'Leasing',is_payment:true,due_at:'2026-11-20T08:00:00Z',recurrence:'none',mail_invoice_enabled:true,mail_folder:'INBOX',mail_sender:'faktury@example.pl'});try{
  assert.equal(t.get('cfrInvoiceSource').value,'email');
  await t.host.querySelector('[data-save]').onclick();
  assert.equal(t.writes[0].invoice_source,'email');assert.equal(t.writes[0].mail_invoice_enabled,true);assert.equal(t.writes[0].mail_folder,'INBOX');
  assert.equal(t.calls[0].name,'cleanfleet-reminder-mail-now');
 }finally{await t.window.happyDOM.abort()}
});
test('switching sources hides e-mail review and shows KSeF candidates without writing',async()=>{
 const t=await form({id:'r',title:'Leasing',is_payment:true,invoice_source:'email',due_at:'2026-11-20T08:00:00Z',mail_invoice_enabled:true,mail_scan_status:'needs_review',mail_candidate:{amount:100,invoice_number:'FV/1',due_date:'2026-11-20'},ksef_seller_nip:'6351861297'});try{
  t.get('cfrInvoiceSource').value='ksef';t.get('cfrInvoiceSource').onchange();
  assert.equal(t.get('cfrMailReview').style.display,'none');assert.equal(t.get('cfrKsefFields').style.display,'block');assert.equal(t.writes.length,0);assert.equal(t.calls.length,0);
 }finally{await t.window.happyDOM.abort()}
});
test('the next monthly KSeF reminder inherits the rule and waits for a new invoice',async()=>{
 const window=new Window(),document=window.document;document.body.innerHTML='<div id="modalRoot"></div>';
 const row={id:'r',user_id:'owner',title:'Leasing',is_payment:true,invoice_source:'ksef',ksef_seller_nip:'6351861297',ksef_match_text:'umowa 123',ksef_anchor_due_at:'2020-10-20T08:00:00Z',due_at:'2020-10-23T08:00:00Z',remind_at:'2020-10-23T08:00:00Z',recurrence:'monthly',status:'active',amount:123,invoice_number:'FV/OLD',ksef_number:'old',ksef_scan_status:'applied'};
 const inserted=[];const query={select(){return this;},order:async()=>({data:[row],error:null}),insert:async r=>{inserted.push(r);return {error:null};},update(){return this;},eq:async()=>({error:null})};
 const context=vm.createContext({window,document,console,Date,Intl,cfIsAdmin:()=>true,cfCompanies:[],escapeHtml:String,showToast(){},cfSupabase:{from:()=>query}});
 try{
  vm.runInContext(await readFile(new URL('../pack/reminders.js',import.meta.url),'utf8'),context);await context.cfShowReminders();document.querySelector('[data-reminder-tab="overdue"]').click();
  document.querySelector('[data-reminder-paid]').click();for(let i=0;i<10&&!inserted.length;i++)await new Promise(r=>setImmediate(r));
  assert.equal(inserted.length,1);const next=inserted[0];assert.equal(next.invoice_source,'ksef');assert.equal(next.ksef_seller_nip,'6351861297');assert.equal(next.ksef_match_text,'umowa 123');assert.equal(next.amount,null);assert.equal(next.invoice_number,null);assert.equal(next.ksef_number,null);assert.equal(next.ksef_scan_status,'waiting');assert.equal(next.mail_invoice_enabled,false);assert.match(next.ksef_anchor_due_at,/2020-11-20/);
 }finally{await window.happyDOM.abort()}
});
