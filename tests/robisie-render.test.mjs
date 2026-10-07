import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import * as C from '../app/robisie/core.js';
test('wszystkie moduły renderują dane inwestycji i wspólne numery dokumentów',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('../app/robisie/catalog.json',import.meta.url),'utf8'));
 const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',style:{},classList:{toggle(){}},isConnected:true});return nodes.get(key);};
 const context=vm.createContext({console,crypto,structuredClone,FormData,setTimeout,clearTimeout,confirm:()=>true,fetch:async()=>({ok:true,json:async()=>catalog}),window:{addEventListener(){},scrollTo(){}},document:{querySelector:node,addEventListener(){}}});
 const source=await fs.readFile(new URL('../app/robisie/app.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source+'\nexport function testRender(row,settings){all=[structuredClone(row)];selected=structuredClone(row);config={payload:settings,revision:1};configBaseline=structuredClone(config);return [...C.MODULES.map(([key])=>key),"catalog","settings"].map(key=>{view=key;return [key,content()];});}',{context});
 await module.link(spec=>{const values=spec.includes('core')?C:{restoreSession:()=>null};const keys=Object.keys(values);return new vm.SyntheticModule(keys,function(){for(const key of keys)this.setExport(key,values[key]);},{context});});
 await module.evaluate();await new Promise(resolve=>setTimeout(resolve,10));
 const payload=C.newProject('Remont testowy','Inwestor testowy');payload.rooms=[{id:'r',name:'Kuchnia',length:4,width:3,height:2.6}];
 payload.offer=[{id:'l',roomId:'r',serviceId:'a',name:'Malowanie',category:'Ściany',unit:'m²',qty:12,price:100,included:true}];payload.works=structuredClone(payload.offer);payload.works[0].done=true;
 payload.purchases=[{id:'x',date:'2026-10-08',shop:'Test',description:'Materiał',invoice:'FV test',amount:100,charge:110,paid:true}];payload.receipts=[{id:'v',date:'2026-10-08',kind:'work',amount:500}];
 const row={id:'p',contract_number:'UUR-RS/2026/10/001',payload,revision:1};
 const results=module.namespace.testRender(row,{catalog,markup:35,company:{name:'ROBISIĘ-FER sp. z o.o.'}});
 assert.equal(results.length,13);for(const [key,html] of results){assert.ok(html.length>50,key);assert.ok(!html.includes('undefined'),key);assert.ok(!html.includes('NaN'),key);}
 assert.ok(results.find(([key])=>key==='overview')[1].includes('WYM-RS/2026/10/001'));
 assert.ok(results.find(([key])=>key==='contract')[1].includes('OFE-RS/2026/10/001/V1'));
 assert.equal(catalog.length,102);
});
