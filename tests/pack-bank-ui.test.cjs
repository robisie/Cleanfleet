const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('automation settings preserve saved password when empty and clear entered password before sending',async()=>{
 const source=fs.readFileSync('app/priv/ui.js','utf8'),calls=[],elements={bankAutoEnabled:{checked:true},bankAutoPassword:{value:''},bankAutoSave:{},modalBody:{querySelectorAll:()=>[]}};let html='';
 const ctx=vm.createContext({generation:1,state:{},Date,db:{functions:{invoke:async(name,{body})=>{calls.push({name,body});if(body.action==='save')assert.equal(elements.bankAutoPassword.value,'');return {data:body.action==='status'?{enabled:true,password_configured:true,starts_on:'2026-11-07',files:[]}:{ok:true}};}}},$:id=>elements[id],escape:s=>String(s??''),modal:(_t,b)=>{html=b},action:fn=>fn(),close(){},notice(){}});
 vm.runInContext(source.slice(source.indexOf('async function bankRequest('),source.indexOf('function settings(){')),ctx);
 await ctx.bankSettings();assert.match(html,/Hasło zapisane/);assert.match(html,/2026-11-07/);
 await elements.bankAutoSave.onclick();assert.equal(Object.hasOwn(calls.at(-1).body,'password'),false);
 await ctx.bankSettings();elements.bankAutoPassword.value='synthetic-test-password';await elements.bankAutoSave.onclick();assert.equal(calls.at(-1).body.password,'synthetic-test-password');assert.equal(calls.at(-1).name,'pack-bank-mail');
});
