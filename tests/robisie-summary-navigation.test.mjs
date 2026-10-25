import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import * as C from '../app/robisie/core.js';import * as Auto from '../app/robisie/autosave.js';import * as Summary from '../app/robisie/earnings-summary.js';
async function setup(){
 const nodes=new Map(),listeners=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',style:{},open:false,querySelector:node,querySelectorAll:()=>[],classList:{toggle(){}}});return nodes.get(key);};let owner='owner',reader=async()=>({projects:[],earnings:[]});
 const API={restoreSession:()=>null,getSession:()=>owner?{user:{id:owner}}:null,earningsSummaryData:()=>reader()};
 const context=vm.createContext({Summary,console,crypto,structuredClone,URL,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>[]}),window:{location:{href:'https://cleanfleet.pl/app/robisie/'},addEventListener(){},scrollTo(){}},document:{body:{style:{}},documentElement:{style:{}},querySelector:node,querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners.set(key,fn)}});
 let source=await readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');source=source.replace("import('./earnings-summary.js?v=1.0.81')",'Promise.resolve(globalThis.Summary)');
 const m=new vm.SourceTextModule(source+`\nexport function setupSummary(){config={revision:1,payload:{catalog:[]}};configBaseline=structuredClone(config);view='earnings-summary';selected=null;}export {loadEarningsSummary,loginView};export const summaryState=()=>({rows:earningsRows,error:earningsError,year:earningsYear,month:earningsMonth});export function leave(){earningsGeneration++;view='dashboard';}`,{context});
 await m.link(spec=>{const values=spec.includes('core.js')?C:spec.includes('autosave')?Auto:spec.includes('api.js')?API:{};return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();await new Promise(r=>setImmediate(r));m.namespace.setupSummary();return {n:m.namespace,node,setReader:r=>reader=r,logout:()=>{owner=null;m.namespace.loginView();},change:(id,value)=>listeners.get('change')({target:{id,value}})};
}
test('summary navigation renders loading, filters, retry errors and real summary navigation entry',async()=>{
 const t=await setup();await t.n.loadEarningsSummary();assert.match(t.node('#app').innerHTML,/data-view="earnings-summary"/);assert.match(t.node('#app').innerHTML,/rs-earn-year/);t.change('rs-earn-year','2025');t.change('rs-earn-month','02');assert.equal(t.n.summaryState().year,'2025');assert.equal(t.n.summaryState().month,'02');
 t.setReader(async()=>{throw Error('Offline')});await t.n.loadEarningsSummary();assert.match(t.node('#app').innerHTML,/Offline/);assert.match(t.node('#app').innerHTML,/Spróbuj ponownie/);
});
test('late summary reads do not repopulate after leaving or logout',async()=>{
 for(const logout of [false,true]){const t=await setup();let release;t.setReader(()=>new Promise(r=>release=r));const pending=t.n.loadEarningsSummary();if(logout)t.logout();else t.n.leave();release({projects:[],earnings:[]});await pending;assert.equal(t.n.summaryState().rows,null);if(logout)assert.match(t.node('#app').innerHTML,/Logowanie administratora/);}
});
