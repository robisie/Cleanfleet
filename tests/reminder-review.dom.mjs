import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const {Window}=await import(process.env.SHOPPING_DOM_MODULE||'happy-dom');
test('review replaces amount, opens candidate without saving, confirmed amount returns after refresh',async()=>{
 const window=new Window(),document=window.document;document.body.innerHTML='<div id="modalRoot"></div>';
 const row={id:'review',title:'Kasia księgowa',status:'active',is_payment:true,amount:900,remind_at:'2020-01-01T09:00:00Z',due_at:'2020-01-01T09:00:00Z',mail_invoice_enabled:true,mail_scan_status:'needs_review',mail_candidate:{amount:908.64,invoice_number:'FV1',due_date:'2020-01-01'}};
 const applied={...row,id:'applied',title:'Paliwo',amount:123,mail_scan_status:'applied'};
 const blank={...row,id:'blank',amount:null};let opened=[],refresh;
 window.CFReminderForm={open:async(r,onSaved)=>{opened.push(r);refresh=onSaved;document.body.insertAdjacentHTML('beforeend','<button id="cfrMailApplyCandidate">Zastosuj te dane</button>');}};
 const context=vm.createContext({window,document,console,Date,Intl,cfIsAdmin:()=>true,cfCompanies:[],escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),cfSupabase:{from:()=>({select:()=>({order:async()=>({data:[row,applied,blank],error:null})})})}});
 vm.runInContext(await readFile(new URL('../pack/reminders.js',import.meta.url),'utf8'),context);
 await context.cfShowReminders();document.querySelector('[data-reminder-tab="overdue"]').click();
 const buttons=document.querySelectorAll('[data-reminder-review]');assert.equal(buttons.length,2);
 const card=buttons[0].closest('article');assert.equal(buttons[0].textContent,'Potwierdź dane');assert.equal(card.querySelector('.cf-reminder-amount'),null);assert(!card.querySelector('.cf-reminder-meta').textContent.includes('900'));
 assert.ok([...document.querySelectorAll('.cf-reminder-amount')].some(e=>e.textContent.includes('123')));
 buttons[0].click();await new Promise(r=>setImmediate(r));assert.equal(opened[0],row);assert.equal(row.mail_scan_status,'needs_review');assert.equal(document.activeElement.id,'cfrMailApplyCandidate');
 row.mail_scan_status='applied';row.amount=908.64;await refresh();assert.equal(document.querySelector('[data-reminder-review="review"]'),null);assert.ok([...document.querySelectorAll('.cf-reminder-amount')].some(e=>e.textContent.includes('908,64')));
 await window.happyDOM.abort();
});

test('invoice card action uses the existing Pack application tab bridge without completing a reminder',async()=>{
 const window=new Window({url:'https://cleanfleet.pl/pack/module.html?module=reminders'}),document=window.document;document.body.innerHTML='<div id="modalRoot"></div>';const sent=[];
 const parent={postMessage:(message,origin)=>sent.push({message,origin})};Object.defineProperty(window,'parent',{value:parent});
 const row={id:'invoice-task',title:'Wystawić fakturę dla dowolnej firmy',company_id:'company',status:'active',category:'invoice',remind_at:'2020-01-01T09:00:00Z'};
 const context=vm.createContext({window,document,location:window.location,URL,console,Date,Intl,cfIsAdmin:()=>true,cfCompanies:[{id:'company',name:'Dowolna firma'}],cfCompanyDisplayName:c=>c.name,escapeHtml:String,cfSupabase:{from:()=>({select:()=>({order:async()=>({data:[row],error:null})})})}});
 vm.runInContext(await readFile(new URL('../pack/reminders.js',import.meta.url),'utf8'),context);await context.cfShowReminders();document.querySelector('[data-reminder-tab="overdue"]').click();
 const action=document.querySelector('[data-reminder-invoice]');assert.equal(action.textContent,'Wystaw fakturę');action.click();
 assert.equal(sent.length,1);assert.equal(sent[0].message.type,'robisie-pack-open-url');assert.equal(sent[0].message.url,'https://cleanfleet.pl/app/');assert.equal(sent[0].origin,'https://cleanfleet.pl');assert.equal(row.status,'active');
 row.company_id=null;row.title='Wystawić fakturę';context.cfReminderOpenInvoice(row);assert.equal(sent.length,1);document.querySelector('[data-app="robisie"]').click();assert.equal(sent[1].message.url,'https://cleanfleet.pl/app/robisie/');
 await window.happyDOM.abort();
});
