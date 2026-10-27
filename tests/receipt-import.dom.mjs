import test from 'node:test';
import assert from 'node:assert/strict';
import {openReceiptImport} from '../bill/receipt-import.js';
const {Window}=await import(process.env.RECEIPT_DOM_MODULE||'happy-dom');
const data={date:'2026-10-27',number:'TEST/1',seller:'Sklep',sellerNip:'1234567890',buyerNip:'6351861297',total:25,items:[{name:'Farba',quantity:2,unit:'szt.',gross:25}]};
test('receipt dialog submits reviewed rows, exposes server errors beside save and permits retry',async()=>{
 const window=new Window();globalThis.document=window.document;globalThis.FormData=window.FormData;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let writes=0;
 const done=openReceiptImport({scan:async()=>structuredClone(data),saveLabel:'Zapisz i przypisz do inwestycji',save:async({data:received})=>{assert.deepEqual(received,data);if(++writes===1)throw Error('Testowy błąd przypisania');return 'PARAGON-test';}});
 const dialog=document.querySelector('dialog'),form=dialog.querySelector('form');
 const bytes=new Uint8Array(120);bytes.set([0x89,0x50,0x4e]);const transfer=new window.DataTransfer();transfer.items.add(new window.File([bytes],'paragon.png',{type:'image/png'}));form.elements.scan.files=transfer.files;
 await dialog.querySelector('[data-read]').onclick();
 // happy-dom applies floating remainder to decimal steps; browser precision is covered by receiptData.
 for(const input of form.querySelectorAll('[step]'))input.setAttribute('step','any');
 const save=dialog.querySelector('[data-save]');assert.equal(save.hidden,false);
 await form.onsubmit({preventDefault(){}});
 const status=dialog.querySelector('[data-status]');assert.equal(status.closest('footer'),save.closest('footer'));assert.equal(status.textContent,'Testowy błąd przypisania');assert.equal(save.disabled,false);
 await form.onsubmit({preventDefault(){}});assert.equal(await done,'PARAGON-test');assert.equal(writes,2);assert.equal(document.querySelector('dialog'),null);
 await window.happyDOM.abort();
});

test('project import preserves the whole receipt and sends only selected quantities',async()=>{
 const window=new Window();globalThis.document=window.document;globalThis.FormData=window.FormData;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const candidate={...data,total:30,items:[...data.items,{name:'Pędzel',quantity:1,unit:'szt.',gross:5}]};let saved;
 const done=openReceiptImport({selectForProject:true,scan:async()=>candidate,save:async value=>{saved=value;return 'PARAGON-selected';}});
 const dialog=document.querySelector('dialog'),form=dialog.querySelector('form');const bytes=new Uint8Array(120);bytes.set([0x89,0x50,0x4e]);const transfer=new window.DataTransfer();transfer.items.add(new window.File([bytes],'paragon.png'));form.elements.scan.files=transfer.files;
 await dialog.querySelector('[data-read]').onclick();for(const input of form.querySelectorAll('[step]'))input.setAttribute('step','any');
 const rows=dialog.querySelectorAll('[data-receipt-line]');rows[1].querySelector('[data-receipt-pick]').checked=false;form.onchange();rows[0].querySelector('[name="assignQuantity"]').value='1';
 await form.onsubmit({preventDefault(){}});assert.equal(await done,'PARAGON-selected');assert.equal(saved.data.items.length,2);assert.deepEqual(saved.entries,[{index:1,quantity:1}]);await window.happyDOM.abort();
});
