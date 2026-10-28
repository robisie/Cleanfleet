import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const {Window}=await import(process.env.PROGRESS_DOM_MODULE||'happy-dom');
async function setup(){
 const window=new Window({url:'https://example.test/bill/'});globalThis.document=window.document;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const root=document.createElement('div');document.body.append(root);
 const context=vm.createContext({document,console,AbortController,DOMException,Map,Set,Intl,Date,URL,window});
 const module=new vm.SourceTextModule(await readFile(new URL('../bill/ksef.js',import.meta.url),'utf8')+'\nexport function configure(node){root=node;state=initial();integration={};}export {run,progress};',{context});
 await module.link(async spec=>{const values=await import(new URL('../bill/'+spec.replace('./','').split('?')[0],import.meta.url));return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value)},{context})});await module.evaluate();module.namespace.configure(root);return {n:module.namespace,window,root};
}
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:()=>resolve()}};
test('KSeF progress stays modal across all phases and closes only after completion',async()=>{
 const t=await setup();const first=deferred(),second=deferred();
 const work=t.n.run(async()=>{t.n.progress('Pobieranie faktur');await first.promise;t.n.progress('Sprawdzanie korekt');await second.promise;},true);
 const modal=document.querySelector('.kf-progress-dialog');assert(modal.open);assert.equal(document.body.style.overflow,'hidden');assert.match(modal.textContent,/Pobieranie faktur/);
 first.resolve();await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('.kf-progress-dialog'),modal);assert.match(modal.textContent,/Sprawdzanie korekt/);
 const escape=new t.window.Event('cancel',{cancelable:true});modal.dispatchEvent(escape);assert(escape.defaultPrevented);assert(modal.open);
 second.resolve();await work;assert.equal(document.querySelector('dialog'),null);assert.equal(document.body.style.overflow,'');await t.window.happyDOM.abort();
});
test('failure and explicit cancellation remove the blocking dialog',async()=>{
 const t=await setup();await t.n.run(async()=>{throw Error('Awaria testowa')},true);assert.equal(document.querySelector('dialog'),null);assert.match(t.root.textContent,/Awaria testowa/);
 const work=t.n.run(signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')))),true);
 document.querySelector('[data-progress-cancel]').click();await work;assert.equal(document.querySelector('dialog'),null);assert.match(t.root.textContent,/Anulowano/);await t.window.happyDOM.abort();
});

test('leaving KSeF aborts the request and releases the page lock',async()=>{
 const t=await setup();const work=t.n.run(signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')))),true);t.n.unmount();await work;assert.equal(document.querySelector('dialog'),null);assert.equal(document.body.style.overflow,'');await t.window.happyDOM.abort();
});
