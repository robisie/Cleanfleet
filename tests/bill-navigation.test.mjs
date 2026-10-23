import * as Payment from '../bill/payment-status.js';
import * as Demand from '../bill/payment-demand.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import * as C from '../bill/core.js';
test('back from details makes no request or loader; saved draft is current and dirty cancel stays in editor',async()=>{
 const calls=[],nodes=new Map();let confirms=0,answer=false,renders=0;
 const node=s=>{if(s==='#invoice-form')return null;if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}}});return nodes.get(s);};
 const context=vm.createContext({console,crypto,structuredClone,URL,URLSearchParams,location:{search:''},setTimeout:()=>0,clearTimeout(){},window:{addEventListener(){},confirm(){confirms++;return answer;}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},body:{insertAdjacentHTML(){throw Error('Unexpected blocking loader');}}}});
 const source=await readFile(new URL('../bill/app.js',import.meta.url),'utf8');const m=new vm.SourceTextModule(source+`\nrender=()=>onRender();export function setup(row,changed=false){data={invoices:[],parties:[],settings:{},counters:[]};selected=row;editor=row;view=changed?'edit':'detail';dirty=changed;}export function state(){return {view,dirty,rows:data.invoices};}export {backToInvoices,save};`,{context});context.onRender=()=>renders++;
 await m.link(spec=>{const values=spec.includes('payment-status')?Payment:spec.includes('payment-demand')?Demand:spec.includes('./core')?C:spec.includes('./api')?{restoreSession:()=>null,call:async body=>{calls.push(body.action);assert.equal(body.action,'save-draft');return {id:body.id,revision:2,status:'draft',payload:body.payload};}}:{preview(){},previewHtml(){}};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 const n=m.namespace,row={id:'draft',revision:1,status:'draft',payload:C.newInvoice()};n.setup(row);assert.equal(await n.backToInvoices(),true);assert.equal(n.state().view,'invoices');assert.deepEqual(calls,[]);assert.equal(confirms,0);assert.equal(renders,1);
 n.setup(row,true);assert.equal(await n.backToInvoices(),false);assert.equal(n.state().view,'edit');assert.equal(n.state().dirty,true);assert.deepEqual(calls,[]);
 await n.save();assert.equal(n.state().dirty,false);row.payload.lines[0].name='UNSAVED CHANGE';assert.notEqual(n.state().rows[0].payload.lines[0].name,'UNSAVED CHANGE');await n.backToInvoices();assert.equal(n.state().rows[0].revision,2);assert.deepEqual(calls,['save-draft']);assert.equal(confirms,1);
 n.setup(row,true);answer=true;await n.backToInvoices();assert.equal(n.state().view,'invoices');assert.equal(n.state().dirty,false);assert.deepEqual(calls,['save-draft']);
});

test('Pack navigation checks the parent origin and protects an unsaved Bill draft',async()=>{
 const handlers={},parent={},state={opens:0,refreshes:0,answer:false},location={origin:'https://cleanfleet.pl',search:'?invoice=old'},nodes=new Map();
 const node=s=>{if(s==='.busy-indicator')return null;if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}}});return nodes.get(s);};
 const context=vm.createContext({console,crypto,URL,URLSearchParams,structuredClone,location,history:{replaceState(_a,_b,url){location.search=new URL(url,location.origin).search;}},state,setTimeout:()=>0,clearTimeout(){},window:{parent,confirm:()=>state.answer,addEventListener:(type,fn)=>handlers[type]=fn},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},body:{insertAdjacentHTML(){}}}});
 const source=await readFile(new URL('../bill/app.js',import.meta.url),'utf8'),m=new vm.SourceTextModule(source+'\nrefresh=async()=>state.refreshes++;openRequested=async()=>state.opens++;export function changed(){dirty=true;}export function isDirty(){return dirty;}',{context});
 await m.link(spec=>{const values=spec.includes('payment-status')?Payment:spec.includes('payment-demand')?Demand:spec.includes('./core')?C:spec.includes('./api')?{restoreSession:()=>null,getSession:()=>({})}:{preview(){},previewHtml(){},unmount(){}};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 const send=(origin='https://cleanfleet.pl',source=parent,url='https://cleanfleet.pl/bill/?new=1&brand=robisie&stage=s')=>handlers.message({origin,source,data:{type:'robisie-pack-navigate',url}}),tick=()=>new Promise(resolve=>setImmediate(resolve));
 send('https://evil.invalid');send('https://cleanfleet.pl',{});await tick();assert.equal(state.opens,0);
 m.namespace.changed();send();await tick();assert.equal(state.opens,0);assert.equal(location.search,'?invoice=old');assert.equal(m.namespace.isDirty(),true);
 state.answer=true;send();await tick();assert.equal(state.opens,1);assert.equal(state.refreshes,1);assert.equal(location.search,'?new=1&brand=robisie&stage=s');assert.equal(m.namespace.isDirty(),false);
});
